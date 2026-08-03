/*
 * Phase 2 prototype: renders one page of a Mango Display as a JPEG.
 *
 * Loads the portal in designer mode (same URL the webapp Live Preview
 * underlay uses), waits for the portal's own mm-designer-ready signal
 * (fires once every image has resolved, 4s internal cap), then
 * screenshots the viewport.
 *
 *   node render.js <designer-url> [out.jpg] [width] [height]
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const nativeWidgets = require("./nativeWidgets");

const url = process.argv[2];
const out = process.argv[3] || "display.jpg";
// --meta: load + extract page metadata only (no screenshot/overlays) -
// the watcher polls this to catch page-setting changes the backend
// doesn't push socket events for
const metaOnly = out === "--meta";
// canvas = the coordinate space layouts are authored in (portal has no
// responsive reflow, so this must stay the design resolution)
const width = parseInt(process.argv[4] || "1920", 10);
const height = parseInt(process.argv[5] || "1080", 10);
// output = the device's actual resolution; the canvas is CSS-scaled down to
// it inside the browser, so text rasterizes natively at the target size
const outWidth = parseInt(process.argv[6] || String(width), 10);
const outHeight = parseInt(process.argv[7] || String(height), 10);

if (!url) {
  console.error("usage: node render.js <designer-url> [out.jpg|--meta] [canvasW] [canvasH] [outW] [outH]");
  process.exit(1);
}

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
        const walk = (s) => {
          if (!s || found) return;
          if (s.groups && s.groups.length) {
            found = s.groups;
            return;
          }
          walk(s.$$childHead);
          walk(s.$$nextSibling);
        };
        walk(inj.get("$rootScope"));
        if (found) {
          return {
            pageCount: found.length,
            pages: found.map((g) => ({
              delaySeconds: parseInt(g.delay, 10) || 60,
              transition: g.transition || "fade",
              autoRotate: g.isAutoPageRotation === true,
            })),
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

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: outWidth, height: outHeight } });
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

    // The portal only fires mm-designer-ready when embedded in an iframe
    // (mainController.js: `window.parent !== window` guard), so mirror how
    // the layout editor embeds it: a harness page with a viewport-sized
    // iframe, listening for the signal on the top window
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
    // freeze the portal's CSS entrance animations — a screenshot robot
    // doesn't need the 3s fade, and widgets jump straight to final state.
    // The handle is kept so live-capture handlers can re-enable animation
    // after the still is taken.
    let noAnimStyle = null;
    try {
      const iframeEl = await page.waitForSelector("iframe", { timeout: 10000 });
      const frame = await iframeEl.contentFrame();
      if (frame) {
        await frame.waitForLoadState("domcontentloaded");
        noAnimStyle = await frame.addStyleTag({
          content: "*,*::before,*::after{transition:none !important;animation:none !important;}",
        });
      }
    } catch (e) {
      console.error("no-anim CSS injection failed (fade will run):", e.message);
    }

    try {
      await page.waitForFunction("window.__mmReady === true", null, { timeout: 15000 });
      console.log("mm-designer-ready received");
    } catch (e) {
      console.error("no ready signal within 15s - capturing anyway");
      try {
        console.error("[debug] top __mmReady:", await page.evaluate("typeof window.__mmReady + '=' + window.__mmReady"));
        console.error("[debug] frames:", page.frames().map((f) => f.url().slice(0, 90)));
        const portalFrame = page.frames().find((f) => f.url().includes("designer=true"));
        if (portalFrame) {
          console.error("[debug] portal sees parent!==window:", await portalFrame.evaluate("window.parent !== window"));
        }
      } catch (dbgErr) {
        console.error("[debug] diagnostics failed:", dbgErr.message);
      }
    }
    // entrance animations are disabled above, so only a short paint settle
    // is needed after the ready signal
    await page.waitForTimeout(400);

    if (metaOnly) {
      const meta = await extractPageMeta(page);
      console.log("META:" + JSON.stringify(meta));
      return;
    }

    // native-widget pass (see NATIVE_WIDGETS.md): measure overlays, hide
    // their dynamic elements, screenshot, then run live captures (which
    // need animations running again), and publish the manifest last
    const outDir = path.dirname(path.resolve(out));
    // designer mode keeps every page in the DOM (hidden pages use
    // visibility:hidden), so extractors see all pages' widgets - keep
    // only the rendered page's
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

    // display-wide visual overlays (balloons, snow, ...) are animated
    // natively on the Roku, so keep their canvases out of the still
    let effects = [];
    if (portalFrame) {
      try {
        effects = await nativeWidgets.extractEffects(portalFrame, { outDir });
        // hide whenever any effect element exists, even if nothing is
        // emitted, so nothing gets baked twice
        await nativeWidgets.hideEffects(portalFrame);
        if (effects.length) {
          await page.waitForTimeout(80);
          console.log("effects:", effects.map((e) => e.type).join(", "));
        }
      } catch (e) {
        console.error("effect extraction failed:", e.message);
      }
    }

    // layered mode: a rotating page background means the widgets must be
    // captured as a transparent PNG so the Roku can stack native photos
    // UNDER them (see NATIVE_WIDGETS.md)
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

    const captureCtx = {
      outDir,
      layered,
      outScale: outWidth / width,
      reenableAnimations: async () => {
        if (noAnimStyle) {
          await noAnimStyle.evaluate((n) => n.remove()).catch(() => {});
          noAnimStyle = null;
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
    }

    // page metadata (count, per-page delay/transition/rotation) straight
    // from the portal's Angular scope - drives multi-page rendering and
    // the Roku's page carousel
    const pageMeta = await extractPageMeta(page);

    const overlays = groups.flatMap((g) => g.items);
    fs.writeFileSync(
      out.replace(/\.jpe?g$/i, "") + ".manifest.json",
      JSON.stringify(
        { canvas: { width, height }, overlays, effects, pageMeta, imageFile: path.basename(outPath) },
        null,
        1,
      ),
    );
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
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
