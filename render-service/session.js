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
    this.browser = await chromium.launch();
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
  // resolve the control under the pointer and invoke the portal's OWN
  // handler - the same function the click would have called - so the
  // portal still builds the payload and calls the API itself.
  //
  // A real checkbox click flips the model first (the browser's native
  // toggle) and the handler then sends that new state, so the flip has to
  // be mirrored here or the portal dutifully re-sends the old value.
  async tap(x, y) {
    const frame = this.page.frames().find((f) => f.url().includes("designer=true"));
    if (!frame) throw new Error("portal frame missing");

    const result = await frame.evaluate(
      (pt) => {
        // captures hide published checkboxes (the device draws its own)
        document.querySelectorAll("input.todocheckbox").forEach((el) => {
          if (el.style.opacity === "0") el.style.opacity = "";
        });
        const pad = 14;
        const el = [...document.querySelectorAll("input.todocheckbox")].find((c) => {
          if (getComputedStyle(c).visibility === "hidden") return false; // other page
          const r = c.getBoundingClientRect();
          return pt.x >= r.x - pad && pt.x <= r.right + pad && pt.y >= r.y - pad && pt.y <= r.bottom + pad;
        });
        if (!el) return { handled: false, reason: "no target under pointer" };

        const sc = window.angular.element(el).scope();
        const climb = (k) => {
          let q = sc;
          while (q && q[k] === undefined) q = q.$parent;
          return q ? q[k] : undefined;
        };
        let fnScope = sc;
        while (fnScope && !fnScope.updateTaskStatus) fnScope = fnScope.$parent;
        if (!fnScope) return { handled: false, reason: "handler not on scope chain" };

        const widgetData = climb("widgetData");
        const value = climb("value");
        const kind = widgetData && widgetData.contentType === "chores" ? "chores" : "todo";
        const next = !sc.todo.status;
        const evt = { preventDefault() {}, stopPropagation() {}, target: el };
        sc.todo.status = next;
        fnScope.$apply(() => {
          fnScope.updateTaskStatus(
            sc.todo,
            widgetData ? widgetData.widgetSettingId : null,
            climb("key"),
            climb("outerindex"),
            climb("innerIndex"),
            evt,
            kind,
            value ? value.selectedLabel : undefined,
            value,
          );
        });
        return { handled: true, kind, taskId: sc.todo.taskId, status: next };
      },
      { x, y },
    );

    if (!result.handled) {
      console.log("tap ignored:", result.reason);
      return result;
    }
    console.log("tap:", result.kind, "task", result.taskId, "->", result.status ? "complete" : "not complete");
    // give the portal's API call and its own DOM update time to land
    await this.page.waitForTimeout(1500);
    return result;
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

  // one interaction, serialised: nothing else may drive the page at once
  async interact(action) {
    if (this.busy) throw new Error("session busy");
    this.busy = true;
    this.touchIdle();
    try {
      await this.open(action.page || 0);
      if (action.type === "tap") {
        await this.tap(action.x, action.y);
      } else {
        throw new Error("unsupported action: " + action.type);
      }
      return await this.recapture();
    } finally {
      this.busy = false;
      this.touchIdle();
    }
  }
}

module.exports = { InteractionSession };
