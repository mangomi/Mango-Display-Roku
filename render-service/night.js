/* Night mode.
 *
 * When a display's overlay settings say nightMode, the portal drops a
 * fixed full-screen container over everything: a looping black video and
 * a small "Night mode" badge (mango icon + grey text at 42% opacity, 24px
 * from the bottom-right corner) that every 35s fades out over 4s, moves by
 * a few random pixels and fades back in - a burn-in guard. The regular
 * widgets stay in the page underneath, just covered, so a normal capture
 * would still hand the device a clock to draw over the dark (Dave saw
 * exactly that, 2026-09-03).
 *
 * So a night page is captured on its own terms: a fully transparent page
 * image, no widgets, no effects, and ONE motion overlay - the portal's
 * own badge photographed once, with opacity and translation tracks that
 * replay its fade-nudge-fade cycle through a short list of pre-baked
 * offsets in the portal's own ranges. The device plays its black clip
 * full screen underneath (MainScene applyNight): a real video, not a
 * black picture, because TVs dim their backlight for video (Dave's call,
 * 2026-09-03), and the same clip is what keeps the box awake anyway.
 *
 * Both transitions are already announced by the portal: the flag rides
 * the mirror data at load and the socket's "overlay" push, which the
 * worker re-captures every page on.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SLOT_MS = 35000; /* portal: $interval(cycle, 35000) */
const FADE_MS = 4000; /* portal: transition: opacity 4s */
const SLOTS = 8; /* offsets before the loop repeats: 280s */
/* the portal shows the badge at 0.42, but over the Roku's video plane
 * that read as barely there on Dave's TV (2026-09-03): brighter here */
const BADGE_OPACITY = 0.85;
/* portal randomOffset(): x in [-5, 15), y in [-3, 9) */
const PAD = { left: 5, top: 3, right: 15, bottom: 9 };

async function isNightMode(frame) {
  if (!frame) return false;
  try {
    return await frame.evaluate(() => {
      const ctl = document.querySelector('[ng-controller="MainCtrl"]');
      const sc = ctl && window.angular ? window.angular.element(ctl).scope() : null;
      return !!(sc && sc.overlaySetting && sc.overlaySetting.nightMode === true);
    });
  } catch (e) {
    return false;
  }
}

/* deterministic "random" offsets: the same display shows the same
 * sequence every render, so a republish never restarts the badge
 * somewhere new */
function offsets() {
  let s = 20260903;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const out = [[0, 0]];
  for (let i = 1; i < SLOTS; i++) out.push([Math.round((rnd() * 20 - 5) * 10) / 10, Math.round((rnd() * 12 - 3) * 10) / 10]);
  return out;
}

function tracks() {
  const cycleMs = SLOT_MS * SLOTS;
  const k = (ms) => Math.round((ms / cycleMs) * 10000) / 10000;
  const pos = offsets();
  const trans = { prop: "translation", cycleMs, delayMs: 0, keys: [], values: [] };
  const op = { prop: "opacity", cycleMs, delayMs: 0, keys: [], values: [] };
  for (let i = 0; i < SLOTS; i++) {
    const t0 = i * SLOT_MS;
    const t1 = t0 + SLOT_MS;
    /* held for the slot; the jump to the next offset happens in the
     * last few ms, while the badge is faded out */
    trans.keys.push(k(t0), k(t1 - 50));
    trans.values.push([PAD.left + pos[i][0], PAD.top + pos[i][1]], [PAD.left + pos[i][0], PAD.top + pos[i][1]]);
    op.keys.push(k(t0), k(t0 + FADE_MS), k(t1 - FADE_MS), k(t1 - 50));
    op.values.push(0, BADGE_OPACITY, BADGE_OPACITY, 0);
  }
  trans.keys.push(1);
  trans.values.push([PAD.left + pos[0][0], PAD.top + pos[0][1]]);
  op.keys.push(1);
  op.values.push(0);
  return [trans, op];
}

/* Photograph the portal's badge once at output scale, padded to the
 * box the offsets sweep, and cache it by size. */
async function badgeOverlay(page, frame, opts) {
  const sharp = require("sharp");
  const { outDir, outScale } = opts;
  const rect = await frame.evaluate(() => {
    const el = document.querySelector(".night-indicator");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (!rect || rect.w < 4 || rect.h < 4) return null;
  const outW = Math.max(1, Math.round((rect.w + PAD.left + PAD.right) * outScale));
  const outH = Math.max(1, Math.round((rect.h + PAD.top + PAD.bottom) * outScale));
  const metaFile = path.join(outDir, "overlay_night_" + outW + "x" + outH + ".json");
  let meta = null;
  try {
    meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    if (!meta.file || !fs.existsSync(path.join(outDir, meta.file))) meta = null;
  } catch (e) {
    meta = null;
  }
  if (!meta) {
    await frame.evaluate(() => {
      const st = document.createElement("style");
      st.id = "mm-night-iso";
      st.textContent =
        "html, body, #main, .nightmode-container { background: transparent !important } " +
        "body * { visibility: hidden !important } " +
        ".night-indicator, .night-indicator * { visibility: visible !important } " +
        ".night-indicator { opacity: 1 !important; transition: none !important; transform: none !important }";
      document.head.appendChild(st);
    });
    let png;
    try {
      await page.addStyleTag({ content: "/*mm-film*/html,body{background:transparent !important}" }).catch(() => {});
      await frame.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const shot = await page.screenshot({
        type: "png",
        omitBackground: true,
        clip: { x: rect.x, y: rect.y, width: Math.max(1, rect.w), height: Math.max(1, rect.h) },
      });
      png = await sharp({ create: { width: outW, height: outH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: shot, left: Math.round(PAD.left * outScale), top: Math.round(PAD.top * outScale) }])
        .png()
        .toBuffer();
    } finally {
      await frame
        .evaluate(() => {
          const st = document.getElementById("mm-night-iso");
          if (st) st.remove();
        })
        .catch(() => {});
      await page
        .evaluate(() => document.querySelectorAll("style").forEach((n) => { if ((n.textContent || "").includes("mm-film")) n.remove(); }))
        .catch(() => {});
    }
    const file = "overlay_night_" + outW + "x" + outH + "_" + crypto.createHash("md5").update(png).digest("hex").slice(0, 8) + ".png";
    fs.writeFileSync(path.join(outDir, file), png);
    meta = { file };
    fs.writeFileSync(metaFile, JSON.stringify(meta));
    console.log("night: badge photographed " + outW + "x" + outH + " (" + file + ")");
  }
  return {
    type: "motion",
    night: true,
    rect: { x: rect.x - PAD.left, y: rect.y - PAD.top, w: rect.w + PAD.left + PAD.right, h: rect.h + PAD.top + PAD.bottom },
    layers: [{ file: meta.file, tracks: tracks(), opacity: 0 }],
  };
}

/* The whole night capture: transparent page image + the badge. */
async function captureNight(page, frame, opts) {
  const sharp = require("sharp");
  const { out, outDir, width, height, outWidth, outHeight, outScale } = opts;
  const outPath = out.replace(/\.jpe?g$/i, "") + ".png";
  await sharp({ create: { width: outWidth, height: outHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png()
    .toFile(outPath);
  let badge = null;
  try {
    badge = await badgeOverlay(page, frame, { outDir, outScale });
  } catch (e) {
    console.error("night: badge failed:", e.message);
  }
  return { outPath, overlays: badge ? [badge] : [] };
}

module.exports = { isNightMode, captureNight, tracks, offsets };
