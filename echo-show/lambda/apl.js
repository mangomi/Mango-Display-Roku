// The skill's screens as APL documents.
//
// Pairing mirrors tvos PairingView.swift / MainScene.xml's pairingGroup:
// logo, heading, code, setup line in a centered column, laid out in the
// 1920-wide design space and converted to this screen's size. The copy
// stays activation-only, as on Roku and tvOS - no signup steering.
//
// A skill cannot run between requests, so every screen that needs the
// skill again carries its own heartbeat: a document-level handleTick that
// sends an APL UserEvent back to the skill (index.js), which answers with
// the next screen or nothing.

const env = require("./env");
const { clockComponents } = require("./clock");

const APL_VERSION = "2023.2";
const PAIR_TICK_MS = 5000;     // the TVs' pairing poll cadence
const DISPLAY_TICK_MS = 60000; // the TVs' fallback refresh when /wait cannot connect

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

function doc(items, tickMs, tickArg) {
  const d = {
    type: "APL",
    version: APL_VERSION,
    theme: "dark",
    mainTemplate: { items: [{ type: "Frame", width: "100vw", height: "100vh", backgroundColor: "black", items }] },
  };
  if (tickMs) d.handleTick = [{ minimumDelay: tickMs, commands: [{ type: "SendEvent", arguments: [tickArg] }] }];
  return d;
}

function directive(token, document) {
  return { type: "Alexa.Presentation.APL.RenderDocument", token, document };
}

/** Pairing / "Connected" screen. `connected` = claimed, first page not here yet. */
function pairingScreen(vp, code, connected) {
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
  return directive("pairing", doc(items, PAIR_TICK_MS, connected ? "loading" : "pair"));
}

/** First page that has a clock (else page 0): its image plus the live
 * clock(s) on top. V1 draws only `clock` overlays; everything else the
 * device would animate (gif, slideshow, effects...) is not drawn yet. */
function displayScreen(vp, display) {
  const { manifest, assetBase } = display;
  const pages = manifest.pages || [];
  let page = pages.find((p) => (p.overlays || []).some((o) => o.type === "clock")) || pages[0];
  const place = placement(manifest.canvas || { width: 1920, height: 1080 }, vp);
  const items = [];
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
  return directive("display", doc(items, DISPLAY_TICK_MS, "refresh"));
}

module.exports = { viewportDp, placement, pairingScreen, displayScreen };
