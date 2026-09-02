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

/* the spinner follows reasonRank: every user-driven render (rank 3)
 * shows it - see renderPages */

/* Changes that are display-wide, not per page. Gesture settings decide
 * which checkboxes exist (targets are extracted per page), overlay
 * settings live in the manifest's display-level effects block - which is
 * read from page 0's capture - and orientation reshapes everything. A
 * single-page capture would publish only part of any of these. */
// "structural" = a layout edit that changed page structure (widget
// deleted + blank page pruned, new page created, background flags):
// page indexes shifted, so every page recaptures
const DISPLAY_WIDE = new Set(["gesture", "overlay", "orientation", "structural"]);

/* A live portal costs real memory (~a browser tab per display) and holds
 * the display's socket, so it runs ONLY while a TV is actually watching.
 * The channel long-polls about every 55s, so three missed polls means the
 * app has gone - closed, crashed, TV switched off - and the portal should
 * go with it. It reopens on the next poll. */
const PORTAL_IDLE_MS = parseInt(process.env.PORTAL_IDLE_MS || "180000", 10);
const IDLE_SWEEP_MS = 30000;

/* one-shot JSON GET; resolves null on transport failure, like fleet's */
function getJson(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https:") ? require("https") : require("http");
    const req = mod.get(url, { timeout: 10000 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => resolve(null));
  });
}

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

  /* Close the current portal and boot a fresh one. Chained so two
   * reopens cannot interleave, and portalPage is cleared because a new
   * portal starts on page 0. */
  /* The portal announces that the orientation changed, not what it is;
   * the backend record has the value. When the geometry actually changes
   * the live portal must be reopened - its viewport and URL both follow
   * it - and every page recaptured. Otherwise it is an ordinary
   * display-wide recapture. */
  async refreshOrientation(reason) {
    let orientation = null;
    try {
      const r = await getJson(this.env.apiBase + "mirrors/deviceId/" + encodeURIComponent(this.deviceId));
      const o = r && r.object;
      if (o) orientation = parseInt(o.mirrorOrientation, 10) || 0;
    } catch (e) {
      this.log("orientation lookup failed:", e.message);
    }
    if (orientation !== null && this.applyOrientation(orientation)) {
      const d = this.display;
      this.log(
        "orientation -> rotation " + d.rotation + " (canvas " + d.canvasW + "x" + d.canvasH +
          ", out " + d.outW + "x" + d.outH + ") - reopening the portal",
      );
      await this.reopenPortal("orientation change");
    }
    this.log("change: " + reason + " - capturing every page");
    this.queueCapture(null, reason);
  }

  /* Safety net for marquees that start AFTER the still was taken.
   *
   * The scroll directive decides "does this overflow?" from a single
   * measurement, and the widget's font-size pass, late data or a loading
   * image can make the content overflow moments later. The directive only
   * ever writes the running marquees into window.mmScrollCells - it does
   * not signal painted mode - so a list that began scrolling five seconds
   * after our capture stayed a static picture on the TV until something
   * unrelated changed on that page (external tester, 2026-09-02). Portal
   * PR #71 fixes the measurement itself; this covers any remaining late
   * start whatever its cause: one look at the running set a moment after
   * each capture, and a quiet re-capture if it changed. */
  async armLateMarqueeCheck() {
    if (!this.portal || !this.portal.ready || !this.portal.page) return;
    const sig = async () =>
      this.portal.page.evaluate(() =>
        (window.mmScrollCells || [])
          .filter((c) => c && c.el && document.documentElement.contains(c.el))
          .map((c) => [c.widgetId, c.date, Math.round(c.boxHeight), Math.round(c.innerHeight), c.speed].join(":"))
          .sort()
          .join("|"),
      );
    const before = await sig().catch(() => null);
    if (before === null) return;
    if (this.lateMarqueeTimer) clearTimeout(this.lateMarqueeTimer);
    this.lateMarqueeTimer = setTimeout(async () => {
      this.lateMarqueeTimer = null;
      const after = await sig().catch(() => null);
      if (after === null || after === before) return;
      if (after === this.lateMarqueeSig) return; /* already re-captured for this set */
      this.lateMarqueeSig = after;
      this.log("change: a marquee started after the capture - capturing every page (late marquee)");
      this.queueCapture(null, "late marquee");
    }, 1500);
  }

  reopenPortal(why) {
    this.portalReopen = (this.portalReopen || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const stale = this.portal;
        this.portal = null;
        this.portalPage = null;
        if (stale) await stale.close(why).catch(() => {});
        await this.openPortal();
      });
    return this.portalReopen;
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
      /* cold launch: the portal was closed (app off for more than a few
       * minutes). The reload it is about to announce IS this launch, so
       * label it accordingly - rank 3, spinner, staged, not preemptible. */
      if (launching) this.launchReload = true;
      this.openPortal().catch((e) => {
        this.log("live portal failed to open:", e.message);
        if (launching) {
          this.interacting = false;
          this.setBusy(false, "portal failed to open");
        }
      });
    } else if (launching) {
      /* The app restarted. Recapturing what the portal currently shows is
       * not enough: a portal left open from the previous session holds
       * that session's state - a calendar someone swiped three months
       * ahead, a stepped page - and the user would relaunch into it
       * (Dave, 2026-08-30). Reload the portal from scratch so a launch
       * always shows the display as the portal freshly renders it.
       *
       * Guarded by age: duplicate launch polls, or an app crash-looping,
       * must not thrash the portal. A portal that has just booted is
       * already fresh, so recapture instead. */
      const age = Date.now() - (this.portalOpenedAt || 0);
      if (age > 20000) {
        this.log("app launch: reloading the portal from scratch");
        this.launchReload = true;
        this.reopenPortal("app launch").catch((e) => {
          this.log("launch reload failed:", e.message);
          this.launchReload = false;
          this.queueCapture(null, "app launch");
        });
      } else {
        this.log("app launch: portal is " + Math.round(age / 1000) + "s old - recapturing every page");
        this.queueCapture(null, "app launch");
      }
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

  /* Serialises opening. Two callers arriving while this.portal is null -
   * a poll and an /interact during a reopen, say - would each build a
   * portal, and two portals for one display means two backend sockets,
   * one of which the backend closes forever. */
  async openPortal() {
    if (this.portal && this.portal.ready) return this.portal;
    if (this.portalOpening) return this.portalOpening;
    this.portalOpening = this.openPortalOnce().finally(() => {
      this.portalOpening = null;
    });
    return this.portalOpening;
  }

  async openPortalOnce() {
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
        embed: this.display.rotation !== 0,
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
    /* how long this portal has been up, so a launch can tell a stale
     * session's portal from one that just booted for this very launch */
    this.portalOpenedAt = Date.now();
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
      /* a reload we asked for on app launch is a launch, not a relayout:
       * rank 3 (spinner, not preemptible) and no page mirroring - the TV
       * starts on page 0 by itself */
      const launchBoot = this.launchReload === true;
      this.launchReload = false;
      const reason = launchBoot ? "app launch" : this.sawFirstReload ? "layout change" : "startup";
      /* a user-driven reload (relayout, page add/reorder/delete) boots
       * the portal onto a page - usually the first. The TV mirrors it
       * (Dave 2026-08-28: "whatever page the portal lands on needs to
       * reflect on the Roku side"), and that page is captured and
       * published FIRST so the user sees it in seconds while the rest
       * render behind it. Background reloads (startup) leave the TV
       * alone - nobody is watching an edit then. */
      const landing = typeof message.pageIndex === "number" ? message.pageIndex : 0;
      /* Whatever page the portal landed on is captured and published
       * FIRST, with the rest following moments later. On a launch that
       * means the TV replaces its cached picture seconds after the
       * portal boots instead of waiting out every page (Dave,
       * 2026-08-30). */
      this.priorityPage = landing;
      /* Only a user-driven relayout also steers the TV to that page: on
       * a launch the TV starts on page 0 by itself. */
      if (this.sawFirstReload && !launchBoot) {
        this.pendingShowPage = landing;
        this.showPageUntil = Date.now() + 15000;
      }
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
      /* A self-reload is also how an orientation change arrives: the
       * portal reloads into (or out of) its rotation host BEFORE its
       * "orientation" signal can be delivered, so that signal is never
       * seen (2026-09-02: the record said rotated, the worker still
       * rendered landscape, the display froze). Re-read the record on
       * every reload after boot; refreshOrientation reopens the portal
       * only if the geometry actually changed, then captures. */
      if (!launchBoot && reason !== "startup") {
        this.refreshOrientation(reason).catch((e) => {
          this.log("orientation check failed:", e.message);
          this.queueCapture(null, reason);
        });
        return;
      }
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
    if (type === "orientation") {
      this.refreshOrientation("orientation settings").catch((e) =>
        this.log("orientation refresh failed:", e.message),
      );
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
    /* a layout edit navigates the portal to the page being edited; the
     * published manifest carries that page so the TV mirrors it - the
     * user watches the page they are changing (Dave, 2026-08-28) */
    if (message.source === "layout" && typeof message.pageIndex === "number") {
      this.priorityPage = message.pageIndex;
      this.pendingShowPage = message.pageIndex;
      /* sticky for a window, not one publish: the layout save drags
       * trailing socket ticks behind it (calendar/todo refreshes) that
       * republish within the second, and the TV's single fetch sees
       * whichever manifest is newest - a one-shot flag lost the race.
       * 45s: a structural burst (new page -> capture-all with films)
       * spreads its publishes over ~20-40s and outlived 15s */
      this.showPageUntil = Date.now() + 45000;
    }
    const reason = message.source + (type ? ":" + type : "");
    if (!pages.length) this.queueCapture(null, reason);
    for (const page of pages) this.queueCapture(page, reason);
  }

  /* User-driven work outranks background work: the rank decides which
   * reason labels a coalesced capture (spinner + updateReason follow
   * it), and whether an in-flight render is worth preempting. */
  reasonRank(reason) {
    if (!reason) return 1;
    if (
      reason.startsWith("layout") ||
      reason === "interaction" ||
      reason === "app launch" ||
      reason.endsWith(" settings")
    ) {
      return 3;
    }
    if (reason.startsWith("socket:")) return 2;
    return 1; /* startup, scheduled, midnight, probes */
  }

  /* A burst of signals should cost one capture, not one each. */
  queueCapture(pageIndex, reason) {
    const fresh = this.captureQueue.size === 0;
    if (pageIndex === null) this.captureQueue.add("*");
    else this.captureQueue.add(pageIndex);
    /* coalesced bursts keep the HIGHEST-ranked reason - a user edit
     * arriving among socket ticks must not be relabeled as background
     * (it lost its spinner and its showPage semantics that way) */
    if (fresh || this.reasonRank(reason) >= this.reasonRank(this.captureReason)) {
      this.captureReason = reason;
    }
    /* a user-driven change does not wait behind a background render:
     * the render in flight is told to stop after its current page and
     * the queue reruns immediately (its remaining pages re-render on
     * the next catch-up anyway) */
    if (this.rendering && this.reasonRank(reason) > (this.renderRank || 3)) {
      this.abortRender = true;
      this.log("preempting in-flight render for '" + reason + "'");
    }
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
    const priority = typeof this.priorityPage === "number" ? this.priorityPage : null;
    this.priorityPage = null;
    if (pages === null) return this.renderAll(reason, priority);
    return this.renderPages(pages, reason, priority);
  }

  /* ---- capturing ------------------------------------------------------ */

  async capturePageIndex(index, deferFilming) {
    const manifest = await capturePage(this.portal.page, {
      out: this.pageFile(index),
      deviceId: this.display.deviceId,
      url: this.portal.url(),
      width: this.display.canvasW,
      height: this.display.canvasH,
      rotation: this.display.rotation,
      outWidth: this.display.outW,
      outHeight: this.display.outH,
      state: { noAnimStyle: null },
      apiBase: this.env.apiBase,
      pageIndex: index,
      deferFilming: deferFilming === true,
    });
    if (manifest && manifest.filmPending) this.filmPages.add(index);
    return manifest;
  }

  async renderPages(indexes, reason, priorityPage) {
    if (!this.portal || !this.portal.ready) return;
    this.rendering = true;
    this.renderRank = this.reasonRank(reason);
    this.abortRender = false;
    let aborted = false;
    /* pages whose sprite sheets still need filming; capturePageIndex
     * fills this when it defers */
    this.filmPages = new Set();
    /* The spinner means "the change YOU made is being applied", so it
     * belongs to user-initiated work only: a gesture on the TV, or an
     * edit someone just made in the webapp. Data arriving on its own -
     * weather, quotes, a calendar syncing from Google - must stay silent,
     * or the display spins at people all day for changes they did not
     * make. It also has nowhere sensible to point: the spinner sits on
     * the widget a gesture touched, and background updates have no
     * gesture, so it fell back to the middle of the screen. */
    if (this.renderRank >= 3) this.setBusy(true, reason);
    const release = await this.gate.acquire();
    const t0 = Date.now();
    try {
      /* Staged publish: when one page is what the user is (about to be)
       * looking at, capture and publish IT first - the manifest's
       * pageMeta comes from the fresh capture so page counts are right
       * immediately, other pages ride one version stale for the seconds
       * until stage two lands, and the TV is parked on the fresh page
       * anyway (showPage + 30s dwells make the stale window unreachable
       * in practice). */
      let remaining = indexes;
      if (
        typeof priorityPage === "number" &&
        indexes.length > 1 &&
        indexes.includes(priorityPage)
      ) {
        if (priorityPage !== this.portalPage) {
          await this.portal.gotoPage(priorityPage);
          this.portalPage = priorityPage;
        }
        await this.capturePageIndex(priorityPage, true);
        /* the jump instruction must outlive however long this render
         * queued and however long the rest takes: slide its window at
         * every publish instead of trusting the arm-time clock */
        if (typeof this.pendingShowPage === "number") this.showPageUntil = Date.now() + 15000;
        await this.publishFromDisk(reason);
        this.log(
          "captured page " + priorityPage + " first in " + (Date.now() - t0) + "ms (" + reason + ", staged)",
        );
        /* the page the user cares about is up: the spinner's promise is
         * kept, the rest happens quietly */
        this.clearBusySoon(true);
        remaining = indexes.filter((i) => i !== priorityPage);
      }
      for (const index of remaining) {
        if (this.abortRender) {
          aborted = true;
          break;
        }
        if (index !== this.portalPage) {
          await this.portal.gotoPage(index);
          this.portalPage = index;
        }
        await this.capturePageIndex(index, true);
      }
      if (aborted) {
        /* no publish: the preempting render follows in milliseconds and
         * publishes everything, including whatever landed on disk here */
        this.log("render preempted after " + (Date.now() - t0) + "ms (" + reason + ") - rerunning queue");
      } else {
        if (typeof this.pendingShowPage === "number") this.showPageUntil = Date.now() + 15000;
        await this.publishFromDisk(reason);
        this.log("captured page(s) " + indexes.join(",") + " in " + (Date.now() - t0) + "ms (" + reason + ")");
        this.armLateMarqueeCheck().catch(() => {});

        /* The page is on screen; now pay for the animations. Filming a
         * fresh cell geometry is tens of seconds, which is why it did
         * not block the publish above - nobody is waiting on this. */
        const toFilm = [...this.filmPages];
        this.filmPages.clear();
        for (const index of toFilm) {
          if (this.abortRender) break;
          const f0 = Date.now();
          if (index !== this.portalPage) {
            await this.portal.gotoPage(index);
            this.portalPage = index;
          }
          await this.capturePageIndex(index, false);
          await this.publishFromDisk("sprite film");
          this.log("filmed sprites for page " + index + " in " + (Date.now() - f0) + "ms");
        }
      }
    } catch (e) {
      this.log("capture FAILED:", e.message);
    }
    release();
    this.rendering = false;
    this.abortRender = false;
    if (!aborted) this.clearBusySoon();
    if (this.pendingRender) {
      this.pendingRender = false;
      this.runCapture().catch(() => {});
    }
  }

  async renderAll(reason, priorityPage) {
    if (!this.portal || !this.portal.ready) return;
    const count = await this.portal.pageCount();
    const all = [];
    for (let i = 0; i < count; i++) all.push(i);
    return this.renderPages(all, reason, priorityPage);
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

  clearBusySoon(force) {
    if (!this.busy) return;
    const held = Date.now() - this.busySince;
    const clear = () => {
      /* force: a staged publish already put the page the user cares
       * about on screen - the spinner's promise is kept even though the
       * remaining pages are still rendering */
      if (force || (!this.rendering && !this.pendingRender)) {
        this.setBusy(false, force ? "priority page published" : "capture published");
      }
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
    /* Each gesture gets a token. A previous gesture's wait can still be
     * pending when the next one starts (its waiter is resolved by the
     * redraw, but a timeout that outlives it fires anyway), and the
     * stale timeout used to clear THIS gesture's flags: seen live
     * 2026-08-28, swipe #1's 15s timeout landed 65ms into swipe #2,
     * cleared gestureInFlight, and swipe #2's redraw was then filed as
     * ordinary data - no "interaction" reason, no imageOnly, so the TV
     * held its one-swipe lock for the full cooldown and the spinner
     * lied about being finished. */
    const myGesture = (this.gestureSeq = (this.gestureSeq || 0) + 1);
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
      if (!done && this.gestureSeq === myGesture) {
        /* the portal never announced a redraw: nothing will capture, so
         * do not leave the TV spinning until the catch-up render. Only
         * when this is still the CURRENT gesture - a later one owns the
         * flags now. */
        this.gestureInFlight = false;
        this.setBusy(false, "no redraw signal");
      } else if (!done) {
        this.log("stale redraw timeout for a superseded gesture - ignored");
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
