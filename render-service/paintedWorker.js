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

/* Only these raise the TV's spinner - see renderPages */
const SHOWS_SPINNER = new Set(["interaction", "layout change"]);

/* Changes that are display-wide, not per page. Gesture settings decide
 * which checkboxes exist (targets are extracted per page), overlay
 * settings live in the manifest's display-level effects block - which is
 * read from page 0's capture - and orientation reshapes everything. A
 * single-page capture would publish only part of any of these. */
const DISPLAY_WIDE = new Set(["gesture", "overlay", "orientation"]);

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
    if (launching) {
      /* the channel reports WHY the previous run ended (GetLastExitInfo,
       * Roku OS 13+): crash vs low-memory kill vs the OS's ~2h idle
       * auto-exit vs a person pressing Home. Logged next to the poll
       * history, which already gives each session's start and duration. */
      const lastExit = u.searchParams.get("lastexit");
      if (lastExit) {
        const at = u.searchParams.get("lastexitat");
        this.log("app launch: previous session ended '" + lastExit + "'" + (at ? " at " + at : ""));
      }
      /* The app just started and is showing whatever it cached - old
       * layouts, old events - while a fresh portal boots and renders.
       * Raise the spinner NOW, before this very reply goes out, so the
       * user sees the display is fetching rather than done. It clears
       * when the launch render publishes (clearBusySoon); interacting
       * keeps the janitor from clearing it during the portal boot,
       * when nothing is rendering yet. */
      this.setBusy(true, "app launch");
      this.interacting = true;
    }
    if (!this.portal) {
      this.openPortal().catch((e) => {
        this.log("live portal failed to open:", e.message);
        if (launching) {
          this.interacting = false;
          this.setBusy(false, "portal failed to open");
        }
      });
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

  timezoneFile() {
    return path.join(this.dir, "timezone");
  }

  savedTimezone() {
    try {
      const tz = fs.readFileSync(this.timezoneFile(), "utf8").trim();
      return tz || null;
    } catch (e) {
      return null;
    }
  }

  async openPortal() {
    if (this.portal && this.portal.ready) return this.portal;
    const openWith = async (timezoneId) => {
      this.portal = new LivePortal({
        portalBase: this.env.portalBase,
        major: this.display.major,
        minor: this.display.minor,
        deviceId: this.display.deviceId,
        canvasW: this.display.canvasW,
        canvasH: this.display.canvasH,
        outW: this.display.outW,
        outH: this.display.outH,
        timezoneId,
        log: (...a) => this.log(...a),
        onChange: (message) => this.onPortalChange(message),
      });
      await this.portal.open();
    };
    await openWith(this.savedTimezone());
    /* The display's timezone is IN the widget list the portal just
     * loaded, but the browser's zone must be set before the page exists
     * - so the first boot ever learns it, persists it, and reopens once
     * in the right zone. Every later open starts correct. */
    const zones = await this.portal.timezones();
    if (zones && zones.display && zones.display !== zones.effective) {
      this.log("portal timezone: display is " + zones.display + ", page ran in " + zones.effective + " - reopening in the display's zone");
      try {
        fs.writeFileSync(this.timezoneFile(), zones.display);
      } catch (e) {}
      const stale = this.portal;
      this.portal = null;
      await stale.close("timezone correction").catch(() => {});
      await openWith(zones.display);
      const check = await this.portal.timezones();
      if (check && check.display && check.display !== check.effective) {
        /* unknown zone name: stay up rather than loop - dates follow the
         * container's clock until the zone is fixed in settings */
        this.log("portal timezone: '" + check.display + "' did not take (page runs in " + check.effective + ") - continuing");
      }
    }
    /* No direct startup render: the portal's reload announcement queues
     * it through onPortalChange like every other capture. A second
     * renderAll here doubled every boot. */
    return this.portal;
  }

  /* A relayout may carry a CHANGED display timezone (the user edited it
   * in settings). Persist and close; the TV's next poll reopens the
   * portal in the new zone and its boot re-renders everything. */
  async checkPortalTimezone() {
    if (!this.portal || !this.portal.ready || this.rendering) return;
    const zones = await this.portal.timezones();
    if (!zones || !zones.display || zones.display === zones.effective) return;
    this.log("portal timezone changed to " + zones.display + " (page runs in " + zones.effective + ") - closing to reopen in the new zone");
    try {
      fs.writeFileSync(this.timezoneFile(), zones.display);
    } catch (e) {}
    const stale = this.portal;
    this.portal = null;
    this.portalPage = null;
    await stale.close("timezone changed").catch(() => {});
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
    /* A gesture we dispatched redraws the portal, and THIS announcement
     * is that redraw. Same capture as any other signal - only the reason
     * differs: "interaction" publishes imageOnly, so the TV swaps just
     * the page image instead of rebuilding every native layer (which
     * restarts GIFs and blanks them while sheets reload). A reload
     * outranks it: that is a fresh start, handled below as one. */
    if (this.gestureInFlight && message.source !== "reload") {
      this.gestureInFlight = false;
      const page = typeof message.pageIndex === "number" ? message.pageIndex : null;
      this.log("change: " + message.source + "/" + (type || "?") + " - the dispatched gesture's redraw");
      this.queueCapture(page, "interaction");
      return;
    }
    if (message.source === "reload") {
      /* the first one is the portal booting; later ones mean someone
       * applied a new layout, which IS worth showing a spinner for */
      const reason = this.sawFirstReload ? "layout change" : "startup";
      this.sawFirstReload = true;
      /* a relayout (or a portal self-reload) starts over on page 0, so
       * whatever page we last stepped to is no longer where the portal is.
       * It also supersedes any gesture in flight - the fresh start's
       * capture-everything covers the gesture's result too. */
      this.portalPage = null;
      this.gestureInFlight = false;
      /* a relayout may carry a changed display timezone (no-op during
       * boot: the portal is not ready yet and openPortal reconciles) */
      this.checkPortalTimezone().catch(() => {});
      this.log("change: full reload - capturing every page (" + reason + ")");
      this.queueCapture(null, reason);
      return;
    }
    /* The date changing affects EVERY page that shows one, not just the
     * page the portal happens to be on. */
    if (type === "day-rollover") {
      this.log("change: day rollover - capturing every page");
      this.queueCapture(null, "midnight");
      return;
    }
    if (type && DISPLAY_WIDE.has(type)) {
      this.log("change: " + type + " settings - capturing every page");
      this.queueCapture(null, type + " settings");
      return;
    }
    /* the portal reports the page each changed widget LIVES on
     * (pageIndexes); older signals carry only the visible page */
    const pages =
      Array.isArray(message.pageIndexes) && message.pageIndexes.length
        ? message.pageIndexes.filter((p) => typeof p === "number")
        : typeof message.pageIndex === "number"
          ? [message.pageIndex]
          : [null];
    const label = pages.length && pages[0] !== null ? pages.join(",") : "?";
    this.log("change: " + message.source + "/" + (type || "page") + " on page " + label);
    const reason = message.source + (type ? ":" + type : "");
    if (!pages.length) this.queueCapture(null, reason);
    for (const page of pages) this.queueCapture(page, reason);
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
    /* captures are starting: `rendering` takes over guarding the busy
     * janitor from here, so the launch hold (see handleWait) can end */
    this.interacting = false;
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
    /* The spinner means "the change YOU made is being applied", so it
     * belongs to user-initiated work only: a gesture on the TV, or an
     * edit someone just made in the webapp. Data arriving on its own -
     * weather, quotes, a calendar syncing from Google - must stay silent,
     * or the display spins at people all day for changes they did not
     * make. It also has nowhere sensible to point: the spinner sits on
     * the widget a gesture touched, and background updates have no
     * gesture, so it fell back to the middle of the screen. */
    if (SHOWS_SPINNER.has(reason)) this.setBusy(true, reason);
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
    /* THE RULE (Dave): the portal is the ONLY source of
     * ready-to-snapshot information. The gesture path dispatches the
     * gesture and waits for the portal's own redraw announcement -
     * no quiet-timers, and no capture of its own: that announcement
     * flows through onPortalChange like every other signal and queues
     * THE capture (reason "interaction" via gestureInFlight). An
     * earlier version captured after a 900ms quiet heuristic, which
     * elapsed inside the calendar's silent loading window and baked
     * its blurred "Loading" spinner overlay into the published image. */
    const redraw = swipe ? this.portal.nextSignal(15000, (m) => m.source !== "page") : null;
    if (swipe) {
      this.setBusy(true, type);
      this.gestureInFlight = true;
    }
    let result;
    try {
      result = swipe
        ? await this.portal.swipe(type, x, y, id)
        : await this.portal.tap(x, y, id);
    } catch (e) {
      this.gestureInFlight = false;
      this.setBusy(false, "gesture failed");
      return reply(500, { ok: false, error: e.message });
    }
    if (!result.handled) {
      this.gestureInFlight = false;
      this.setBusy(false, "gesture ignored");
      return reply(200, result);
    }

    /* No socket interception, no payload waiting: the portal handles the
     * gesture itself and tells us when it has finished redrawing. A tap
     * needs no capture - the device already drew its own tick, and the
     * portal's own refresh will report anything else that changed. */
    if (swipe) {
      const done = await redraw;
      if (!done) {
        /* the portal never announced a redraw: nothing will capture, so
         * do not leave the TV spinning until the catch-up render */
        this.gestureInFlight = false;
        this.setBusy(false, "no redraw signal");
      }
      /* busy clears when the queued interaction capture publishes */
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
