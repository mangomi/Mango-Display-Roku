/*
 * Register a device code on the TEST backend from inside a real browser
 * page. Claude's sandbox mangles outbound POSTs from node/curl (empty
 * {"error":{}} 500s), but Chromium's network stack is unaffected - the
 * portal's own API calls from Playwright pages have always landed. So the
 * saveMirror goes out from a page on the portal's origin, exactly like a
 * browser-based display would send it.
 *
 *   node tools/register-via-browser.js RK123456789 [w h]
 *
 * Run from render-service/ so playwright resolves.
 */
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "render-service", "node_modules", "playwright"));

const API = process.env.MANGO_API_BASE || "https://testapi.mangomirror.com/v1.0.5/";
if (!/testapi\./.test(API)) {
  console.error("refusing: " + API + " is not the test backend");
  process.exit(1);
}
const code = process.argv[2];
const w = parseInt(process.argv[3] || "1280", 10);
const h = parseInt(process.argv[4] || "720", 10);
if (!code || !/^RK[1-9]{9}$/.test(code)) {
  console.error("usage: node tools/register-via-browser.js RK<9 digits 1-9> [w h]");
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto("https://testportal.mangodisplay.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    const result = await page.evaluate(
      async ({ api, body }) => {
        try {
          const r = await fetch(api + "mirrors/saveMirror", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          return { ok: true, status: r.status, text: (await r.text()).slice(0, 300) };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },
      {
        api: API,
        body: {
          deviceId: code,
          delay: 60,
          deviceMode: "portrait",
          deviceType: "Android tablet",
          isBeaconEnabled: false,
          deviceWidth: w,
          deviceHeight: h,
        },
      },
    );
    console.log("saveMirror:", JSON.stringify(result));
  } finally {
    await browser.close();
  }
})();
