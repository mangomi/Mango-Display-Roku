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

const FAST_PATH_ENABLED = true;

// a warm page is reloaded now and then regardless: it drifts (the portal
// keeps its own timers running) and nothing should stay up for days
const MAX_USES = 25;
const MAX_AGE_MS = 30 * 60 * 1000;

class RenderPool {
  constructor(opts) {
    this.opts = opts; // { designerUrl, pageFile, canvasW, canvasH, outW, outH, apiBase }
    this.browser = null;
    this.pages = new Map(); // index -> { page, state, url, uses, born }
  }

  // Verified on a real push: 4.0s for a calendar update against 5.8s for
  // the cold render it replaces, and roughly 1.5s when no calendar is
  // involved. The flag stays here because runFast holds the render lock -
  // if this path ever starts hanging, turning it off restores a service
  // that is merely slow instead of frozen.
  canHandle(dataKeys) {
    if (!FAST_PATH_ENABLED) return false;
    return dataKeys.length > 0 && dataKeys.every((k) => UPDATERS[k]);
  }

  async browserInstance() {
    if (this.browser && this.browser.isConnected()) return this.browser;
    // Several pages are open at once and only one can be foreground.
    // Chromium throttles timers in background pages, which stalls the
    // portal's own deferred repaint - the update applies but the page
    // never redraws, so the capture keeps publishing the old view.
    this.browser = await chromium.launch({
      args: [
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    });
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
      stateDir: this.opts.stateDir,
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
  // Note for anyone timing this: repeated identical swipes do NOT advance
  // the range. The dispatch page needs ~2s to settle before it can compute
  // the next one, so firing them back to back makes the backend resend the
  // same range - which looks exactly like a stale capture and is not one.
  // Leave several seconds between swipes when measuring.
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

        // Read the BEFORE state from the calendar the payload TARGETS.
        // "The first visible calendar" is a different widget whenever a
        // page holds more than one, and watching it meant the repaint
        // wait below was satisfied by a widget that never changed.
        const widgetOf = (n) => {
          let w = window.angular.element(n).scope();
          while (w && !w.widgetData) w = w.$parent;
          return w && w.widgetData ? w : null;
        };
        const cals = [...document.querySelectorAll("[ng-swipe-up][ng-swipe-down]")].filter(
          (n) => getComputedStyle(n).visibility !== "hidden" && n.offsetParent !== null,
        );
        const wantIds = data.refreshCalenderData ? Object.keys(data.refreshCalenderData).map(String) : [];
        const calBefore =
          cals.find((n) => {
            const w = widgetOf(n);
            return w && wantIds.indexOf(String(w.widgetData.widgetSettingId)) >= 0;
          }) || null;
        window.__mmCalWatch = calBefore;
        let alreadyThere = false;
        if (calBefore && data.refreshCalenderData) {
          const w = widgetOf(calBefore);
          const want = w && data.refreshCalenderData[String(w.widgetData.widgetSettingId)];
          if (want && w.widgetData.data) {
            alreadyThere = String(w.widgetData.data.initial_date) === String(want.initial_date);
          }
        }

        // Watch the whole document for mutations so the capture can wait
        // for the page to go QUIET, not merely for the first flicker of
        // change. Applying a payload updates the model almost instantly;
        // the widgets keep redrawing for a second or more afterwards, and
        // photographing that gap published half-drawn pages - a blank
        // quote panel, a clipped header, and a calendar without the event
        // that triggered the update.
        window.__mmLastMutation = Date.now();
        if (!window.__mmMo) {
          window.__mmMo = new MutationObserver(() => {
            window.__mmLastMutation = Date.now();
          });
          window.__mmMo.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
          });
        }

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
        const cal = [...document.querySelectorAll("[ng-swipe-up][ng-swipe-down]")].find(
          (n) => getComputedStyle(n).visibility !== "hidden" && n.offsetParent !== null,
        );
        return {
          applied,
          calVisible: !!cal,
          alreadyThere,
          calText: cal ? (cal.innerText || "").replace(/\s+/g, " ").slice(0, 60) : "",
        };
      },
      { data: payload, map: UPDATERS },
    );
    if (!ok || !ok.applied) return false;
    const wanted = payload.refreshCalenderData
      ? Object.values(payload.refreshCalenderData).map((w) => w.initial_date).join(",")
      : "";
    // A calendar repaint sits behind a 2s timeout inside the portal. Every
    // other updater is immediate, and a page with no calendar on it should
    // never pay that wait - which is what made the first version of this
    // slower than the cold render it was meant to replace.
    // A payload that matches what the page already shows repaints nothing,
    // so waiting for a change just burns the full timeout - which is most
    // of the cost of a duplicate push.
    const slow = ok.calVisible && (payload.refreshCalenderData || payload.refreshMealPlan) && !ok.alreadyThere;
    if (slow) {
      // The targeted widget must actually show new text. The portal
      // defers its calendar repaint behind a ~2s timeout, so this is a
      // wait for something we know is coming, not a blind sleep.
      await frame
        .waitForFunction(
          (prev) => {
            const n = window.__mmCalWatch;
            return n && (n.innerText || "").replace(/\s+/g, " ").slice(0, 60) !== prev;
          },
          ok.calText,
          { timeout: 4000, polling: 100 },
        )
        .catch(() => {});
      const now = await frame
        .evaluate(() => {
          const n = window.__mmCalWatch;
          if (!n) return "none";
          let w = window.angular.element(n).scope();
          while (w && !w.widgetData) w = w.$parent;
          return w && w.widgetData && w.widgetData.data ? String(w.widgetData.data.initial_date) : "?";
        })
        .catch(() => "err");
      console.log("pool page " + index + ": wanted " + wanted + ", page now on " + now);
    }
    // Whatever the payload was, do not photograph a page that is still
    // redrawing. The updaters return the moment the MODEL changes; the
    // widgets carry on rendering well past that, and capturing the gap
    // published half-drawn pages. Wait for the DOM to hold still.
    await this.settle(frame, e.page);
    return true;
  }

  // Resolves once the page has gone QUIET_MS without a DOM mutation, or
  // at the cap. A ticking clock mutates once a second, so a short quiet
  // window is reachable; anything that never settles still captures at
  // the cap rather than hanging the update.
  async settle(frame, page, quietMs, capMs) {
    const QUIET = quietMs || 400;
    const CAP = capMs || 3000;
    const t0 = Date.now();
    await frame
      .waitForFunction(
        (quiet) => Date.now() - (window.__mmLastMutation || 0) >= quiet,
        QUIET,
        { timeout: CAP, polling: 100 },
      )
      .catch(() => {});
    const waited = Date.now() - t0;
    if (waited >= CAP - 100) console.log("settle: page never went quiet, capturing at the " + CAP + "ms cap");
    return waited;
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
