/*
 * A live portal, per display.
 *
 * The portal runs here exactly as it runs on an Android TV: its own
 * socket, its own timers, its own reloads. We do not push data into it,
 * we do not replay its update handlers, and we do not guess when it has
 * finished drawing - it tells us (?painted=true, see the portal repo's
 * js/service/paintedMode.js). Our whole job is: listen, screenshot,
 * publish.
 *
 * This replaces the designer-mode pipeline, where the portal was inert
 * (preview mode opens no socket) and the service had to impersonate a
 * display: hold the socket, intercept the backend's replies, push
 * payloads through the portal's own updaters, and infer from outside when
 * a repaint had landed. Every one of those inferences eventually shipped
 * a stale screenshot.
 *
 * Two things this owns that the portal deliberately does not:
 *
 *  - BLOCKING MEDIA the device paints itself. Page backgrounds, slideshow
 *    photos and visual-overlay sprites are drawn natively on the TV from
 *    URLs in the manifest, so downloading them here is pure waste:
 *    measured 2400KB -> 37KB per page. This belongs to whoever owns the
 *    browser, because in-page interception leaks (a media prefetcher
 *    using fetch/XHR, stylesheet rules, and parser-created elements all
 *    bypass any property hook).
 *
 *  - RESOLUTION. The portal has no responsive reflow, so it must always
 *    lay out at 1920x1080. Rather than the old iframe-and-CSS-transform
 *    harness, the page renders at that size with a device scale factor of
 *    outW/1920, so the screenshot comes out at the TV's real resolution
 *    with text rasterised natively - same result, no harness.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

/* Media the device draws itself. Weather icons are deliberately absent:
 * they are kilobytes, their intrinsic size drives layout, and the capture
 * pipeline films them from this page to build its sprite sheets. */
const BLOCKED_MEDIA = /\/visualoverlays\/|myimages\.mangodisplay\.com|\/backgrounds\//;

/* TEMPORARY: serve the portal's painted-mode files from disk until
 * Mangomirror-Portal PR #68 is merged. Point PORTAL_PREVIEW_DIR at a
 * checkout of that branch's WebContent. The service refuses to start in
 * painted mode without it rather than silently running the deployed
 * portal, which has no painted mode and would look like everything works
 * while nothing ever signals. Delete this block when #68 lands. */
const PREVIEW_DIR = process.env.PORTAL_PREVIEW_DIR || "";
const PREVIEW_FILES = [
  { match: /\/js\/service\/paintedMode\.js/, file: "js/service/paintedMode.js" },
  { match: /\/js\/controller\/mainController\.js/, file: "js/controller/mainController.js" },
];

class LivePortal {
  /*
   * opts: { portalBase, major, minor, deviceId, outW, outH,
   *         canvasW, canvasH, onChange(message), log(...) }
   */
  constructor(opts) {
    this.opts = opts;
    this.log = opts.log || console.log;
    this.browser = null;
    this.page = null;
    this.ready = false;
    this.lastSeq = 0;
    this.waiters = [];
  }

  url() {
    return (
      this.opts.portalBase +
      "?major=" + this.opts.major +
      "&minor=" + this.opts.minor +
      "&macaddress=" + this.opts.deviceId +
      "&painted=true"
    );
  }

  async open() {
    if (this.page && !this.page.isClosed()) return "reused";
    if (PREVIEW_DIR && !fs.existsSync(path.join(PREVIEW_DIR, PREVIEW_FILES[0].file))) {
      throw new Error("PORTAL_PREVIEW_DIR is set but has no painted-mode files: " + PREVIEW_DIR);
    }

    this.browser = await chromium.launch({
      args: [
        /* a live portal must keep running while it is not the foreground
         * tab, or its timers throttle and updates silently stop */
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    });

    const canvasW = this.opts.canvasW || 1920;
    const canvasH = this.opts.canvasH || 1080;
    const pageOpts = {
      viewport: { width: canvasW, height: canvasH },
      /* renders at canvas size, outputs at the TV's resolution */
      deviceScaleFactor: (this.opts.outW || canvasW) / canvasW,
      hasTouch: true,
    };
    /* The page runs in the DISPLAY's timezone, not the container's. The
     * portal's whole notion of "now" - the day-rollover timer, the
     * calendar's today highlight, every moment()/new Date() - follows
     * the browser clock, which on a real TV sits in the user's home. A
     * UTC container flipped everyone's "today" at UTC midnight (8pm US
     * Eastern). The zone comes from the display's own settings; see
     * paintedWorker.openPortal for how it is learned and corrected. */
    if (this.opts.timezoneId) pageOpts.timezoneId = this.opts.timezoneId;
    try {
      this.page = await this.browser.newPage(pageOpts);
    } catch (e) {
      if (!pageOpts.timezoneId) throw e;
      this.log("timezone '" + pageOpts.timezoneId + "' rejected (" + e.message + ") - opening without it");
      delete pageOpts.timezoneId;
      this.page = await this.browser.newPage(pageOpts);
    }

    await this.installRoutes();
    await this.installSignalBridge();
    await this.installEffectHide();

    this.page.on("pageerror", (e) => this.log("[portal error]", e.message));
    this.page.on("close", () => {
      this.ready = false;
    });

    /* The portal announces "reload" exactly once per boot, and only
     * after every deferred widget on the shown page has reported drawn
     * (paintedMode holds the announcement until then - completion
     * tracking, not timing). That one signal IS boot-complete; there is
     * no burst to wait out. */
    const first = this.nextSignal(60000, (m) => m.source === "reload");
    await this.page.goto(this.url(), { waitUntil: "domcontentloaded", timeout: 60000 });
    const hello = await first;
    if (!hello) throw new Error("portal never signalled ready - is painted mode present?");
    this.ready = true;
    this.log("live portal ready (" + hello.source + ", " + (await this.pageCount()) + " page(s))");
    return "opened";
  }

  async installRoutes() {
    await this.page.route(BLOCKED_MEDIA, (route) =>
      /* 204 rather than abort: a blocked prefetch should look answered,
       * not failed, so the portal's own error paths stay quiet */
      route.fulfill({ status: 204, body: "" }),
    );
    if (!PREVIEW_DIR) return;
    this.log("*** serving painted-mode portal files from " + PREVIEW_DIR + " (pre-merge) ***");
    for (const preview of PREVIEW_FILES) {
      await this.page.route(preview.match, (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body: fs.readFileSync(path.join(PREVIEW_DIR, preview.file), "utf8"),
        }),
      );
    }
    /* the deployed index.html does not load paintedMode.js yet */
    await this.page.addInitScript({ path: path.join(PREVIEW_DIR, PREVIEW_FILES[0].file) });
  }

  /* Effect elements are born hidden. hideEffects (capture-time inline
   * styles) can only cover elements that exist the moment it runs;
   * leaves, hearts and dropping spiders RESPAWN every second, so
   * anything born between that pass and a page's screenshot was being
   * captured - and since BLOCKED_MEDIA force-fails their art, it was
   * captured as a Chromium broken-image tile (found by the tvOS
   * session, 2026-08-26, EFFECT_TILES_BUG.md). A CSS rule has no such
   * timing window, and addInitScript survives the portal's
   * self-reloads, which would drop a one-time <style> injection. Only
   * painted sessions run this file, so real portals keep their
   * effects. */
  async installEffectHide() {
    /* two tags with different lifecycles: effect hiding is permanent,
     * the weather settle is lifted while the cell-weather film rolls -
     * see nativeWidgets for both inventories */
    const nw = require("./nativeWidgets");
    const tags = [
      { id: "mm-capture-hygiene", css: nw.effectHideCss() },
      { id: "mm-weather-settle", css: nw.weatherSettleCss() },
    ];
    await this.page.addInitScript((list) => {
      const add = () => {
        for (const t of list) {
          const s = document.createElement("style");
          s.id = t.id;
          s.textContent = t.css;
          document.head.appendChild(s);
        }
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add);
      else add();
    }, tags);
  }

  async installSignalBridge() {
    await this.page.exposeFunction("__mmSignal", (message) => this.onSignal(message));
    await this.page.addInitScript(() => {
      window.addEventListener("mm-screenshot-ready", (e) => {
        try {
          window.__mmSignal(e.detail);
        } catch (err) {}
      });
    });
  }

  onSignal(message) {
    if (!message || typeof message.seq !== "number") return;
    /* seq only increases within one document. A LOWER seq means the
     * portal reloaded itself (restart-display push, orientation change)
     * and started counting again - resync, or every signal after a
     * self-reload would be dropped as stale and the display would go
     * quiet until the catch-up render. */
    if (message.seq < this.lastSeq) this.lastSeq = 0;
    if (message.seq === this.lastSeq) return;
    this.lastSeq = message.seq;
    const waiters = this.waiters.splice(0);
    for (const w of waiters) {
      if (w.pred && !w.pred(message)) {
        this.waiters.push(w); /* not what this waiter is waiting for */
        continue;
      }
      clearTimeout(w.timer);
      w.resolve(message);
    }
    if (this.opts.onChange) {
      try {
        this.opts.onChange(message);
      } catch (e) {
        this.log("onChange failed:", e.message);
      }
    }
  }

  /* Resolves once the portal has stopped signalling for quietMs - a boot
   * or a layout change lands as a BURST (the layout applies, then each
   * widget reports as it draws; a calendar arrives ~2.4s after the rest),
   * so capturing on the first signal photographs a page that is still
   * filling in. This waits out the stream rather than inspecting the DOM:
   * still the portal telling us, just all of what it said.
   * Returns the last signal seen, or null if none arrived at all. */
  async waitForQuiet(quietMs, capMs) {
    const quiet = quietMs || 1200;
    const deadline = Date.now() + (capMs || 20000);
    let last = null;
    while (Date.now() < deadline) {
      const next = await this.nextSignal(Math.min(quiet, deadline - Date.now()));
      if (!next) break;
      last = next;
    }
    return last;
  }

  /* Resolves on the portal's next settled state, or null at the timeout.
   * Never throws: a display must not stall because one signal was late.
   * An optional predicate keeps waiting through signals it rejects - a
   * caller waiting for its OWN operation to finish must not be satisfied
   * by unrelated data landing in between. */
  nextSignal(ms, pred) {
    return new Promise((resolve) => {
      const w = { resolve, pred };
      w.timer = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        resolve(null);
      }, ms || 15000);
      this.waiters.push(w);
    });
  }

  async pageCount() {
    try {
      return await this.page.evaluate(() => (window.mmScreenshot ? window.mmScreenshot.pageCount() : 1));
    } catch (e) {
      return 1;
    }
  }

  /* what zone the page is actually running in vs what the display's
   * settings say it should be - the caller reconciles them */
  async timezones() {
    try {
      return await this.page.evaluate(() => ({
        effective: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
        display: window.mmScreenshot && window.mmScreenshot.timeZoneId ? window.mmScreenshot.timeZoneId() : null,
      }));
    } catch (e) {
      return null;
    }
  }

  /* Step to a page and wait for it to draw. One live portal serves every
   * page, instead of booting a browser per page as the old renderer did.
   * Wait for THIS SWAP'S completion signal: source "page" AND the target
   * page index (a swap signal reports the page that finished entering).
   * Anything looser let the capture photograph the crossfade - a data
   * push landing mid-fade, or the PREVIOUS step's own late "page" signal
   * - and the picture was mostly the OLD page. That is how every
   * "page 1" published as page 0. */
  async gotoPage(index) {
    /* 20s: the page announcement itself waits for the target page's
     * deferred widgets (calendar init) with a 10s safety cap */
    const settled = this.nextSignal(20000, (m) => m.source === "page" && m.pageIndex === index);
    const ok = await this.page.evaluate(
      (i) => (window.mmScreenshot ? window.mmScreenshot.gotoPage(i) : false),
      index,
    );
    if (!ok) return false;
    /* that signal IS the completion - the portal emits it only once the
     * swap is fully on screen (transitions, images, spinners settled).
     * No quiet-timer after it: the portal is the only readiness source. */
    await settled;
    return true;
  }

  /* ---- gestures -----------------------------------------------------
   * The portal is LIVE here, so its own click and swipe bindings work -
   * no invoking Angular handlers by hand, and no intercepting the
   * backend's socket reply to work out when the result arrived. Dispatch
   * the gesture, then wait for the portal to say it has redrawn.
   *
   * Coordinates arrive in canvas space (1920x1080), which is also this
   * page's CSS viewport, so they need no scaling.
   * ------------------------------------------------------------------ */

  async tap(x, y, id) {
    const hit = await this.page.evaluate(
      (pt) => {
        const boxes = [...document.querySelectorAll("input.todocheckbox")].filter(
          (c) => getComputedStyle(c).visibility !== "hidden",
        );
        const taskOf = (c) => {
          const sc = window.angular.element(c).scope();
          const model = (c.getAttribute("ng-model") || "").replace(/\.status\s*$/, "");
          return sc && model ? sc.$eval(model) : null;
        };
        /* identity beats geometry: the list reshuffles as items complete,
         * so the row the user pressed may have moved since that render */
        let el = null;
        if (pt.id) {
          el = boxes.find((c) => {
            const t = taskOf(c);
            return t && String(t.id) === String(pt.id);
          });
        }
        if (!el) {
          const pad = 14;
          el = boxes.find((c) => {
            const r = c.getBoundingClientRect();
            return pt.x >= r.x - pad && pt.x <= r.right + pad && pt.y >= r.y - pad && pt.y <= r.bottom + pad;
          });
        }
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      },
      { x, y, id },
    );
    if (!hit) return { handled: false, reason: "no checkbox for id/point" };
    /* a real click: the portal updates its model, calls the backend and
     * redraws itself, exactly as it does for a finger on a touch TV */
    await this.page.mouse.click(hit.x, hit.y);
    return { handled: true, kind: "tap" };
  }

  async swipe(direction, x, y, id) {
    const type = direction === "swipeup" ? "swipeup" : "swipedown";
    const fired = await this.page.evaluate(
      ({ pt, type }) => {
        const els = [...document.querySelectorAll("[ng-swipe-up][ng-swipe-down]")].filter(
          (e) => getComputedStyle(e).visibility !== "hidden" && e.offsetParent !== null,
        );
        let el = null;
        if (pt.id) {
          el = els.find((e) => {
            let w = window.angular.element(e).scope();
            while (w && !w.widgetData) w = w.$parent;
            return w && w.widgetData && String(w.widgetData.widgetSettingId) === String(pt.id);
          });
        }
        if (!el) {
          el = els.find((e) => {
            const r = e.getBoundingClientRect();
            return pt.x >= r.x && pt.x <= r.right && pt.y >= r.y && pt.y <= r.bottom;
          });
        }
        if (!el) return { ok: false, reason: "no swipe surface for id/point" };
        const attr = type === "swipeup" ? "ng-swipe-up" : "ng-swipe-down";
        const expr = el.getAttribute(attr);
        if (!expr) return { ok: false, reason: "no " + attr + " on surface" };
        const sc = window.angular.element(el).scope();
        if (!sc) return { ok: false, reason: "no scope on surface" };
        /* the marker updateCalendarView checks for: it means "move the
         * date range", not "scroll the widget" */
        const evt = {
          type: type,
          target: el,
          pointerType: "touch",
          mangoMirrorRemoteGesture: "arrowDoubleTap",
          preventDefault() {},
          stopPropagation() {},
        };
        const run = () => sc.$eval(expr, { $event: evt });
        const inDigest = !!(sc.$root && sc.$root.$$phase) || !!sc.$$phase;
        if (inDigest) run();
        else sc.$apply(run);
        return { ok: true };
      },
      { pt: { x, y, id }, type },
    );
    if (!fired.ok) return { handled: false, reason: fired.reason };
    return { handled: true, kind: "calendar", direction: type };
  }

  async close(why) {
    this.ready = false;
    const browser = this.browser;
    this.browser = null;
    this.page = null;
    if (!browser) return;
    this.log("live portal closing (" + why + ")");
    try {
      await browser.close();
    } catch (e) {}
  }
}

module.exports = { LivePortal, BLOCKED_MEDIA };
