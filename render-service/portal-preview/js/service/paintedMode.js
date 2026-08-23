/*
 * Painted mode (?painted=true)
 * ---------------------------------------------------------------------
 * For clients that run this portal LIVE in a headless browser, screenshot
 * it, and paint the moving parts themselves - Mango Display on Roku
 * today, tvOS next. Those platforms have no web view, so a render service
 * keeps a live portal (its own socket, its own timers, its own reloads)
 * and the device draws the picture with native layers on top: the clock
 * ticks, GIFs animate and photos crossfade on the device, from URLs the
 * portal reports.
 *
 * Unlike preview/designer mode this changes NOTHING about how the portal
 * behaves as a display. It only:
 *
 *   1. announces when the portal has finished redrawing, so the client
 *      knows when a screenshot is worth taking, and
 *   2. stops animating, since the device animates its own layers and a
 *      screenshot must never land mid-transition.
 *
 * Deliberately NOT here: blocking downloads of media the device draws
 * itself. That belongs to the client, which owns the browser and can
 * refuse the requests outright - measured at 2.4MB -> 37KB per page. Any
 * in-page attempt leaks (stylesheet rules and parser-created elements
 * never pass through a property setter), so it is not attempted.
 *
 * Everything painted mode needs from mainController is one bridge call
 * and one notify call per redraw path.
 */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  if (params.get("painted") !== "true") return;

  window.mmPainted = true;

  /* ------------------------------------------------------------------
   * Change notifications
   *
   * A client cannot tell from outside when this portal has finished
   * redrawing. A calendar, for example, updates its model instantly but
   * repaints ~2.4s later behind two chained timeouts, so every external
   * test (watch the text, watch the DOM, track timers) fires inside that
   * gap and screenshots a half-updated page.
   *
   * So the portal says so itself. mainController calls mmPaintedNotify()
   * wherever a redraw completes; coalescing, image-waiting, sequencing
   * and posting all live here, so the controller carries one line per
   * call site and nothing more.
   *
   *   window.mmPaintedNotify(source, widgetType, widgetSettingId)
   *     source: "reload" | "socket" | "portal" | "page"
   *
   * Emits, to the parent frame, to window.mmScreenshotStatus, and as a
   * DOM event (so it works embedded or top-level):
   *
   *   { type: "mm-screenshot-ready", source, pageId, pageIndex,
   *     widgetType, widgetSettingId, drawComplete: true, seq, ts,
   *     changes: [ ...everything coalesced into this one ] }
   *
   * widgetType matters: a client drawing clocks, countdowns and GIFs
   * natively can ignore those and skip the screenshot entirely.
   * ------------------------------------------------------------------ */

  var seq = 0;
  var bridge = null;
  var pending = [];
  var debounceTimer = null;
  var DEBOUNCE_MS = 250;
  var IMAGE_CAP_MS = 4000;

  function post(message) {
    window.mmScreenshotStatus = message;
    if (window.parent !== window) {
      try { window.parent.postMessage(message, "*"); } catch (e) {}
    }
    try {
      window.dispatchEvent(new CustomEvent("mm-screenshot-ready", { detail: message }));
    } catch (e) {}
  }

  function currentPage() {
    if (!bridge || !bridge.scope || !bridge.scope.groups) return {};
    var page = bridge.scope.groups[bridge.scope.quoteIndex];
    return { pageId: page && page.pageId, pageIndex: bridge.scope.quoteIndex };
  }

  /* Wait for anything still decoding before calling the paint done - the
   * same guard the designer-ready signal uses, capped so a broken or
   * blocked URL can never stall the client. */
  function whenImagesSettled(done) {
    var waits = [];
    try {
      Array.prototype.forEach.call(document.images, function (img) {
        if (img.complete || !img.src) return;
        waits.push(
          new Promise(function (resolve) {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          })
        );
      });
    } catch (e) {}
    if (!waits.length) return done();
    var fired = false;
    var finish = function () {
      if (fired) return;
      fired = true;
      done();
    };
    Promise.all(waits).then(finish);
    setTimeout(finish, IMAGE_CAP_MS);
  }

  function flush() {
    debounceTimer = null;
    var changes = pending;
    pending = [];
    if (!changes.length) return;
    whenImagesSettled(function () {
      /* two frames: the first applies style and layout, the second lands
       * after the paint that used them */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var last = changes[changes.length - 1];
          var page = currentPage();
          post({
            type: "mm-screenshot-ready",
            source: last.source,
            pageId: page.pageId,
            pageIndex: page.pageIndex,
            widgetType: last.widgetType || null,
            widgetSettingId: last.widgetSettingId || null,
            drawComplete: true,
            seq: ++seq,
            ts: Date.now(),
            changes: changes,
          });
        });
      });
    });
  }

  window.mmPaintedNotify = function (source, widgetType, widgetSettingId) {
    if (!pending.length && window.parent !== window) {
      /* tell the client to hold off rather than capture mid-change */
      try {
        window.parent.postMessage(
          { type: "mm-screenshot-pending", source: source, ts: Date.now() },
          "*"
        );
      } catch (e) {}
    }
    pending.push({
      source: source || "portal",
      widgetType: widgetType || null,
      widgetSettingId: widgetSettingId || null,
      ts: Date.now(),
    });
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, DEBOUNCE_MS);
  };

  /* mainController hands over its scope once, so paging can be driven
   * without the controller knowing anything about this file. */
  window.mmPaintedBridge = function (scope, timeout) {
    bridge = { scope: scope, timeout: timeout };

    window.mmScreenshot = {
      pageCount: function () {
        return scope.groups ? scope.groups.length : 0;
      },
      pageIndex: function () {
        return scope.quoteIndex;
      },
      status: function () {
        return window.mmScreenshotStatus || null;
      },
      /* Jump straight to a page: no animation, no gesture gating, and no
       * auto-rotation racing it. Reports through the normal ready signal
       * (source "page") once the new page has drawn. */
      gotoPage: function (index) {
        if (!scope.groups || index < 0 || index >= scope.groups.length) return false;
        scope.$applyAsync(function () {
          scope.quoteIndex = index;
        });
        window.mmPaintedNotify("page", null, null);
        return true;
      },
    };
  };

  /* The page background is transparent because the device draws the page
   * photo underneath the captured PNG.
   *
   * NOTE: this deliberately does NOT disable animations. An earlier
   * version did, for capture determinism, and it broke the calendar: the
   * portal renders the old and new date range together during a scroll
   * and removes the old copy when the animation ENDS. With animations
   * off that event never fired, so both copies stayed - the calendar
   * appeared doubled and mirrored on the TV, permanently. Determinism
   * comes from the ready signal now: we capture when the portal says it
   * has settled, which is after its animations have run. */
  function freeze() {
    var css = "html,body,#main,#pageTransition{background-color:transparent !important;}";
    var tag = document.createElement("style");
    tag.setAttribute("data-mm-painted", "true");
    tag.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(tag);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", freeze);
  } else {
    freeze();
  }
})();
