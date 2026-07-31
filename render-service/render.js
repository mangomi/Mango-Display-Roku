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
// canvas = the coordinate space layouts are authored in (portal has no
// responsive reflow, so this must stay the design resolution)
const width = parseInt(process.argv[4] || "1920", 10);
const height = parseInt(process.argv[5] || "1080", 10);
// output = the device's actual resolution; the canvas is CSS-scaled down to
// it inside the browser, so text rasterizes natively at the target size
const outWidth = parseInt(process.argv[6] || String(width), 10);
const outHeight = parseInt(process.argv[7] || String(height), 10);

if (!url) {
  console.error("usage: node render.js <designer-url> [out.jpg] [canvasW] [canvasH] [outW] [outH]");
  process.exit(1);
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

    // native-widget pass (see NATIVE_WIDGETS.md): measure overlays, hide
    // their dynamic elements, screenshot, then run live captures (which
    // need animations running again), and publish the manifest last
    const outDir = path.dirname(path.resolve(out));
    const groups = [];
    const portalFrame = page.frames().find((f) => f.url().includes("designer=true"));
    if (portalFrame) {
      for (const handler of nativeWidgets.handlers) {
        try {
          let found = await handler.extract(portalFrame);
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

    await page.screenshot({ path: out, type: "jpeg", quality: 85 });

    const captureCtx = {
      outDir,
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

    const overlays = groups.flatMap((g) => g.items);
    fs.writeFileSync(
      out.replace(/\.jpe?g$/i, "") + ".manifest.json",
      JSON.stringify({ canvas: { width, height }, overlays }, null, 1),
    );
    console.log("manifest:", overlays.length, "overlay(s)");
    console.log("saved", out, outWidth + "x" + outHeight + " (canvas " + width + "x" + height + ")");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
