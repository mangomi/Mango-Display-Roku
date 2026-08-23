/*
 * A display served by a LIVE portal.
 *
 * Same outside as DisplayWorker - the control channel, the version
 * counter, the long-poll waiters, publishing and R2 all behave
 * identically, so the TV cannot tell which kind of worker it is talking
 * to. Inside, the impersonation is gone:
 *
 *   old: we held the display's socket, intercepted the backend's pushes,
 *        replayed them into inert designer pages through the portal's own
 *        updater functions, and guessed from outside when a repaint had
 *        landed. Every guess eventually shipped a stale screenshot.
 *
 *   now: the portal runs live and owns the socket. It tells us what
 *        changed and that it has finished drawing. We capture and publish.
 *
 * What that deletes: the WebSocket, the UPDATERS map, the warm-page pool,
 * pendingSwipes and the calendar-payload interception, the calendar
 * override file, the settings meta-probe, and the idle probe.
 *
 * The one hard rule it inherits: ONE socket per display identity. The
 * live portal holds it now, so this worker must never open its own - two
 * would fight and the backend would close one of them forever.
 */
const fs = require("fs");
const path = require("path");
const { DisplayWorker } = require("./displayWorker");
const { LivePortal } = require("./livePortal");
const { capturePage } = require("./capture");

/* Widgets the DEVICE animates natively from the manifest. A portal clock
 * ticking once a second must never cost a screenshot; the same goes for
 * countdowns and GIFs, which the TV plays from sprite sheets. This is
 * exactly why the signal carries widgetType. */
/* NOT day-rollover: the device draws the clock itself, but midnight also
 * moves the calendar's "today" highlight and its week range, and those
 * are baked into the captured image. Ignoring it left the display showing
 * yesterday until the next catch-up render. */
const DEVICE_DRAWN = new Set(["clock", "countdown", "gif"]);

/* A live portal costs real memory (~a browser tab per display) and holds
 * the display's socket, so it runs ONLY while a TV is actually watching.
 * The channel long-polls about every 55s, so three missed polls means the
 * app has gone - closed, crashed, TV switched off - and the portal should
 * go with it. It reopens on the next poll. */
const PORTAL_IDLE_MS = parseInt(process.env.PORTAL_IDLE_MS || "180000", 10);
const IDLE_SWEEP_MS = 30000;

class PaintedWorker extends DisplayWorker {
  constructor(opts) {
    super(opts);
    this.portal = null;
    this.captureQueue = new Set(); // page indexes waiting to be captured
    this.captureTimer = null;
  }

  /* the portal owns the socket - see the note at the top of the file */
  connect() {}

  async start() {
    await super.start();
    this.log("painted mode: the portal runs live and owns the socket");
    /* Deliberately NOT opened here. A worker can exist before any TV is
     * watching - the legacy env worker starts at boot, and the fleet
     * keeps workers briefly after a display goes quiet - and a portal
     * with nobody watching is a browser tab and a socket for nothing.
     * First device contact opens it. */
    this.portalIdleSweep = setInterval(() => this.closeIfUnwatched(), IDLE_SWEEP_MS);
  }

  /* The app stopped polling: close the portal, which also hands the
   * display's socket back. Cheap to reopen, and it means a powered-off TV
   * costs nothing. */
  async closeIfUnwatched() {
    if (!this.portal || this.rendering || this.interacting) return;
    const quiet = Date.now() - this.lastSeen;
    if (quiet < PORTAL_IDLE_MS) return;
    this.log("no device contact for " + Math.round(quiet / 1000) + "s - closing the live portal");
    const portal = this.portal;
    this.portal = null;
    this.portalPage = null;
    await portal.close("device stopped polling").catch(() => {});
  }

  /* Any device contact means a TV is watching: make sure the portal is
   * up. handleWait runs on every poll, so this is the reopen path too. */
  handleWait(u, res, req) {
    const launching = u.searchParams.get("launch") === "1";
    if (!this.portal) {
      this.openPortal().catch((e) => this.log("live portal failed to open:", e.message));
    } else if (launching) {
      /* the app restarted: it has no picture yet and the portal may hold
       * a stale one, so rebuild from what the portal shows now */
      this.log("app launch: recapturing every page");
      this.queueCapture(null, "app launch");
    }
    return super.handleWait(u, res, req);
  }

  /* the portal reports layout changes itself - nothing to poll for */
  probePageSettings() {}

  async openPortal() {
    if (this.portal && this.portal.ready) return this.portal;
    this.portal = new LivePortal({
      portalBase: this.env.portalBase,
      major: this.display.major,
      minor: this.display.minor,
      deviceId: this.display.deviceId,
      canvasW: this.display.canvasW,
      canvasH: this.display.canvasH,
      outW: this.display.outW,
      outH: this.display.outH,
      log: (...a) => this.log(...a),
      onChange: (message) => this.onPortalChange(message),
    });
    await this.portal.open();
    /* the portal reaching its first settled state IS the startup render */
    await this.renderAll("startup");
    return this.portal;
  }

  /* ---- the portal tells us something changed --------------------------
   * Everything that reaches the screen comes through here: backend
   * pushes, layout edits, the portal's own midnight rollover, and its
   * self-initiated refreshes - which the old architecture could not see
   * at all. */
  onPortalChange(message) {
    this.lastSignalAt = Date.now();
    const type = message.widgetType;
    if (type && DEVICE_DRAWN.has(type)) {
      this.log("change: " + message.source + "/" + type + " - device draws this, no capture");
      return;
    }
    if (message.source === "page") {
      /* We caused this: gotoPage reports when the new page has drawn, and
       * the call that asked for it is already awaiting that. Treating it
       * as a change to capture made the worker step pages, see the
       * signal, and step again - forever. */
      return;
    }
    if (message.source === "reload") {
      this.log("change: full reload - capturing every page");
      this.queueCapture(null, "portal reload");
      return;
    }
    /* The date changing affects EVERY page that shows one, not just the
     * page the portal happens to be on. */
    if (type === "day-rollover") {
      this.log("change: day rollover - capturing every page");
      this.queueCapture(null, "midnight");
      return;
    }
    const page = typeof message.pageIndex === "number" ? message.pageIndex : null;
    this.log("change: " + message.source + "/" + (type || "page") + " on page " + (page === null ? "?" : page));
    this.queueCapture(page, message.source + (type ? ":" + type : ""));
  }

  /* A burst of signals should cost one capture, not one each. */
  queueCapture(pageIndex, reason) {
    if (pageIndex === null) this.captureQueue.add("*");
    else this.captureQueue.add(pageIndex);
    this.captureReason = reason;
    if (this.captureTimer) clearTimeout(this.captureTimer);
    this.captureTimer = setTimeout(() => {
      this.captureTimer = null;
      this.runCapture().catch((e) => this.log("capture failed:", e.message));
    }, 400);
  }

  async runCapture() {
    if (this.rendering) {
      this.pendingRender = true;
      return;
    }
    const pages = this.captureQueue.has("*") ? null : [...this.captureQueue].sort();
    this.captureQueue.clear();
    const reason = this.captureReason || "change";
    if (pages === null) return this.renderAll(reason);
    return this.renderPages(pages, reason);
  }

  /* ---- capturing ------------------------------------------------------ */

  async capturePageIndex(index) {
    return capturePage(this.portal.page, {
      out: this.pageFile(index),
      url: this.portal.url(),
      width: this.display.canvasW,
      height: this.display.canvasH,
      outWidth: this.display.outW,
      outHeight: this.display.outH,
      state: { noAnimStyle: null },
      apiBase: this.env.apiBase,
      pageIndex: index,
    });
  }

  async renderPages(indexes, reason) {
    if (!this.portal || !this.portal.ready) return;
    this.rendering = true;
    const AUTO = ["startup", "scheduled", "midnight", "portal reload"];
    if (!AUTO.includes(reason)) this.setBusy(true, reason);
    const release = await this.gate.acquire();
    const t0 = Date.now();
    try {
      for (const index of indexes) {
        if (index !== this.portalPage) {
          await this.portal.gotoPage(index);
          this.portalPage = index;
        }
        await this.capturePageIndex(index);
      }
      await this.publishFromDisk(reason);
      this.log("captured page(s) " + indexes.join(",") + " in " + (Date.now() - t0) + "ms (" + reason + ")");
    } catch (e) {
      this.log("capture FAILED:", e.message);
    }
    release();
    this.rendering = false;
    this.clearBusySoon();
    if (this.pendingRender) {
      this.pendingRender = false;
      this.runCapture().catch(() => {});
    }
  }

  async renderAll(reason) {
    if (!this.portal || !this.portal.ready) return;
    const count = await this.portal.pageCount();
    const all = [];
    for (let i = 0; i < count; i++) all.push(i);
    return this.renderPages(all, reason);
  }

  /* the scheduled catch-up: cheap insurance against a signal we never got */
  async doRender(reason) {
    if (!this.portal || !this.portal.ready) {
      try {
        await this.openPortal();
        return;
      } catch (e) {
        return this.log("catch-up render could not open the portal:", e.message);
      }
    }
    return this.renderAll(reason);
  }

  clearBusySoon() {
    if (!this.busy) return;
    const held = Date.now() - this.busySince;
    const clear = () => {
      if (!this.rendering && !this.pendingRender) this.setBusy(false, "capture published");
    };
    if (held >= 3000) clear();
    else setTimeout(clear, 3000 - held);
  }

  /* ---- gestures ------------------------------------------------------- */

  async handleInteract(u, res) {
    this.lastSeen = Date.now();
    const reply = (code, body) => {
      res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    };
    const type = u.searchParams.get("type") || "tap";
    const pageIndex = parseInt(u.searchParams.get("page") || "0", 10);
    const x = parseFloat(u.searchParams.get("x") || "0");
    const y = parseFloat(u.searchParams.get("y") || "0");
    const id = u.searchParams.get("id") || null;

    try {
      await this.openPortal();
    } catch (e) {
      return reply(500, { ok: false, error: e.message });
    }
    if (type === "warm") return reply(200, { ok: true, session: "live" });

    /* the TV can be on a different page than the portal is showing */
    if (pageIndex !== this.portalPage) {
      await this.portal.gotoPage(pageIndex);
      this.portalPage = pageIndex;
    }

    this.log("interact:", type, "at", Math.round(x) + "," + Math.round(y), "page", pageIndex, id ? "id " + id : "");
    const swipe = type === "swipeup" || type === "swipedown";
    if (swipe) this.setBusy(true, type);
    let result;
    try {
      result = swipe
        ? await this.portal.swipe(type, x, y, id)
        : await this.portal.tap(x, y, id);
    } catch (e) {
      this.setBusy(false, "gesture failed");
      return reply(500, { ok: false, error: e.message });
    }
    if (!result.handled) {
      this.setBusy(false, "gesture ignored");
      return reply(200, result);
    }

    /* No socket interception, no payload waiting: the portal handles the
     * gesture itself and tells us when it has finished redrawing. A tap
     * needs no capture - the device already drew its own tick, and the
     * portal's own refresh will report anything else that changed. */
    if (swipe) {
      await this.portal.waitForQuiet(900, 15000);
      await this.renderPages([pageIndex], "interaction");
      this.setBusy(false, "swipe done");
    }
    return reply(200, result);
  }

  async stop(why) {
    if (this.portalIdleSweep) clearInterval(this.portalIdleSweep);
    if (this.captureTimer) clearTimeout(this.captureTimer);
    if (this.portal) await this.portal.close(why).catch(() => {});
    this.portal = null;
    return super.stop(why);
  }
}

module.exports = { PaintedWorker, DEVICE_DRAWN };
