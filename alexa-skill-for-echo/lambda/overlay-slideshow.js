// Photo slideshow widget AND rotating page background (the manifest's
// `slideshow` and `background` types both land here, as in the Roku's
// overlay registry). Port of SlideshowOverlay.brs / SlideshowOverlayView
// .swift: steps through the manifest's photo list on the widget's own
// interval (min 3s, default 60s) with the widget's own transition, clipped
// to the widget rect; the first reveal always fades (nothing meaningful to
// slide from); a photo that fails to load is skipped.
//
// It all runs on the Echo, like the clock: the skill only builds the
// document. Two Images, A (below) and B (above), take turns as the photo
// on show. A loop started on mount waits the interval, then hands the
// next URL to the hidden one; only that Image's onLoad starts the
// transition, so the old photo stays up until the new one is decoded -
// never an empty frame (the idea of apl.js pageImages). The state lives
// on the slideshow's container:
//
//   mmSsUrls   the photo list (mmSsPre + each + mmSsSuf: see affixes)
//   mmSsIdx    the photo shown or loading
//   mmSsFront  "A" | "B" | "" (none yet - the first reveal)
//   mmSsBusy   a load + transition is in flight; the loop waits for it
//   mmSsWait   ticks spent waiting (a load that never ends is given up)
//
// APL has no z-order control, so B always draws over A. The transitions
// are built so that does not matter: fade animates whichever of the two is
// on top (B fades in over A, or out to reveal A), slides move both photos
// (they never overlap) and flip squashes one before the other expands.
//
// Photos can be ~3000px originals. The Roku caps decode at the widget
// size (loadWidth); here the device decodes whatever it is sent, so
// Unsplash URLs ask the image CDN for the widget's size instead.

const { EASE } = require("./pages");

const DEFAULT_INTERVAL_S = 60;
const MIN_INTERVAL_S = 3;
const SWAP_MS = 3000;     // every transition, as on the Roku
const GIVE_UP_MS = 30000; // a load still pending this long is abandoned

// One transform shape everywhere, so every AnimateItem's from/to match.
const T = (tx = 0, ty = 0, sx = 1) => [{ translateX: tx }, { translateY: ty }, { scaleX: sx }];
const SQUASHED = T(0, 0, 0.0001);

const anim = (id, ms, easing, from, to, opFrom, opTo) => {
  const value = [];
  if (from) value.push({ property: "transform", from, to });
  if (opFrom !== undefined) value.push({ property: "opacity", from: opFrom, to: opTo });
  return { type: "AnimateItem", componentId: id, duration: ms, easing, value };
};
// put an Image at a transform/opacity before it shows (a 1ms animation,
// as pages.js does)
const place = (id, at, op) => anim(id, 1, "linear", at, at, op, op);

/** Ask the Unsplash CDN (imgix) for the photo at the widget's device-pixel
 * size, cropped (cover) or fitted (contain) the way the widget shows it -
 * the Roku's decode cap, done before the download. Other hosts unchanged. */
function sized(url, wPx, hPx, cropToFill) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return url;
  }
  if (u.hostname !== "images.unsplash.com") return url;
  u.searchParams.set("w", String(Math.ceil(wPx)));
  u.searchParams.set("h", String(Math.ceil(hPx)));
  u.searchParams.set("fit", cropToFill ? "crop" : "clip");
  u.searchParams.delete("crop"); // centred, like the portal's cover
  return u.toString();
}

/** Splits URLs into their shared start and end and what differs between
 * them: { pre, mids, suf }. A photo list from one source repeats a long
 * query string on every URL; sent once, 30 Unsplash photos shrink from
 * ~9 KB to ~2 KB of the document. */
function affixes(urls) {
  let pre = urls[0];
  for (const u of urls) while (!u.startsWith(pre)) pre = pre.slice(0, -1);
  const rest = urls.map((u) => u.slice(pre.length));
  let suf = rest[0];
  for (const u of rest) while (!u.endsWith(suf)) suf = suf.slice(1);
  return { pre, mids: rest.map((u) => u.slice(0, u.length - suf.length)), suf };
}

/** The commands that bring Image `x` in over `y` (component ids) with the
 * widget's transition; w/h the rect in dp. `xOnTop`: x is B. */
function swapCommands(transition, x, y, xOnTop, w, h) {
  const slides = { slideleft: [w, 0], slideright: [-w, 0], slideup: [0, h], slidedown: [0, -h] };
  if (slides[transition]) {
    const [dx, dy] = slides[transition];
    return [
      place(x, T(dx, dy), 1),
      { type: "Parallel", commands: [
        anim(x, SWAP_MS, EASE, T(dx, dy), T()),
        anim(y, SWAP_MS, EASE, T(), T(-dx, -dy)),
      ] },
    ];
  }
  if (transition === "flip") {
    // the pages' card flip: squash the old photo, expand the new one
    return [
      anim(y, SWAP_MS / 2, "ease-in", T(), SQUASHED),
      place(x, SQUASHED, 1),
      anim(x, SWAP_MS / 2, "ease-out", SQUASHED, T()),
    ];
  }
  // fade and unknown names: the top photo fades in over the old one, or
  // fades out to reveal the new one beneath it
  return xOnTop
    ? [place(x, T(), 0), anim(x, SWAP_MS, EASE, null, null, 0, 1)]
    : [place(x, T(), 1), anim(y, SWAP_MS, EASE, null, null, 1, 0)];
}

/** APL components for one `slideshow` or `background` overlay. */
function build(cfg, ctx) {
  const images = Array.isArray(cfg.images) ? cfg.images.filter((s) => typeof s === "string" && s) : [];
  // fewer than 2: draw nothing, like both shipped clients (a lone photo
  // travels as a pair of itself; overlays.js stills a lone background)
  if (images.length < 2) return [];
  const p = ctx.idPrefix;
  const ids = { box: p + "ss", A: p + "ssA", B: p + "ssB" };
  // page backgrounds have no rect - they fill the canvas
  const r = ctx.place.rect(cfg.rect || { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height });
  const devPx = ctx.vp && ctx.vp.w && ctx.vp.pw ? ctx.vp.pw / ctx.vp.w : 1;
  const crop = cfg.cropToFill === true;
  const urls = images.map((u) => sized(u, r.w * devPx, r.h * devPx, crop));
  const { pre, mids, suf } = affixes(urls);
  const s = Number(cfg.intervalSeconds);
  const intervalMs = Math.max(MIN_INTERVAL_S, Number.isFinite(s) && s > 0 ? s : DEFAULT_INTERVAL_S) * 1000;
  const transition = String(cfg.transition || "fade");
  const full = { position: "absolute", left: 0, top: 0, width: r.w, height: r.h };
  const set = (property, value, when) => ({ type: "SetValue", componentId: ids.box, property, value, when });

  // Image `x` loaded: if it is the photo being waited for, bring it in
  // (on its own sequencer, so a touch on the main one cannot cut the
  // transition short), then hide the old one and let the loop go on
  const image = (x, y) => ({
    type: "Image", id: ids[x], ...full,
    source: x === "A" ? urls[0] : "",
    scale: crop ? "best-fill" : "best-fit",
    opacity: 0,
    onLoad: [{
      type: "Sequential", sequencer: "slideshow" + p + "fx", when: "${mmSsBusy && mmSsFront != '" + x + "'}",
      commands: [
        { type: "Sequential", when: "${mmSsFront == ''}", commands: [place(ids[x], T(), 0), anim(ids[x], SWAP_MS, EASE, null, null, 0, 1)] },
        { type: "Sequential", when: "${mmSsFront != ''}", commands: swapCommands(transition, ids[x], ids[y], x === "B", r.w, r.h) },
        { type: "SetValue", componentId: ids[y], property: "opacity", value: 0 },
        set("mmSsFront", x), set("mmSsBusy", false), set("mmSsWait", 0),
      ],
    }],
    // a broken URL: the old photo stays, the next tick moves past it
    onFail: [set("mmSsBusy", false), set("mmSsWait", 0)],
  });

  const items = [];
  // page color sits under the photos (the layered page render is
  // transparent where they show through)
  if (cfg.pageColor) items.push({ type: "Frame", ...full, backgroundColor: cfg.pageColor });
  items.push(image("A", "B"), image("B", "A"));
  // the portal dims with filter:brightness(n): black at 1-n on top
  const brightness = typeof cfg.brightness === "number" ? cfg.brightness : 1;
  if (brightness < 1) items.push({ type: "Frame", ...full, backgroundColor: "black", opacity: 1 - Math.max(0, brightness) });

  // one photo sent as a pair: nothing to cycle (and re-setting an Image to
  // the URL it already shows would never fire onLoad)
  const cycles = new Set(urls).size > 1;
  const giveUp = Math.max(1, Math.ceil(GIVE_UP_MS / intervalMs));
  const loop = {
    type: "Sequential", sequencer: "slideshow" + p, repeatCount: 1000000,
    commands: [
      { type: "Idle", delay: intervalMs },
      set("mmSsWait", "${mmSsBusy ? mmSsWait + 1 : 0}"),
      set("mmSsBusy", "${mmSsBusy && mmSsWait < " + giveUp + "}"),
      { type: "Sequential", when: "${!mmSsBusy}", commands: [
        set("mmSsIdx", "${(mmSsIdx + 1) % mmSsN}"),
        set("mmSsBusy", true),
        { type: "SetValue", componentId: ids.A, property: "source", value: "${mmSsPre + mmSsUrls[mmSsIdx] + mmSsSuf}", when: "${mmSsFront != 'A'}" },
        { type: "SetValue", componentId: ids.B, property: "source", value: "${mmSsPre + mmSsUrls[mmSsIdx] + mmSsSuf}", when: "${mmSsFront == 'A'}" },
      ] },
    ],
  };

  return [{
    type: "Container", id: ids.box,
    position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h,
    bind: [
      { name: "mmSsPre", value: pre },
      { name: "mmSsUrls", value: cycles ? mids : [] },
      { name: "mmSsSuf", value: suf },
      { name: "mmSsN", value: urls.length },
      { name: "mmSsIdx", value: 0 },
      { name: "mmSsFront", value: "" },
      { name: "mmSsBusy", value: true }, // A is loading the first photo
      { name: "mmSsWait", value: 0 },
    ],
    onMount: cycles ? [loop] : [],
    items,
  }];
}

module.exports = { build, sized, affixes, swapCommands };
