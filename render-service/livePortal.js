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
    this.page = await this.browser.newPage({
      viewport: { width: canvasW, height: canvasH },
      /* renders at canvas size, outputs at the TV's resolution */
      deviceScaleFactor: (this.opts.outW || canvasW) / canvasW,
      hasTouch: true,
    });

    await this.installRoutes();
    await this.installSignalBridge();

    this.page.on("pageerror", (e) => this.log("[portal error]", e.message));
    this.page.on("close", () => {
      this.ready = false;
    });

    const first = this.nextSignal(60000);
    await this.page.goto(this.url(), { waitUntil: "domcontentloaded", timeout: 60000 });
    const hello = await first;
    if (!hello) throw new Error("portal never signalled ready - is painted mode present?");
    /* the boot burst continues after the first signal (widgets report as
     * they draw), so let it finish before anyone screenshots */
    await this.waitForQuiet(1200, 20000);
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
    if (message.seq <= this.lastSeq) return;
    this.lastSeq = message.seq;
    const waiters = this.waiters.splice(0);
    for (const w of waiters) {
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
   * Never throws: a display must not stall because one signal was late. */
  nextSignal(ms) {
    return new Promise((resolve) => {
      const w = { resolve };
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

  /* Step to a page and wait for it to draw. One live portal serves every
   * page, instead of booting a browser per page as the old renderer did. */
  async gotoPage(index) {
    const settled = this.nextSignal(15000);
    const ok = await this.page.evaluate(
      (i) => (window.mmScreenshot ? window.mmScreenshot.gotoPage(i) : false),
      index,
    );
    if (!ok) return false;
    await settled;
    await this.waitForQuiet(800, 10000);
    return true;
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
