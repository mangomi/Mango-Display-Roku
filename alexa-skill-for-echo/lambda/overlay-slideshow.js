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
// on show. A loop started on mount waits the interval, hands the next URL
// to the hidden one and waits for it to load; only then does it play the
// transition, so the old photo stays up until the new one is decoded -
// never an empty frame. Image onLoad/onFail run in FAST mode, where
// AnimateItem and Idle are dropped (a first version started the
// transition from onLoad and no photo ever appeared on the Echo,
// 2026-10-27), so they only record what loaded; the loop, in normal mode,
// does the animating. The state lives on the slideshow's container:
//
//   mmSsUrls   the photo list (mmSsPre + each + mmSsSuf: see affixes)
//   mmSsIdx    the photo shown or loading
//   mmSsFront  "A" | "B" | "" (none yet - the first reveal)
//   mmSsLoaded which Image last finished loading ("A" | "B" | "")
//   mmSsFailed the photo being loaded failed
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
const POLL_MS = 250;      // how often the loop looks for the load

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

  // An Image only reports (fast mode): which one loaded, or that it failed
  const image = (x) => ({
    type: "Image", id: ids[x], ...full,
    source: x === "A" ? urls[0] : "",
    scale: crop ? "best-fill" : "best-fit",
    opacity: 0,
    onLoad: [set("mmSsLoaded", x)],
    onFail: [set("mmSsFailed", true)],
  });

  // wait (normal mode) until Image `x` has loaded, failed, or GIVE_UP_MS
  const waitFor = (x) => ({
    type: "Sequential", repeatCount: Math.ceil(GIVE_UP_MS / POLL_MS) - 1, // repeats after the first
    commands: [{ type: "Idle", delay: POLL_MS, when: "${mmSsLoaded != '" + x + "' && !mmSsFailed}" }],
  });
  // hand the hidden Image `x` the next photo, wait for it, bring it in over
  // `y`. Which one runs is decided once per pass (mmSsNext): checking
  // mmSsFront here would run both, the second right after the first had
  // swapped the front.
  const advance = (x, y) => ({
    type: "Sequential", when: "${mmSsNext == '" + x + "'}",
    commands: [
      set("mmSsLoaded", ""), set("mmSsFailed", false),
      { type: "SetValue", componentId: ids[x], property: "source", value: "${mmSsPre + mmSsUrls[mmSsIdx] + mmSsSuf}" },
      waitFor(x),
      { type: "Sequential", when: "${mmSsLoaded == '" + x + "'}", commands: [
        ...swapCommands(transition, ids[x], ids[y], x === "B", r.w, r.h),
        { type: "SetValue", componentId: ids[y], property: "opacity", value: 0 },
        set("mmSsFront", x),
      ] },
    ],
  });
  const items = [];
  // page color sits under the photos (the layered page render is
  // transparent where they show through)
  if (cfg.pageColor) items.push({ type: "Frame", ...full, backgroundColor: cfg.pageColor });
  items.push(image("A"), image("B"));
  // the portal dims with filter:brightness(n): black at 1-n on top
  const brightness = typeof cfg.brightness === "number" ? cfg.brightness : 1;
  if (brightness < 1) items.push({ type: "Frame", ...full, backgroundColor: "black", opacity: 1 - Math.max(0, brightness) });

  // one photo sent as a pair: nothing to cycle (and re-setting an Image to
  // the URL it already shows would never fire onLoad)
  const cycles = new Set(urls).size > 1;
  const run = {
    type: "Sequential", sequencer: "slideshow" + p,
    commands: [
      // the first photo always fades in (nothing meaningful to slide from)
      waitFor("A"),
      { type: "Sequential", when: "${mmSsLoaded == 'A'}", commands: [
        place(ids.A, T(), 0), anim(ids.A, SWAP_MS, EASE, null, null, 0, 1), set("mmSsFront", "A"),
      ] },
      ...(cycles ? [{
        type: "Sequential", repeatCount: 1000000,
        commands: [
          { type: "Idle", delay: intervalMs },
          set("mmSsIdx", "${(mmSsIdx + 1) % mmSsN}"),
          set("mmSsNext", "${mmSsFront == 'A' ? 'B' : 'A'}"),
          // a photo that failed (or never showed) is simply passed over
          advance("B", "A"),
          advance("A", "B"),
        ],
      }] : []),
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
      { name: "mmSsLoaded", value: "" },
      { name: "mmSsFailed", value: false },
      { name: "mmSsNext", value: "" },
    ],
    onMount: [run],
    items,
  }];
}

module.exports = { build, sized, affixes, swapCommands };
