/*
 * One-shot render of a single display page.
 *
 *   node render.js <designer-url> [out.jpg|--meta] [canvasW] [canvasH] [outW] [outH]
 *
 * The capture pipeline itself lives in capture.js so the live interaction
 * session (session.js) produces byte-identical output.
 */
const { chromium } = require("playwright");
const { openHarness, capturePage, extractPageMeta, wireDiagnostics } = require("./capture");

const url = process.argv[2];
const out = process.argv[3] || "display.jpg";
// --meta: load and read page metadata only, no screenshot. The watcher
// polls this to catch page-setting changes the backend doesn't push.
const metaOnly = out === "--meta";
// canvas = the coordinate space layouts are authored in (the portal has
// no responsive reflow, so this must stay the design resolution)
const width = parseInt(process.argv[4] || "1920", 10);
const height = parseInt(process.argv[5] || "1080", 10);
// output = the device's actual resolution; the canvas is CSS-scaled down
// to it in the browser, so text rasterizes natively at the target size
const outWidth = parseInt(process.argv[6] || String(width), 10);
const outHeight = parseInt(process.argv[7] || String(height), 10);

if (!url) {
  console.error("usage: node render.js <designer-url> [out.jpg|--meta] [canvasW] [canvasH] [outW] [outH]");
  process.exit(1);
}

// per-display state (the calendar override) lives in the display's own
// directory; the watcher passes it explicitly, and a bare CLI run falls
// back to the output file's directory
const path = require("path");
const stateDir = process.env.MANGO_STATE_DIR || (metaOnly ? __dirname : path.dirname(path.resolve(out)));

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: outWidth, height: outHeight } });
    wireDiagnostics(page);
    const state = await openHarness(page, { url, width, height, outWidth, outHeight, stateDir });

    if (metaOnly) {
      const meta = await extractPageMeta(page);
      console.log("META:" + JSON.stringify(meta));
      return;
    }

    await capturePage(page, {
      out,
      url,
      width,
      height,
      outWidth,
      outHeight,
      state,
      apiBase: process.env.MANGO_API_BASE || "",
    });
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
