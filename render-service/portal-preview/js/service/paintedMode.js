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
   *     widgetSettingId: one id, or an array of them (a socket push can
   *     touch several widgets at once)
   *
   * Emits, to the parent frame, to window.mmScreenshotStatus, and as a
   * DOM event (so it works embedded or top-level):
   *
   *   { type: "mm-screenshot-ready", source, pageId, pageIndex,
   *     pageIndexes, widgetType, widgetSettingId, drawComplete: true,
   *     seq, ts, changes: [ ...everything coalesced into this one ] }
   *
   * pageIndex/pageIndexes are the pages the changed widgets LIVE on
   * (found by widget id in groups), falling back to the visible page for
   * changes that carry no widget id - the visible page is not otherwise
   * assumed, because data arrives for non-visible pages too.
   *
   * drawComplete means COMPLETE: the signal additionally waits (capped)
   * until no widget loading spinner is visible - a spinner overlay blurs
   * the widget while data is fetched, and a screenshot then would ship
   * that to the TV. For captures the client takes on its own schedule,
   * mmScreenshot.settled() answers the same question on demand.
   *
   * widgetType matters: a client drawing clocks, countdowns and GIFs
   * natively can ignore those and skip the screenshot entirely. That is
   * why SETTINGS changes to those widgets report distinct types
   * ("clock-setting", "countdown-setting"): a resized clock or a new
   * countdown date changes the baked pixels and the native specs, and a
   * plain "clock"/"countdown" type would be filtered as a tick.
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

  /* The page a widget LIVES on, not the page the portal happens to be
   * showing - a widget updating on a non-visible page must not report the
   * visible one, or the client captures the wrong page and the real
   * change waits for its catch-up render. */
  function pageOfWidget(widgetSettingId) {
    if (widgetSettingId === null || widgetSettingId === undefined) return null;
    if (!bridge || !bridge.scope || !bridge.scope.groups) return null;
    var groups = bridge.scope.groups;
    for (var i = 0; i < groups.length; i++) {
      var widgets = (groups[i] && groups[i].widgets) || [];
      for (var j = 0; j < widgets.length; j++) {
        if (String(widgets[j].widgetSettingId) === String(widgetSettingId)) {
          return i;
        }
      }
    }
    return null;
  }

  /* A widget showing its loading spinner is mid-update by definition -
   * the overlay blurs and dims the widget ("Loading...") while new data
   * is fetched, so the portal has NOT finished redrawing while one is
   * up. Only this file needs to know how the portal marks that state;
   * clients ask through the signal (which waits) or settled(). */
  function anySpinnerVisible() {
    try {
      var els = document.querySelectorAll('[id$="_spinnerOverlay"]');
      for (var i = 0; i < els.length; i++) {
        if (getComputedStyle(els[i]).display !== "none") return true;
      }
    } catch (e) {}
    return false;
  }

  /* A calendar range fetch runs ~2.4s; capped well above that so a stuck
   * spinner can never silence the signal stream forever. */
  var SPINNER_CAP_MS = 8000;
  function whenSpinnersSettled(done) {
    var deadline = Date.now() + SPINNER_CAP_MS;
    (function look() {
      if (!anySpinnerVisible() || Date.now() > deadline) return done();
      setTimeout(look, 120);
    })();
  }

  /* Nothing queued, nothing loading: the portal's own answer to "is this
   * a good moment to screenshot?" - for captures a client takes on its
   * own schedule (page steps, catch-up renders), which no ready signal
   * precedes. */
  /* Any page mid-transition is not a moment to screenshot - and not
   * only bridge-driven steps: a layout push makes the portal navigate
   * ITSELF (goToPage), and captures that raced that crossfade baked two
   * pages into one JPEG (Dave's add-a-page test, 2026-08-28). Same
   * visual test whenPageShown applies, as an instant predicate. */
  function pagesMidTransition() {
    try {
      var groups = (bridge && bridge.scope && bridge.scope.groups) || [];
      var visible = 0;
      for (var i = 0; i < groups.length; i++) {
        var el = groups[i] && document.getElementById(groups[i].pageId);
        if (!el) continue;
        var cs = getComputedStyle(el);
        var opacity = parseFloat(cs.opacity);
        if (cs.visibility === "hidden" || opacity <= 0.01) continue;
        if (opacity < 0.99) return true;
        if (cs.transform !== "none" && cs.transform !== "matrix(1, 0, 0, 1, 0, 0)") return true;
        visible++;
      }
      return visible > 1; /* two pages up = mid-crossfade */
    } catch (e) {
      return false; /* never stall the client on a DOM surprise */
    }
  }

  function isSettled() {
    return !pending.length && !debounceTimer && !gate && !anySpinnerVisible() && !pagesMidTransition();
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
     whenSpinnersSettled(function () {
      /* two frames: the first applies style and layout, the second lands
       * after the paint that used them */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var last = changes[changes.length - 1];
          var page = currentPage();
          /* each change resolves to the page its widget lives on; a
           * change with no widget id belongs to the visible page */
          var pageIndexes = [];
          changes.forEach(function (change) {
            var index = pageOfWidget(change.widgetSettingId);
            if (index === null) index = page.pageIndex;
            change.pageIndex = index;
            if (typeof index === "number" && pageIndexes.indexOf(index) === -1) {
              pageIndexes.push(index);
            }
          });
          post({
            type: "mm-screenshot-ready",
            source: last.source,
            pageId: page.pageId,
            pageIndex: typeof last.pageIndex === "number" ? last.pageIndex : page.pageIndex,
            pageIndexes: pageIndexes,
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
    });
  }

  /* ------------------------------------------------------------------
   * Completion gate: "announced only when everything has drawn"
   *
   * Showing a page does not finish drawing it. The controller defers
   * each shown page's heavy widgets behind its own timers - calendars
   * and meal plans are the slow ones, redrawing ~600ms-2.4s after the
   * page appears - and each of those completions already reports here
   * (the notify in initializeCalendar). So a page-level announcement
   * ("reload" after boot or a relayout, "page" after a step) is HELD
   * until every deferred widget on that page has reported in, then goes
   * out as ONE signal with those completions folded into its changes.
   * No timing, no guessing: the announcement waits for the same events
   * the portal itself produces. The cap is a safety valve only - a
   * widget whose completion never comes (broken data source) must not
   * mute the portal forever; its late redraw still signals normally.
   * ------------------------------------------------------------------ */
  var GATE_CAP_MS = 10000;
  var gate = null; /* { kind:"reload"|"page", waiting:{id:true}, count, changes:[], base, timer } */

  /* mirror of the controller's per-page init dispatch
   * (autoResizeByPageNumber): calendars always initialize, meal plans
   * only when status is on - and initializeCalendar reports completion
   * unconditionally, errors included */
  function deferredIdsOnPage(pageIndex) {
    var ids = [];
    try {
      var groups = bridge && bridge.scope && bridge.scope.groups;
      var widgets = (groups && groups[pageIndex] && groups[pageIndex].widgets) || [];
      for (var i = 0; i < widgets.length; i++) {
        var w = widgets[i];
        var type = String(w.contentType || "").toLowerCase();
        if (type === "calendar" || (type === "mealplan" && w.status === "on")) {
          ids.push(String(w.widgetSettingId));
        }
      }
    } catch (e) {}
    return ids;
  }

  function closeGate() {
    if (!gate) return;
    var g = gate;
    gate = null;
    if (g.timer) clearTimeout(g.timer);
    if (g.onDrained) {
      /* page steps own their emission (they also wait for the swap to
       * be on screen); hand the absorbed completions back */
      g.onDrained(g);
      return;
    }
    /* completions first, the announcement LAST - the flushed signal
     * reports the announcement's source */
    g.changes.forEach(function (c) {
      pending.push(c);
    });
    if (g.base) pending.push(g.base);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, DEBOUNCE_MS);
  }

  function openGate(kind, pageIndex, base) {
    var ids = deferredIdsOnPage(pageIndex);
    if (!ids.length) return false;
    if (gate && gate.timer) clearTimeout(gate.timer);
    gate = { kind: kind, waiting: {}, count: ids.length, changes: [], base: base, timer: setTimeout(closeGate, GATE_CAP_MS) };
    for (var i = 0; i < ids.length; i++) gate.waiting[ids[i]] = true;
    return true;
  }

  /* widgetSettingId may be one id or an array of them - the socket
   * updaters receive maps keyed by widget id and one push can touch
   * several widgets, so they pass Object.keys() as-is. */
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
    var ids = Array.isArray(widgetSettingId) ? widgetSettingId : [widgetSettingId];
    if (!ids.length) ids = [null];
    var entries = ids.map(function (id) {
      return {
        source: source || "portal",
        widgetType: widgetType || null,
        widgetSettingId: id === undefined || id === null || id === "" ? null : id,
        ts: Date.now(),
      };
    });

    /* page-level announcements wait for their page's deferred widgets.
     * A reload OUTRANKS everything: it is a fresh start, so it replaces
     * any gate, and a page announcement never replaces a waiting reload. */
    if (source === "reload" && bridge && bridge.scope) {
      if (openGate("reload", bridge.scope.quoteIndex, entries[0])) return;
    }
    if (source === "page") {
      if (gate && gate.kind === "reload") {
        gate.changes.push(entries[0]);
        return;
      }
      /* page announcements gate through announcePage (below), which
       * knows whether the step re-ran the page's deferred init */
    }
    /* While a RELOAD waits, EVERYTHING the portal reports is part of the
     * boot - folded into the one announcement, nothing signals on its
     * own; the fresh start's capture-everything covers it all. A PAGE
     * announcement absorbs only its own page's deferred completions, so
     * an unrelated widget update elsewhere still signals normally. */
    if (gate) {
      var isExpected = function (entry) {
        return entry.widgetType === "calendar" && gate && gate.waiting[String(entry.widgetSettingId)];
      };
      if (gate.kind === "reload") {
        entries.forEach(function (entry) {
          if (isExpected(entry)) {
            delete gate.waiting[String(entry.widgetSettingId)];
            gate.count--;
          }
          gate.changes.push(entry);
        });
        if (gate.count <= 0) closeGate();
        return;
      }
      var absorbed = false;
      entries.forEach(function (entry) {
        if (isExpected(entry)) {
          delete gate.waiting[String(entry.widgetSettingId)];
          gate.count--;
          gate.changes.push(entry);
          absorbed = true;
        }
      });
      if (absorbed) {
        if (gate && gate.count <= 0) closeGate();
        return;
      }
    }

    entries.forEach(function (entry) {
      pending.push(entry);
    });
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, DEBOUNCE_MS);
  };

  /* A page swap is only DONE when it is done on screen. The portal's
   * transition classes run 3s CSS animations (fade dims opacity, slides
   * ride transform), and pages without one snap instantly - so instead of
   * guessing a duration, watch the elements: the incoming page at full
   * opacity and resting transform, every other page invisible, stable for
   * a few frames. Capped so a stuck animation can never stall the client
   * (a capped wait captures whatever is there - the same trade the image
   * wait makes). */
  /* showNextPage applies its swap behind an 800ms timeout and the
   * transition classes run 3s on top of that */
  var PAGE_SETTLE_CAP_MS = 4500;
  function whenPageShown(index, done) {
    var deadline = Date.now() + PAGE_SETTLE_CAP_MS;
    var stable = 0;
    var lastKey = null;
    function look() {
      var settled = false;
      var key = "";
      try {
        var groups = (bridge && bridge.scope && bridge.scope.groups) || [];
        var target = groups[index] && document.getElementById(groups[index].pageId);
        if (target) {
          var ok = true;
          for (var i = 0; i < groups.length; i++) {
            var el = groups[i] && document.getElementById(groups[i].pageId);
            if (!el) continue;
            var cs = getComputedStyle(el);
            var opacity = parseFloat(cs.opacity);
            key += i + ":" + cs.visibility + "," + cs.opacity + "," + cs.transform + ";";
            if (el === target) {
              if (cs.visibility === "hidden" || opacity < 0.99) ok = false;
              if (cs.transform !== "none" && cs.transform !== "matrix(1, 0, 0, 1, 0, 0)") ok = false;
            } else if (cs.visibility !== "hidden" && opacity > 0.01) {
              ok = false;
            }
          }
          settled = ok;
        }
      } catch (e) {
        settled = true; /* never let a DOM surprise stall the client */
      }
      stable = settled && key === lastKey ? stable + 1 : 0;
      lastKey = key;
      if ((settled && stable >= 2) || Date.now() > deadline) return done();
      requestAnimationFrame(look);
    }
    requestAnimationFrame(look);
  }

  /* mainController hands over its scope once, so paging can be driven
   * without the controller knowing anything about this file. */
  window.mmPaintedBridge = function (scope, timeout, showPage) {
    bridge = { scope: scope, timeout: timeout, showPage: showPage };

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
      /* the DISPLAY's IANA timezone (from the widget list) - the client
       * runs this page's browser in it so every local-time computation
       * (day rollover, calendar "today", moment()) behaves exactly as on
       * a TV in the user's home */
      timeZoneId: function () {
        return scope.timeZoneId || null;
      },
      /* is this a good moment to screenshot? - nothing queued, nothing
       * loading. For captures the client takes on its own schedule (page
       * steps, catch-up renders), which no ready signal precedes. */
      settled: function () {
        return isSettled();
      },
      /* Jump straight to a page: no gesture gating and no auto-rotation
       * racing it. quoteIndex alone only moves bindings - visibility and
       * z-order are applied imperatively by the controller's showNextPage
       * (the same call its own rotation makes), so it rides along in the
       * bridge. Reports through the normal ready signal (source "page")
       * once the swap has finished ON SCREEN, transitions included. */
      gotoPage: function (index) {
        if (!scope.groups || index < 0 || index >= scope.groups.length) return false;
        var already = scope.quoteIndex === index;
        /* Announce only when the page has FULLY drawn: on screen AND its
         * deferred widgets done. Showing a page re-runs those inits
         * (showNextPage -> autoResizeByPageNumber -> initializeCalendar,
         * completing ~600ms later), so the gate must open BEFORE the
         * swap starts - the init can finish before the 3s transition
         * settles, and a gate opened after the settle would wait for a
         * completion that already went by. A no-op step (portal already
         * there, nothing re-ran) has nothing to wait for. */
        var entry = { source: "page", widgetType: null, widgetSettingId: null, ts: Date.now() };
        var onScreen = false;
        var deferredDone = true;
        var emit = function () {
          if (!onScreen || !deferredDone) return;
          if (gate && gate.kind === "reload") {
            gate.changes.push(entry); /* a fresh start supersedes the step */
            return;
          }
          pending.push(entry);
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(flush, DEBOUNCE_MS);
        };
        if (!already && openGate("page", index, null)) {
          deferredDone = false;
          gate.onDrained = function (drained) {
            drained.changes.forEach(function (c) {
              pending.push(c);
            });
            deferredDone = true;
            emit();
          };
        }
        scope.$applyAsync(function () {
          scope.quoteIndex = index;
          if (!already && bridge.showPage) bridge.showPage();
        });
        whenPageShown(index, function () {
          onScreen = true;
          emit();
        });
        return true;
      },
    };
  };

  /* Deliberately no styling changes at all.
   *
   * Two earlier attempts here both broke the TV, and both are worth
   * remembering:
   *
   *   - disabling animations: the portal draws the old and new calendar
   *     range together during a scroll and drops the old copy on
   *     animationend, which then never fired. The calendar showed
   *     doubled and mirrored, permanently.
   *
   *   - forcing a transparent background: correct for pages whose photo
   *     the device draws underneath, wrong for every other page, which
   *     lost its background entirely and went black.
   *
   * Both are decisions only the client can make, per page, because only
   * the client knows what it will draw natively. It already injects
   * transparency for exactly those pages. This file reports what changed
   * and nothing else. */

})();
