// The skill's screens as APL documents.
//
// Pairing mirrors tvos PairingView.swift / MainScene.xml's pairingGroup:
// logo, heading, code, setup line in a centered column, laid out in the
// 1920-wide design space and converted to this screen's size. The copy
// stays activation-only, as on Roku and tvOS - no signup steering.
//
// A skill cannot run between requests, so every screen carries its own
// heartbeat (heartbeat() below): a loop started on mount that waits, sends
// an APL UserEvent back to the skill (index.js), and repeats. The skill
// answers with the next screen or nothing. The loop doubles as the
// stay-awake: its waits hold `screenLock`, which stops the screen's
// inactivity timer for as long as they run (APL base command properties).
//
// Each event carries the state the skill needs to answer it (which screen,
// version shown, major/minor), because Alexa closes the SESSION ~30s after
// a response even while the screen stays up - the skill must not depend on
// session attributes surviving.

const env = require("./env");
const { clockComponents } = require("./clock");

const APL_VERSION = "2023.2";
const PAIR_TICK_MS = 5000;     // the TVs' pairing poll cadence
// How long a backend change (calendar edit, layout) may take to show. The
// TVs are told at once over a held /wait; the Echo has to ask.
const DISPLAY_TICK_MS = 10000;
// Asked of the device as well; advisory only, devices may cap it
const IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** Viewport size in dp from the request (falls back to Echo Show 15). */
function viewportDp(requestEnvelope) {
  const vp = (requestEnvelope.context && requestEnvelope.context.Viewport) || {};
  const dpi = vp.dpi || 160;
  const pw = vp.currentPixelWidth || vp.pixelWidth || 1920;
  const ph = vp.currentPixelHeight || vp.pixelHeight || 1080;
  return { w: Math.round((pw * 160) / dpi), h: Math.round((ph * 160) / dpi), pw, ph };
}

/** Maps canvas px to viewport dp: one uniform scale, letterboxed and
 * centered - the same stage-scale safety net as MainScene.applyCanvas. */
function placement(canvas, vp) {
  const s = Math.min(vp.w / canvas.width, vp.h / canvas.height);
  const ox = (vp.w - canvas.width * s) / 2;
  const oy = (vp.h - canvas.height * s) / 2;
  return {
    scale: s, ox, oy,
    len: (v) => v * s,
    rect: (r) => ({ x: ox + r.x * s, y: oy + r.y * s, w: r.w * s, h: r.h * s }),
  };
}

/** The wait-send-repeat loop. On its own named sequencer so it runs in
 * normal mode (tick handlers run in fast mode, where SendEvent is
 * ignored) and a touch on the main sequencer cannot cancel it. ~1M
 * repeats at 5-10s is months - in practice a new screen replaces it. */
function heartbeat(ms, args) {
  return [{
    type: "Sequential",
    sequencer: "heartbeat",
    screenLock: true,
    repeatCount: 1000000,
    commands: [
      { type: "Idle", delay: ms, screenLock: true },
      { type: "SendEvent", arguments: args },
    ],
  }];
}

/** `args` is what the heartbeat sends; a rotation (Echo Show 15) sends
 * "rotate" + the same, so the skill redraws for the new viewport. */
function doc(items, tickMs, args) {
  return {
    type: "APL",
    version: APL_VERSION,
    theme: "dark",
    settings: { idleTimeout: IDLE_TIMEOUT_MS },
    onMount: heartbeat(tickMs, args),
    onConfigChange: [{ type: "SendEvent", sequencer: "rotate", arguments: ["rotate"].concat(args) }],
    mainTemplate: { items: [{ type: "Frame", width: "100vw", height: "100vh", backgroundColor: "black", items }] },
  };
}

function directive(token, document) {
  return { type: "Alexa.Presentation.APL.RenderDocument", token, document };
}

/** Pairing / "Connected" screen. `connected` = claimed, first page not
 * here yet; `paired` = { major, minor } when connected. */
function pairingScreen(vp, code, connected, paired) {
  const k = vp.w / 1920;
  const col = [];
  if (process.env.LOGO_URL) {
    col.push({ type: "Image", source: process.env.LOGO_URL, width: 560 * k, height: 136 * k, scale: "best-fit", paddingBottom: 70 * k });
  } else {
    col.push({ type: "Text", text: "Mango Display", color: "#F7931E", fontSize: 96 * k, fontWeight: "bold", textAlign: "center", paddingBottom: 70 * k });
  }
  col.push({ type: "Text", text: connected ? "Connected" : "Display Device Code", color: "white", fontSize: 40 * k, fontWeight: "bold", textAlign: "center", paddingBottom: 36 * k });
  col.push({ type: "Text", text: connected ? "Loading your display..." : code, color: "white", fontSize: 72 * k, textAlign: "center", paddingBottom: 90 * k });
  if (!connected) {
    col.push({ type: "Text", text: "Setup at " + env.setupHost + " using any browser", color: "#CCCCCC", fontSize: 28 * k, textAlign: "center" });
  }
  const items = [{ type: "Container", width: "100%", alignItems: "center", paddingTop: 230 * k, items: col }];
  const args = connected ? ["loading", "", paired.major, paired.minor] : ["pair"];
  return directive("pairing", doc(items, PAIR_TICK_MS, args));
}

/** A `background` overlay: no rect means the whole canvas; the portal
 * dims it with filter:brightness(n), redrawn as black at 1-n on top
 * (SlideshowOverlayView.swift). */
function backgroundComponents(o, canvas, place) {
  const images = Array.isArray(o.images) ? o.images : [];
  if (!images.length) return [];
  const r = place.rect(o.rect || { x: 0, y: 0, w: canvas.width, h: canvas.height });
  const box = { position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h };
  const out = [];
  if (o.pageColor) out.push({ type: "Frame", ...box, backgroundColor: o.pageColor });
  out.push({ type: "Image", ...box, source: images[0], scale: o.cropToFill ? "best-fill" : "best-fit" });
  const brightness = typeof o.brightness === "number" ? o.brightness : 1;
  if (brightness < 1) out.push({ type: "Frame", ...box, backgroundColor: "black", opacity: 1 - Math.max(0, brightness) });
  return out;
}

/** First page that has a clock (else page 0): its image plus the live
 * clock(s) on top. V1 draws only `clock` overlays; everything else the
 * device would animate (gif, slideshow, effects...) is not drawn yet. */
function displayScreen(vp, display, paired) {
  const { manifest, assetBase } = display;
  const pages = manifest.pages || [];
  let page = pages.find((p) => (p.overlays || []).some((o) => o.type === "clock")) || pages[0];
  const place = placement(manifest.canvas || { width: 1920, height: 1080 }, vp);
  const items = [];
  // a PNG page is layered: the page background is drawn BEHIND it
  // (MANIFEST.md). V1 shows its first photo, still; the rotation through
  // the rest comes with slideshows.
  for (const o of (page && page.overlays) || []) {
    if (o.type === "background") items.push(...backgroundComponents(o, manifest.canvas, place));
  }
  if (page && page.image) {
    items.push({
      type: "Image",
      position: "absolute",
      left: place.ox, top: place.oy,
      width: manifest.canvas.width * place.scale,
      height: manifest.canvas.height * place.scale,
      // the hash busts the Echo's image cache only when the pixels changed
      source: assetBase + page.image + (page.imageHash ? "?h=" + page.imageHash : ""),
      scale: "fill",
    });
  }
  for (const o of (page && page.overlays) || []) {
    if (o.type === "clock") items.push(...clockComponents(o, place));
  }
  return directive("display", doc(items, DISPLAY_TICK_MS, ["refresh", String(display.version), paired.major, paired.minor]));
}

module.exports = { viewportDp, placement, pairingScreen, displayScreen };
