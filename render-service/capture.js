/*
 * The capture pipeline, shared by the one-shot renderer (render.js) and
 * the live interaction session (session.js).
 *
 * openHarness() loads the portal in designer mode inside a viewport-sized
 * iframe (the portal only signals readiness when embedded) and freezes
 * entrance animations. capturePage() then does the native-widget pass,
 * writes the image, films anything that has to be captured live, and
 * publishes the manifest.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nativeWidgets = require("./nativeWidgets");

// Manifest contract version - see MANIFEST.md. Bump on a BREAKING change
// (a field removed or its meaning changed); additive fields do not need
// it. Clients should refuse a major version they do not understand rather
// than guess, which is the whole point of having it before there are two
// of them.
const SCHEMA_VERSION = 1;

/* The portal is an IFRAME in designer mode (the old pipeline) and the
 * PAGE ITSELF in painted mode, where it runs live at top level. Every
 * extractor needs whichever one is actually holding the portal. */
function portalFrameOf(page) {
  const embedded = page.frames().find((f) => f.url().includes("designer=true"));
  if (embedded) return embedded;
  const main = page.mainFrame();
  return main && main.url().includes("painted=true") ? main : null;
}

// `groups` lives on the MainCtrl child scope, so walk the scope tree
// from $rootScope (works even with Angular debug info off)
async function extractPageMeta(page) {
  const portalFrame = portalFrameOf(page);
  if (!portalFrame) return null;
  try {
    return await portalFrame.evaluate(() => {
      if (!window.angular) return null;
      const roots = [document.querySelector("[ng-app]"), document.body, document.documentElement];
      for (const r of roots) {
        if (!r) continue;
        const inj = window.angular.element(r).injector();
        if (!inj) continue;
        let found = null;
        let gesture = null;
        const walk = (s) => {
          if (!s || found) return;
          if (s.gesture && !gesture) gesture = s.gesture;
          if (s.groups && s.groups.length) {
            found = s.groups;
            if (s.gesture) gesture = s.gesture;
            return;
          }
          walk(s.$$childHead);
          walk(s.$$nextSibling);
        };
        walk(inj.get("$rootScope"));
        if (found) {
          const on = (v) => v === true || v === 1 || v === "true" || v === "1";
          return {
            pageCount: found.length,
            pages: found.map((g) => ({
              delaySeconds: parseInt(g.delay, 10) || 60,
              transition: g.transition || "fade",
              autoRotate: g.isAutoPageRotation === true,
            })),
            // which remote gestures the user has switched on for this
            // display - the device honours these, same as the portal does
            gestures: {
              pageSwipe: on(gesture && gesture.touch_page_swipe),
              calendarScroll: on(gesture && gesture.touch_calendar_scroll),
            },
          };
        }
        break;
      }
      return null;
    });
  } catch (e) {
    console.error("page meta extraction failed:", e.message);
    return null;
  }
}

function wireDiagnostics(page) {
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  page.on("requestfailed", (r) =>
    console.error("[requestfailed]", r.url().slice(0, 140), r.failure() && r.failure().errorText),
  );
  page.on("console", (m) => {
    if (m.type() === "error") console.error("[console]", m.text().slice(0, 200));
  });
  page.on("response", (r) => {
    if (r.status() >= 400) console.error("[http " + r.status() + "]", r.url().slice(0, 140));
  });
}

// ---- portal idle probe --------------------------------------------------
//
// The portal updates in TWO stages: a socket payload changes the model and
// Angular re-binds immediately, but the widget's real redraw is deferred.
// A calendar is the worst case - updateCalendarData schedules
// initializeCalendar 2000ms out, which schedules updatedCalendarView a
// further 400ms out - so for ~2.4s the page shows NEW header text around
// OLD contents. Every readiness test we had (text changed / DOM quiet)
// is satisfied inside that gap, so captures published stale widgets: a
// calendar event the user had just added was missing, and one they had
// deleted was still there.
//
// Rather than special-case the calendar's magic numbers, this tracks the
// WORK ITSELF. setTimeout is wrapped so we can see the deferred callbacks
// a payload schedules - and the ones those schedule in turn - and the
// capture waits until that whole cascade has drained and the DOM has
// stopped changing. Any widget with any deferral is covered, including
// ones nobody has written yet.
const IDLE_PROBE = `(() => {
  if (window.__mmIdle) return;
  // "The portal has finished" means every kind of work a redraw can wait
  // on, not just timers: a widget may redraw off a network response, an
  // animation frame, or an image finishing decode. Anything missing here
  // becomes a capture of a half-updated screen, which is the whole class
  // of bug this exists to end.
  const S = {
    pending: new Set(),   // timers + animation frames still to run
    net: 0,               // XHR/fetch in flight that we care about
    track: false,         // true while a payload is being applied
    activeUntil: 0,       // rolling window: extends while a cascade runs
    hardUntil: 0,         // ceiling so nothing can pin the page busy
    seen: 0,
    lastMutation: Date.now(),
  };
  const now = () => Date.now();
  // Work counts if it starts during the apply, or within a moment of
  // other tracked work finishing - that is what makes a CASCADE (a timer
  // that fetches, whose response schedules a redraw) hold the capture,
  // while an unrelated background poll started later does not.
  const wanted = () => (S.track || now() < S.activeUntil) && now() < S.hardUntil;
  const chain = () => { S.activeUntil = now() + 350; };

  const st = window.setTimeout.bind(window);
  const ct = window.clearTimeout.bind(window);
  window.setTimeout = function (fn, delay) {
    const d = Number(delay) || 0;
    if (typeof fn !== "function") return st.apply(null, arguments);
    const args = Array.prototype.slice.call(arguments, 2);
    let id;
    const wrapped = function () {
      S.pending.delete(id);
      try { return fn.apply(this, args); } finally { chain(); }
    };
    id = st(wrapped, d);
    if (d <= 8000 && wanted()) { S.pending.add(id); S.seen++; }
    return id;
  };
  window.clearTimeout = function (id) { S.pending.delete(id); return ct(id); };

  const raf = window.requestAnimationFrame && window.requestAnimationFrame.bind(window);
  if (raf) {
    window.requestAnimationFrame = function (fn) {
      let id;
      const wrapped = function (t) {
        S.pending.delete("raf" + id);
        try { return fn(t); } finally { chain(); }
      };
      id = raf(wrapped);
      if (wanted()) { S.pending.add("raf" + id); S.seen++; }
      return id;
    };
  }

  // A widget that redraws when its data arrives - rather than on a timer
  // - is invisible to timer tracking alone.
  const XHR = window.XMLHttpRequest;
  if (XHR && XHR.prototype && XHR.prototype.send) {
    const send = XHR.prototype.send;
    XHR.prototype.send = function () {
      if (wanted()) {
        S.net++; S.seen++;
        let done = false;
        const settle = () => { if (done) return; done = true; S.net--; chain(); };
        this.addEventListener("loadend", settle);
        // belt and braces: a request that never fires loadend must not
        // hold the capture open past the ceiling
        st(() => { if (!done) settle(); }, 8000);
      }
      return send.apply(this, arguments);
    };
  }
  if (window.fetch) {
    const f = window.fetch.bind(window);
    window.fetch = function () {
      if (!wanted()) return f.apply(null, arguments);
      S.net++; S.seen++;
      let done = false;
      const settle = () => { if (done) return; done = true; S.net--; chain(); };
      st(() => settle(), 8000);
      return f.apply(null, arguments).then(
        (r) => { settle(); return r; },
        (e) => { settle(); throw e; },
      );
    };
  }

  try {
    new MutationObserver(() => { S.lastMutation = now(); }).observe(document.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true,
    });
  } catch (e) {}
  window.__mmIdle = S;
})()`;

// Images are checked at wait time rather than tracked: a broken URL
// still resolves (the error event marks it complete), so this cannot
// hang on the portal's known 403 placeholders.
const IDLE_TEST = `(q => {
  const S = window.__mmIdle;
  if (!S) return true;
  if (S.pending.size || S.net > 0) return false;
  const imgs = document.images || [];
  for (let i = 0; i < imgs.length; i++) if (!imgs[i].complete) return false;
  return Date.now() - S.lastMutation >= q;
})`;

async function installIdleProbe(frame) {
  try {
    await frame.evaluate(IDLE_PROBE);
    return true;
  } catch (e) {
    return false;
  }
}

// Call immediately BEFORE applying a payload, so the deferred work it
// schedules is attributed to it.
async function markPortalWork(frame) {
  await installIdleProbe(frame);
  await frame
    .evaluate(() => {
      const S = window.__mmIdle;
      if (!S) return;
      S.pending.clear();
      S.seen = 0;
      S.track = true;
      // ceiling for follow-on work spawned by tracked callbacks
      S.hardUntil = Date.now() + 6000;
      S.lastMutation = Date.now();
    })
    .catch(() => {});
}

// Resolves when the cascade has drained AND the DOM has held still, so a
// screenshot taken after this shows what the user would see. Bounded: a
// page that never settles still publishes rather than hanging the update.
async function awaitPortalIdle(frame, opts) {
  const quiet = (opts && opts.quietMs) || 300;
  const cap = (opts && opts.capMs) || 8000;
  const t0 = Date.now();
  let timedOut = false;
  // Close the scheduling window HERE: everything the apply scheduled is
  // now counted, and timers started later (unrelated refresh cadences)
  // are not. Report what was actually tracked - "idle in 310ms" told us
  // nothing about whether the probe had seen the portal's work at all.
  const stats = await frame
    .evaluate(() => {
      const S = window.__mmIdle;
      if (!S) return null;
      S.track = false;
      // the ceiling starts from the moment we begin waiting
      S.hardUntil = Date.now() + 8000;
      return { pending: S.pending.size, net: S.net, seen: S.seen };
    })
    .catch(() => null);
  try {
    await frame.waitForFunction(IDLE_TEST, quiet, { timeout: cap, polling: 100 });
  } catch (e) {
    timedOut = true;
  }
  const waited = Date.now() - t0;
  console.log(
    "portal idle after " + waited + "ms" +
      (stats
        ? " (tracked " + stats.seen + " deferred, pending at wait start: " + stats.pending + " timers/frames + " + stats.net + " requests)"
        : " (PROBE MISSING)") +
      (timedOut ? " - CAPPED, page never settled" : ""),
  );
  return waited;
}

async function openHarness(page, opts) {
  const { url, width, height, outWidth, outHeight, stateDir } = opts;
  const th0 = Date.now();
  let thPrev = th0;
  const hm = [];
  const hmark = (l) => { const n = Date.now(); hm.push(l + "=" + (n - thPrev) + "ms"); thPrev = n; };
  await page.addInitScript(() => {
    window.__mmReady = false;
    window.addEventListener("message", (e) => {
      if (e && e.data && e.data.type === "mm-designer-ready") window.__mmReady = true;
    });
  });

  // the listener lives in an inline <script> so it exists before the
  // iframe starts loading (addInitScript does not fire for setContent)
  const scaleX = outWidth / width;
  const scaleY = outHeight / height;
  await page.setContent(
    '<!doctype html><html><body style="margin:0;background:#000;overflow:hidden">' +
      "<script>window.__mmReady=false;window.addEventListener('message',function(e){" +
      "if(e&&e.data&&e.data.type==='mm-designer-ready'){window.__mmReady=true;}});<\/script>" +
      '<iframe src="' + url.replace(/"/g, "&quot;") + '"' +
      ' style="display:block;border:0;width:' + width + "px;height:" + height + "px;" +
      "transform:scale(" + scaleX + "," + scaleY + ');transform-origin:0 0"></iframe>' +
      "</body></html>",
    { waitUntil: "load", timeout: 30000 },
  );

  // a screenshot robot does not need the portal's 3s entrance fade; the
  // handle is kept so live-capture handlers can restore animation later
  const state = { noAnimStyle: null };
  try {
    const iframeEl = await page.waitForSelector("iframe", { timeout: 10000 });
    const frame = await iframeEl.contentFrame();
    if (frame) {
      await frame.waitForLoadState("domcontentloaded");
      state.noAnimStyle = await frame.addStyleTag({
        content: "*,*::before,*::after{transition:none !important;animation:none !important;}",
      });
    }
  } catch (e) {
    console.error("no-anim CSS injection failed (fade will run):", e.message);
  }
  hmark("iframe+css");

  try {
    await page.waitForFunction("window.__mmReady === true", null, { timeout: 15000 });
    console.log("mm-designer-ready received");
  } catch (e) {
    console.error("no ready signal within 15s - capturing anyway");
  }
  hmark("portal-ready");
  await page.waitForTimeout(400);
  await applyCalendarOverride(page, stateDir);
  hmark("settle+override");
  console.log("harness: total=" + (Date.now() - th0) + "ms " + hm.join(" "));
  return state;
}

// A calendar the user scrolled with the remote is not part of what the
// portal serves on load - the backend hands the new range out over the
// socket and forgets it. The watcher keeps the last one it saw, so every
// render re-applies it and the view the user asked for survives the next
// refresh instead of snapping back a few seconds later.
async function applyCalendarOverride(page, stateDir) {
  let saved = null;
  try {
    // per-display state lives in the display's own directory; __dirname
    // is only right for the single-display development flow
    const raw = JSON.parse(fs.readFileSync(path.join(stateDir || __dirname, "calendar-override.json"), "utf8"));
    if (raw && raw.widgets && Date.now() - raw.at < (raw.holdMs || 600000)) saved = raw.widgets;
  } catch (e) {
    return;
  }
  if (!saved || !Object.keys(saved).length) return;
  const frame = portalFrameOf(page);
  if (!frame) return;
  await markPortalWork(frame);
  try {
    const res = await frame.evaluate((data) => {
      // Only the page being rendered matters. Designer mode keeps every
      // page in the DOM, so an invisible calendar from another page would
      // otherwise be "updated" here and then waited on for a repaint that
      // never comes - six seconds added to every render of every page.
      const visible = [...document.querySelectorAll("[ng-swipe-up][ng-swipe-down]")].filter(
        (e) => getComputedStyle(e).visibility !== "hidden" && e.offsetParent !== null,
      );
      if (!visible.length) return { skip: "no calendar on this page" };

      // and only if it is not already showing what we would set
      const wanted = [];
      for (const el of visible) {
        let w = window.angular.element(el).scope();
        while (w && !w.widgetData) w = w.$parent;
        const id = w && w.widgetData ? String(w.widgetData.widgetSettingId) : null;
        const want = id && data[id];
        if (!want) continue;
        const now = w.widgetData.data && w.widgetData.data.initial_date;
        if (String(now) !== String(want.initial_date)) wanted.push({ el, id });
      }
      if (!wanted.length) return { skip: "already on the saved range" };

      let sc = window.angular.element(wanted[0].el).scope();
      while (sc && !sc.updateCalendarData) sc = sc.$parent;
      if (!sc) return { skip: "no handler" };
      // watch EVERY out-of-date targeted calendar: a page can hold
      // several, and watching only "the first visible calendar" meant
      // the wait stared at an untouched sibling, burned its full
      // timeout, and let the capture race the real widget's repaint
      window.__mmOverrideWatch = wanted.map((w) => ({
        el: w.el,
        before: (w.el.innerText || "").replace(/\s+/g, " ").slice(0, 60),
      }));
      sc.updateCalendarData(data); // runs its own $apply - never wrap it
      return { ids: wanted.map((w) => w.id) };
    }, saved);

    if (res.skip) return;
    // the portal defers its repaint behind a 2s timeout, so this is a
    // short wait for a change we know is coming, not a blind timeout
    // Wait for the portal to FINISH, not merely to start: the text-change
    // test this used to do is satisfied by the immediate $apply, ~2.4s
    // before the calendar redraws its contents.
    await awaitPortalIdle(frame, { quietMs: 300, capMs: 8000 });
    console.log("calendar: re-applied the scrolled range to widget(s)", res.ids.join(","));
  } catch (e) {
    console.error("calendar override failed:", e.message);
  }
}

async function capturePage(page, opts) {
  const { out, url, width, height, outWidth, outHeight, apiBase } = opts;
  // stage timings: "make it fast" needs measurements, not guesses
  const t0 = Date.now();
  let tPrev = t0;
  const marks = [];
  const mark = (label) => {
    const now = Date.now();
    marks.push(label + "=" + (now - tPrev) + "ms");
    tPrev = now;
  };
  const state = opts.state || { noAnimStyle: null };
  const outDir = path.dirname(path.resolve(out));

  // designer mode keeps every page in the DOM (hidden pages use
  // visibility:hidden), so extractors see all pages' widgets - keep only
  // the rendered page's
  const pageIdxMatch = url.match(/[?&]page=(\d+)/);
  const pageIdx = pageIdxMatch ? parseInt(pageIdxMatch[1], 10) : 0;
  const groups = [];
  const portalFrame = portalFrameOf(page);

  if (portalFrame) {
    for (const handler of nativeWidgets.handlers) {
      try {
        let found = await handler.extract(portalFrame);
        found = found.filter((o) => o.page === undefined || o.page === pageIdx);
        if (found.length && handler.process) {
          // process may drop entries (e.g. non-animated GIFs) - only
          // survivors get hidden, so nothing leaves a blank hole
          found = await handler.process(found, { outDir });
        }
        if (found.length) {
          await handler.hide(portalFrame, found);
          groups.push({ handler, items: found });
        }
      } catch (e) {
        console.error("native-widget handler '" + handler.type + "' failed:", e.message);
      }
    }
    if (groups.length) await page.waitForTimeout(100);
  }
  mark("widgets");

  // display-wide visual overlays are animated natively on the Roku
  let effects = [];
  if (portalFrame) {
    try {
      effects = await nativeWidgets.extractEffects(portalFrame, { outDir });
      await nativeWidgets.hideEffects(portalFrame);
      if (effects.length) {
        await page.waitForTimeout(80);
        console.log("effects:", effects.map((e) => e.type).join(", "));
      }
    } catch (e) {
      console.error("effect extraction failed:", e.message);
    }
  }
  mark("effects");

  // interactive targets (task checkboxes) - drawn natively so a remote
  // press can tick instantly
  let targets = null;
  if (portalFrame) {
    try {
      targets = await nativeWidgets.extractTargets(portalFrame, { outDir, apiBase, pageIdx });
      if (targets) {
        await nativeWidgets.hideTargets(portalFrame, targets.items);
        await page.waitForTimeout(60);
        console.log("targets:", targets.items.length);
      }
    } catch (e) {
      console.error("target extraction failed:", e.message);
    }
  }
  mark("targets");

  // layered mode: a rotating background or a video widget needs the
  // widgets captured as a transparent PNG
  /* Painted mode is ALWAYS layered: the portal renders with a transparent
   * background because the device draws the page photo underneath. A JPEG
   * has no alpha, so Chromium flattens that transparency onto WHITE - and
   * the portal's white text (dates, the greeting) then vanishes into it.
   * The page looked half-rendered when it was fully drawn and simply
   * invisible. */
  const painted = !!(portalFrame && portalFrame.url().includes("painted=true"));
  const layered =
    painted || groups.some((g) => g.handler.type === "background" && g.items.length);
  let outPath = out;
  if (layered && portalFrame) {
    await portalFrame.addStyleTag({
      content:
        "html,body{background:transparent !important;}" +
        "#main{background:transparent !important;}" +
        "#pageTransition,#pageTransition>div{background-color:transparent !important;}",
    });
    await page.addStyleTag({ content: "html,body{background:transparent !important;}" });
    await page.waitForTimeout(120);
    outPath = out.replace(/\.jpe?g$/i, "") + ".png";
  }

  if (layered) {
    await page.screenshot({ path: outPath, type: "png", omitBackground: true });
  } else {
    await page.screenshot({ path: outPath, type: "jpeg", quality: 85 });
  }
  mark("screenshot");

  const captureCtx = {
    outDir,
    layered,
    outScale: outWidth / width,
    reenableAnimations: async () => {
      /* painted mode: the portal froze its own animations, so filming the
       * weather icons means lifting THAT style, not ours */
      if (portalFrame) {
        await portalFrame
          .evaluate(() => {
            const tag = document.querySelector("style[data-mm-painted]");
            if (tag) {
              window.__mmPaintedFreeze = tag;
              tag.remove();
            }
          })
          .catch(() => {});
      }
      if (state.noAnimStyle) {
        await state.noAnimStyle.evaluate((n) => n.remove()).catch(() => {});
        state.noAnimStyle = null;
        await page.waitForTimeout(250);
      }
    },
  };
  for (const g of groups) {
    if (!g.handler.captureAfter) continue;
    try {
      g.items = await g.handler.captureAfter(page, portalFrame, g.items, captureCtx);
    } catch (e) {
      console.error("live capture '" + g.handler.type + "' failed:", e.message);
    }
    mark("film:" + g.handler.type);
  }

  // Filming strips every background so the frames carry icon pixels only.
  // Those styles must not outlive the burst: the page is reused for later
  // captures, and a leftover strip turns the next still into text on
  // black with no panels at all.
  const unfilm = (target) =>
    target
      .evaluate(() => {
        document.querySelectorAll("style").forEach((n) => {
          if ((n.textContent || "").includes("mm-film")) n.remove();
        });
      })
      .catch(() => {});
  await unfilm(page);
  if (portalFrame) await unfilm(portalFrame);

  // areas where a pointer gesture is live (calendar swipe surfaces)
  let regions = null;
  try {
    regions = await nativeWidgets.extractRegions(portalFrame, { pageIdx });
    if (regions) console.log("regions:", regions.length);
  } catch (e) {
    console.error("region extraction failed:", e.message);
  }
  mark("regions");

  const pageMeta = await extractPageMeta(page);
  const overlays = groups.flatMap((g) => g.items);
  const manifest = {
    schema: SCHEMA_VERSION,
    canvas: { width, height },
    overlays,
    effects,
    targets,
    regions,
    pageMeta,
    imageFile: path.basename(outPath),
    // Content identity for the image, so a device only re-fetches and
    // re-decodes a page whose pixels actually changed. Filenames are
    // stable across renders; without this every publish looked new.
    imageHash: crypto.createHash("md5").update(fs.readFileSync(outPath)).digest("hex").slice(0, 12),
  };
  fs.writeFileSync(out.replace(/\.jpe?g$/i, "") + ".manifest.json", JSON.stringify(manifest, null, 1));
  mark("manifest");
  console.log("timings: total=" + (Date.now() - t0) + "ms " + marks.join(" "));
  console.log(
    "manifest:",
    overlays.length,
    "overlay(s)" + (pageMeta ? ", " + pageMeta.pageCount + " page(s)" : ""),
  );
  console.log(
    "saved",
    outPath,
    outWidth + "x" + outHeight + " (canvas " + width + "x" + height + ")" + (layered ? " [layered]" : ""),
  );
  return manifest;
}

module.exports = {
  openHarness,
  capturePage,
  extractPageMeta,
  wireDiagnostics,
  installIdleProbe,
  markPortalWork,
  awaitPortalIdle,
};
