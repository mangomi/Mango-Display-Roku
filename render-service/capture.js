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
const nativeWidgets = require("./nativeWidgets");

// Manifest contract version - see MANIFEST.md. Bump on a BREAKING change
// (a field removed or its meaning changed); additive fields do not need
// it. Clients should refuse a major version they do not understand rather
// than guess, which is the whole point of having it before there are two
// of them.
const SCHEMA_VERSION = 1;

// `groups` lives on the MainCtrl child scope, so walk the scope tree
// from $rootScope (works even with Angular debug info off)
async function extractPageMeta(page) {
  const portalFrame = page.frames().find((f) => f.url().includes("designer=true"));
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

async function openHarness(page, opts) {
  const { url, width, height, outWidth, outHeight } = opts;
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
  await applyCalendarOverride(page);
  hmark("settle+override");
  console.log("harness: total=" + (Date.now() - th0) + "ms " + hm.join(" "));
  return state;
}

// A calendar the user scrolled with the remote is not part of what the
// portal serves on load - the backend hands the new range out over the
// socket and forgets it. The watcher keeps the last one it saw, so every
// render re-applies it and the view the user asked for survives the next
// refresh instead of snapping back a few seconds later.
async function applyCalendarOverride(page) {
  let saved = null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "calendar-override.json"), "utf8"));
    if (raw && raw.widgets && Date.now() - raw.at < (raw.holdMs || 600000)) saved = raw.widgets;
  } catch (e) {
    return;
  }
  if (!saved || !Object.keys(saved).length) return;
  const frame = page.frames().find((f) => f.url().includes("designer=true"));
  if (!frame) return;
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

      const el = wanted[0].el;
      let sc = window.angular.element(el).scope();
      while (sc && !sc.updateCalendarData) sc = sc.$parent;
      if (!sc) return { skip: "no handler" };
      const before = (el.innerText || "").replace(/\s+/g, " ").slice(0, 60);
      sc.updateCalendarData(data); // runs its own $apply - never wrap it
      return { before, ids: wanted.map((w) => w.id) };
    }, saved);

    if (res.skip) return;
    // the portal defers its repaint behind a 2s timeout, so this is a
    // short wait for a change we know is coming, not a blind timeout
    await frame
      .waitForFunction(
        (prev) => {
          const el = [...document.querySelectorAll("[ng-swipe-up][ng-swipe-down]")].find(
            (e) => getComputedStyle(e).visibility !== "hidden",
          );
          return el && (el.innerText || "").replace(/\s+/g, " ").slice(0, 60) !== prev;
        },
        res.before,
        { timeout: 3500 },
      )
      .catch(() => {});
    await page.waitForTimeout(200);
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
  const portalFrame = page.frames().find((f) => f.url().includes("designer=true"));

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
  const layered = groups.some((g) => g.handler.type === "background" && g.items.length);
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

module.exports = { openHarness, capturePage, extractPageMeta, wireDiagnostics };
