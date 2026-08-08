/*
 * Live interaction session.
 *
 * Gestures that change what the portal SHOWS (ticking a task, flipping a
 * calendar month) can't be reproduced on the device - that behaviour is
 * the portal's own code. So the service keeps a portal page warm for a
 * display, replays the gesture into it exactly as a touch TV would, and
 * re-captures. The portal stays the single source of truth.
 *
 * Sessions are opened on demand (the TV signals when a user starts
 * interacting), reused while they keep pressing, and closed after an
 * idle timeout - so the cost is per active user, not per display.
 */
const { chromium } = require("playwright");
const { openHarness, capturePage, wireDiagnostics } = require("./capture");

const IDLE_MS = 120000;

class InteractionSession {
  constructor(opts) {
    this.opts = opts; // { designerUrl(pageIndex), canvasW, canvasH, outW, outH, pageFile, apiBase }
    this.browser = null;
    this.page = null;
    this.state = null;
    this.pageIndex = null;
    this.busy = false;
    this.idleTimer = null;
  }

  get isOpen() {
    return this.page !== null;
  }

  touchIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.close("idle"), IDLE_MS);
  }

  // warm the page for a display page; safe to call repeatedly
  async open(pageIndex) {
    this.touchIdle();
    // a page can be closed under us (idle timeout racing an incoming
    // gesture, or a crashed browser) - never hand back a dead handle
    if (this.page && this.page.isClosed()) {
      this.page = null;
      this.browser = null;
      this.pageIndex = null;
    }
    if (this.page && this.pageIndex === pageIndex) return "reused";
    if (this.page) await this.close("page change");

    const url = this.opts.designerUrl(pageIndex);
    // Same reason as the render pool: a headless page that is not the
    // foreground tab gets its timers throttled, which stalls the portal's
    // own deferred repaint. The dispatch page then never updates its
    // range, so every swipe recomputes the SAME next one.
    this.browser = await chromium.launch({
      args: [
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    });
    this.page = await this.browser.newPage({
      viewport: { width: this.opts.outW, height: this.opts.outH },
      hasTouch: true,
    });
    wireDiagnostics(this.page);
    this.state = await openHarness(this.page, {
      url,
      width: this.opts.canvasW,
      height: this.opts.canvasH,
      outWidth: this.opts.outW,
      outHeight: this.opts.outH,
    });
    this.pageIndex = pageIndex;
    this.url = url;
    return "opened";
  }

  async close(why) {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (!this.browser) return;
    console.log("session closing (" + why + ")");
    const b = this.browser;
    this.browser = null;
    this.page = null;
    this.state = null;
    this.pageIndex = null;
    try {
      await b.close();
    } catch (e) {}
  }

  // canvas coords (1920x1080 design space) -> harness page pixels
  toPagePoint(x, y) {
    return [x * (this.opts.outW / this.opts.canvasW), y * (this.opts.outH / this.opts.canvasH)];
  }

  // Preview/designer mode deliberately disables the portal's click
  // bindings, so a synthetic click never reaches its handlers. Instead we
  // resolve the control under the pointer and run the row's OWN ng-click
  // expression against its OWN scope - exactly what Angular does on a
  // real click, so the portal builds the payload and calls the API
  // itself. Evaluating the expression rather than reconstructing the call
  // is what makes chores, to-dos and sub-tasks all work: each template
  // passes a different argument list (chores carry key/label/value,
  // to-dos pass null, sub-tasks bind `subTask` instead of `todo`).
  //
  // A real checkbox click flips the model first (the browser's native
  // toggle) and the handler then sends that new state, so the flip has to
  // be mirrored here or the portal dutifully re-sends the old value.
  async tap(x, y, id) {
    const frame = this.page.frames().find((f) => f.url().includes("designer=true"));
    if (!frame) throw new Error("portal frame missing");

    const result = await frame.evaluate(
      (pt) => {
        // captures hide published checkboxes (the device draws its own)
        document.querySelectorAll("input.todocheckbox").forEach((el) => {
          if (el.style.opacity === "0") el.style.opacity = "";
        });
        const boxes = [...document.querySelectorAll("input.todocheckbox")].filter(
          (c) => getComputedStyle(c).visibility !== "hidden", // other pages
        );
        // every row reports the task ITS OWN binding points at - a
        // sub-task row repeats over `subTask`, so asking the scope for
        // `todo` would hand back its parent task
        const taskOf = (c) => {
          const s = window.angular.element(c).scope();
          const m = (c.getAttribute("ng-model") || "").replace(/\.status\s*$/, "");
          return s && m ? s.$eval(m) : null;
        };
        // Identity beats geometry: the list can reshuffle between the
        // render the device is showing and this live page (a completed
        // task drops out and the rest move up), so match the task itself
        // and fall back to the pointer position only if it isn't found.
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
        if (!el) return { handled: false, reason: "no target for id/point" };

        const sc = window.angular.element(el).scope();
        const modelExpr = (el.getAttribute("ng-model") || "").replace(/\.status\s*$/, "");
        const clickExpr = el.getAttribute("ng-click") || "";
        if (!sc || !modelExpr || !clickExpr) return { handled: false, reason: "row has no binding" };

        const task = sc.$eval(modelExpr);
        if (!task) return { handled: false, reason: "row binding resolves to nothing" };
        const kind = /'chores'|"chores"/.test(clickExpr) ? "chores" : "todo";
        const next = !task.status;
        const evt = { preventDefault() {}, stopPropagation() {}, target: el };
        sc.$apply(() => {
          sc.$eval(modelExpr + ".status = " + (next ? "true" : "false"));
          sc.$eval(clickExpr, { $event: evt });
        });
        return { handled: true, kind, taskId: task.taskId, title: task.taskTitle, status: next };
      },
      { x, y, id },
    );

    if (!result.handled) {
      console.log("tap ignored:", result.reason);
      return result;
    }
    console.log(
      "tap:", result.kind, JSON.stringify(result.title || result.taskId),
      "->", result.status ? "complete" : "not complete",
    );
    // give the portal's API call and its own DOM update time to land
    await this.page.waitForTimeout(1500);
    return result;
  }

  // A swipe on a widget (calendar: show more dates). Preview mode blocks
  // real touch input, so - exactly as the portal's own remote pointer
  // does - we emit the Hammer event straight at the element's hammer
  // instance. The `arrowDoubleTap` marker matters: updateCalendarView
  // checks for it and skips the scroll-the-widget path in favour of
  // moving the date range, which is what the remote gesture means.
  async swipe(dir, x, y, id) {
    const frame = this.page.frames().find((f) => f.url().includes("designer=true"));
    if (!frame) throw new Error("portal frame missing");
    const type = dir === "swipeup" ? "swipeup" : "swipedown";

    const before = await frame.evaluate(
      (pt) => {
        const els = [...document.querySelectorAll("[ng-swipe-up][ng-swipe-down]")].filter(
          (e) => getComputedStyle(e).visibility !== "hidden",
        );
        let el = null;
        if (pt.id) {
          el = els.find((e) => {
            const s = window.angular.element(e).scope();
            let w = s;
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
        if (!el) return { handled: false, reason: "no swipe surface for id/point" };
        if (!el.hammerInstance) return { handled: false, reason: "no hammer instance on surface" };
        window.__mmSwipeEl = el;
        return { handled: true, text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 400) };
      },
      { x, y, id },
    );
    if (!before.handled) {
      console.log("swipe ignored:", before.reason);
      return before;
    }

    await frame.evaluate((t) => {
      const el = window.__mmSwipeEl;
      el.hammerInstance.emit(t, {
        type: t,
        target: el,
        pointerType: "touch",
        mangoMirrorRemoteGesture: "arrowDoubleTap",
      });
    }, type);

    // Return the moment the gesture is dispatched. This page will never
    // repaint on its own: the portal asks the backend, and the answer
    // comes back over the socket - which a preview-mode page does not
    // have. Waiting for a change here just burned six seconds per swipe
    // before timing out. The caller waits on the socket payload instead.
    console.log("swipe:", type, "dispatched, waiting on the socket payload");
    return { handled: true, kind: "calendar", direction: type };
  }

  // Apply a socket payload the watcher received on the page's behalf.
  // The portal has its own handler for exactly this data, so a real
  // display and this page end up in the same state - we're just carrying
  // the message across, since a preview-mode page has no socket of its
  // own to receive it on.
  async applyCalendar(refreshCalenderData) {
    const frame = this.page.frames().find((f) => f.url().includes("designer=true"));
    if (!frame) throw new Error("portal frame missing");
    const r = await frame.evaluate((data) => {
      const el = document.querySelector("[ng-swipe-up][ng-swipe-down]");
      if (!el) return { ok: false, reason: "no calendar on page" };
      let sc = window.angular.element(el).scope();
      while (sc && !sc.updateCalendarData) sc = sc.$parent;
      if (!sc) return { ok: false, reason: "updateCalendarData not on scope chain" };
      const before = (el.innerText || "").replace(/\s+/g, " ").slice(0, 60);
      // Call it bare. updateCalendarData runs its own $scope.$apply(), so
      // wrapping it throws $rootScope:inprog - which aborts the function
      // midway, after the new data lands but BEFORE it schedules the
      // repaint, leaving the model on the new range and the view on the
      // old one.
      try {
        sc.updateCalendarData(data);
      } catch (e) {
        return { ok: false, reason: "updateCalendarData threw: " + e.message };
      }
      return { ok: true, widgets: Object.keys(data), before };
    }, refreshCalenderData);
    if (!r.ok) {
      console.log("calendar payload not applied:", r.reason);
      return false;
    }

    // the repaint is deferred behind a 2s $timeout inside the portal, so
    // wait for the view itself to move rather than guessing at a delay
    let moved = false;
    try {
      await frame.waitForFunction(
        (prev) => {
          const el = document.querySelector("[ng-swipe-up][ng-swipe-down]");
          return el && (el.innerText || "").replace(/\s+/g, " ").slice(0, 60) !== prev;
        },
        r.before,
        { timeout: 10000 },
      );
      moved = true;
    } catch (e) {}
    await this.page.waitForTimeout(600);
    console.log(
      "calendar payload applied to widget(s)", r.widgets.join(","),
      moved ? "- view moved" : "- view did NOT move",
    );
    return moved;
  }

  // re-capture the live page into the same files the watcher publishes
  async recapture() {
    return await capturePage(this.page, {
      out: this.opts.pageFile(this.pageIndex),
      url: this.url,
      width: this.opts.canvasW,
      height: this.opts.canvasH,
      outWidth: this.opts.outW,
      outHeight: this.opts.outH,
      state: this.state,
      apiBase: this.opts.apiBase,
    });
  }

  // One interaction, serialised: nothing else may drive the page at once.
  //
  // Deliberately does NOT re-render afterwards. The device draws the
  // checkbox itself and ticks it on the press, so the screen is already
  // right; a forced re-render would only republish the page image (a
  // visible reload) for a change the user can already see. The backend
  // pushes its own refresh for the change, which re-renders through the
  // normal path and brings across anything native drawing can't show
  // (reward points, the task leaving the list).
  async interact(action) {
    if (this.busy) throw new Error("session busy");
    this.busy = true;
    this.touchIdle();
    try {
      await this.open(action.page || 0);
      if (action.type === "tap") {
        return await this.tap(action.x, action.y, action.id);
      }
      if (action.type === "swipeup" || action.type === "swipedown") {
        return await this.swipe(action.type, action.x, action.y, action.id);
      }
      throw new Error("unsupported action: " + action.type);
    } finally {
      this.busy = false;
      this.touchIdle();
    }
  }
}

module.exports = { InteractionSession };
