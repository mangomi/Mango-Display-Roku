// Manifest overlay type -> APL components: the Echo's overlayRegistry
// (MainScene.brs, tvos DisplayView OverlayItemView). Draw order is the
// contract (MANIFEST.md): UNDER types go beneath the page image (a layered
// PNG page is transparent where they show through), everything else above
// it, in manifest order.
//
// Every builder has the same shape:
//   build(cfg, ctx) -> [APL components], absolutely positioned
//   ctx = { place, canvas, assetBase, vp, idPrefix }
//     place     canvas px -> viewport dp (apl.placement): .rect(r), .len(v)
//     canvas    { width, height } of the manifest
//     assetBase URL prefix for manifest file names
//     idPrefix  unique per page+overlay ("p0o3"), for component ids
//     pageIndex, refreshArgs, major, minor, overrides - for overlays that
//               carry their own touch targets (scroll strips' checkboxes);
//               same meaning as in touch.js
// Unknown types draw nothing (a newer service may send types this client
// does not know yet - a missing widget beats a broken screen).

const { clockComponents } = require("./clock");

const UNDER = new Set(["background"]);

// type -> builder. Each type lives in its own module (overlay-<type>.js).
const BUILDERS = {
  clock: (cfg, ctx) => clockComponents(cfg, ctx.place),
  background: (cfg, ctx) => {
    // the slideshow module cycles background photos too; until it draws
    // something, the first photo stays as a still
    const cycled = require("./overlay-slideshow").build(cfg, ctx);
    return cycled.length ? cycled : backgroundComponents(cfg, ctx);
  },
  slideshow: (cfg, ctx) => require("./overlay-slideshow").build(cfg, ctx),
  gif: (cfg, ctx) => require("./overlay-gif").build(cfg, ctx),
  countdown: (cfg, ctx) => require("./overlay-countdown").build(cfg, ctx),
  scroll: (cfg, ctx) => require("./overlay-scroll").build(cfg, ctx),
  motion: (cfg, ctx) => require("./overlay-motion").build(cfg, ctx),
};

function register(type, build) {
  BUILDERS[type] = build;
}

/** A `background` overlay, first photo still (the cycling slideshow
 * module replaces this when it lands): no rect means the whole canvas;
 * the portal dims it with filter:brightness(n), redrawn as black at 1-n
 * on top (SlideshowOverlayView.swift). */
function backgroundComponents(o, ctx) {
  const images = Array.isArray(o.images) ? o.images : [];
  if (!images.length) return [];
  const r = ctx.place.rect(o.rect || { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height });
  const box = { position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h };
  const out = [];
  if (o.pageColor) out.push({ type: "Frame", ...box, backgroundColor: o.pageColor });
  out.push({ type: "Image", ...box, source: images[0], scale: o.cropToFill ? "best-fill" : "best-fit" });
  const brightness = typeof o.brightness === "number" ? o.brightness : 1;
  if (brightness < 1) out.push({ type: "Frame", ...box, backgroundColor: "black", opacity: 1 - Math.max(0, brightness) });
  return out;
}

/** { under: [...], over: [...] } for one page's overlays. */
function pageOverlays(page, ctxBase, pageIndex) {
  const under = [];
  const over = [];
  ((page && page.overlays) || []).forEach((o, i) => {
    const build = o && BUILDERS[o.type];
    if (!build) return;
    const comps = build(o, { ...ctxBase, idPrefix: "p" + pageIndex + "o" + i }) || [];
    (UNDER.has(o.type) ? under : over).push(...comps);
  });
  return { under, over };
}

module.exports = { pageOverlays, register, BUILDERS, UNDER, backgroundComponents };
