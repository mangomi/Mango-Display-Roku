/*
 * Warm render pages.
 *
 * A cold render costs ~2.2s per page before it captures anything: node
 * starts, Chromium launches, the portal boots and fetches its data. None
 * of that has to happen twice. A real display loads the portal ONCE and
 * then just applies whatever the backend pushes down the socket for the
 * rest of the day - so this keeps a page per display page loaded and does
 * the same thing, using the portal's own update handlers.
 *
 * The fast path only runs for pushes we fully understand. Anything else
 * falls back to a normal cold render, which is always correct.
 */
const { chromium } = require("playwright");
const { openHarness, capturePage, wireDiagnostics } = require("./capture");

// socket payload key -> the portal's own handler for it, taken from
// mainController's own socket dispatch so a warm page ends up in exactly
// the state a real display would be in
const UPDATERS = {
  refreshCalenderData: "updateCalendarData",
  refreshMealPlan: "updateCalendarData",
  refreshQuotes: "updateQuotes",
  refreshNotes: "updateNotes",
  refreshWeather: "updateWeatherData",
  refreshClock: "updateClock",
};

// a warm page is reloaded now and then regardless: it drifts (the portal
// keeps its own timers running) and nothing should stay up for days
const FAST_PATH_ENABLED = false;

const MAX_USES = 25;
const MAX_AGE_MS = 30 * 60 * 1000;

class RenderPool {
  constructor(opts) {
    this.opts = opts; // { designerUrl, pageFile, canvasW, canvasH, outW, outH, apiBase }
    this.browser = null;
    this.pages = new Map(); // index -> { page, state, url, uses, born }
  }

  // OFF pending verification. The path works - it ran a real push end to
  // end in 10.2s - but that was BEFORE pre-warming and before the
  // calendar wait was scoped to pages that actually show one, and the
  // re-measure never completed. Until it is timed properly this must not
  // be live: runFast holds the render lock, so a hang would freeze every
  // render rather than just being slow. Flip to true to resume testing.
  canHandle(dataKeys) {
    if (!FAST_PATH_ENABLED) return false;
    return dataKeys.length > 0 && dataKeys.every((k) => UPDATERS[k]);
  }

  async browserInstance() {
    if (this.browser && this.browser.isConnected()) return this.browser;
    this.browser = await chromium.launch();
    return this.browser;
  }

  async pageFor(index, reload) {
    let e = this.pages.get(index);
    if (e && (e.page.isClosed() || e.uses >= MAX_USES || Date.now() - e.born > MAX_AGE_MS)) {
      await this.drop(index);
      e = null;
    }
    if (e && !reload) return e;
    if (e) await this.drop(index);

    const b = await this.browserInstance();
    const page = await b.newPage({
      viewport: { width: this.opts.outW, height: this.opts.outH },
      hasTouch: true,
    });
    wireDiagnostics(page);
    const url = this.opts.designerUrl(index);
    const state = await openHarness(page, {
      url,
      width: this.opts.canvasW,
      height: this.opts.canvasH,
      outWidth: this.opts.outW,
      outHeight: this.opts.outH,
    });
    e = { page, state, url, uses: 0, born: Date.now() };
    this.pages.set(index, e);
    return e;
  }

  async drop(index) {
    const e = this.pages.get(index);
    this.pages.delete(index);
    if (e) await e.page.close().catch(() => {});
  }

  // Push socket data into a warm page through the portal's own handlers.
  // Returns false if the page can't take it, so the caller can fall back
  // to a cold render rather than publishing a half-updated screen.
  async applyTo(index, payload) {
    const e = await this.pageFor(index, false);
    const frame = e.page.frames().find((f) => f.url().includes("designer=true"));
    if (!frame) return false;
    const ok = await frame.evaluate(
      ({ data, map }) => {
        const el = document.querySelector("[ng-app], body");
        if (!el || !window.angular) return false;
        let sc = window.angular.element(el).scope();
        // walk to the scope that owns the update handlers
        const need = Object.values(map);
        const has = (s) => s && need.some((fn) => typeof s[fn] === "function");
        if (!has(sc)) {
          const inj = window.angular.element(el).injector();
          if (!inj) return false;
          let found = null;
          const walk = (s) => {
            if (!s || found) return;
            if (has(s)) return void (found = s);
            walk(s.$$childHead);
            walk(s.$$nextSibling);
          };
          walk(inj.get("$rootScope"));
          sc = found;
        }
        if (!sc) return false;
        let applied = 0;
        for (const key of Object.keys(data)) {
          const fn = map[key];
          if (!fn || typeof sc[fn] !== "function") continue;
          try {
            sc[fn](data[key]); // these run their own $apply - never wrap them
            applied++;
          } catch (err) {}
        }
        // does THIS page actually show a calendar? only then is the
        // portal's deferred repaint worth waiting for
        const calVisible = [...document.querySelectorAll("[ng-swipe-up][ng-swipe-down]")].some(
          (n) => getComputedStyle(n).visibility !== "hidden" && n.offsetParent !== null,
        );
        return { applied, calVisible };
      },
      { data: payload, map: UPDATERS },
    );
    if (!ok || !ok.applied) return false;
    // A calendar repaint sits behind a 2s timeout inside the portal. Every
    // other updater is immediate, and a page with no calendar on it should
    // never pay that wait - which is what made the first version of this
    // slower than the cold render it was meant to replace.
    const slow = ok.calVisible && (payload.refreshCalenderData || payload.refreshMealPlan);
    await e.page.waitForTimeout(slow ? 2600 : 350);
    return true;
  }

  async capture(index) {
    const e = await this.pageFor(index, false);
    e.uses++;
    await capturePage(e.page, {
      out: this.opts.pageFile(index),
      url: e.url,
      width: this.opts.canvasW,
      height: this.opts.canvasH,
      outWidth: this.opts.outW,
      outHeight: this.opts.outH,
      state: e.state,
      apiBase: this.opts.apiBase,
    });
  }

  // Load the pages before anything needs them, so the first real update
  // is not the one that pays for the portal boot.
  async prewarm(count) {
    for (let i = 0; i < count; i++) {
      try {
        await this.pageFor(i, false);
      } catch (e) {
        console.error("prewarm page " + i + " failed:", e.message);
      }
    }
  }

  async closeAll() {
    for (const i of [...this.pages.keys()]) await this.drop(i);
    if (this.browser) await this.browser.close().catch(() => {});
    this.browser = null;
  }
}

module.exports = { RenderPool, UPDATERS };
