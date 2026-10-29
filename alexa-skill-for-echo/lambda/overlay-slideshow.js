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
// to the hidden one and waits up to LOAD_WAIT_MS for it to load, then
// plays the transition, so the old photo normally stays up until the new
// one is decoded. Image onLoad/onFail run in FAST mode, where AnimateItem
// and Idle are dropped, and on Dave's Echo Show 15 photos that waited for
// onLoad never showed at all (2026-10-27) - so onLoad only shortens the
// wait, and nothing's visibility depends on it. The state lives on the slideshow's container:
//
//   mmSsUrls   the photo list (mmSsPre + each + mmSsSuf: see affixes)
//   mmSsIdx    the photo shown or loading
//   mmSsFront  "A" | "B": the Image on show
//   mmSsLoaded which Image last finished loading ("A" | "B" | "")
//   mmSsFailed the photo being loaded failed
//
// APL has no z-order control, so B always draws over A. The transitions
// are built so that does not matter: fade animates whichever of the two is
// on top (B fades in over A, or out to reveal A), slides move both photos
// (they never overlap) and flip squashes one before the other expands.
//
// The loop, the two Images and every transition are the package's
// MmSlideshow layout (apl-package.js); a screen carries one instance per
// widget with its place, its settings and its photo list. The list is a
// root variable (ctx.photoList, apl.js), so pages sharing a background
// send its photos once.
//
// Photos can be ~3000px originals. The Roku caps decode at the widget
// size (loadWidth); here the device decodes whatever it is sent, so
// Unsplash URLs ask the image CDN for the widget's size instead.

const { EASE } = require("./pages");

const DEFAULT_INTERVAL_S = 60;
const MIN_INTERVAL_S = 3;
const SWAP_MS = 3000;     // every transition, as on the Roku
// How long a change waits for the next photo's onLoad before switching
// anyway. On Dave's Echo Show 15 photos that waited for onLoad never showed
// (2026-10-27): the handler cannot be relied on, so it only shortens the
// wait. A photo slower than this appears where it loads.
const LOAD_WAIT_MS = 3000;
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
 * widget's transition, one `when` per transition on mmTr; the rect in dp
 * is mmW x mmH. `xOnTop`: x is B. */
function swapCommands(x, y, xOnTop) {
  const W = "${mmW}", H = "${mmH}", mW = "${-mmW}", mH = "${-mmH}";
  const slides = { slideleft: [W, 0, mW, 0], slideright: [mW, 0, W, 0], slideup: [0, H, 0, mH], slidedown: [0, mH, 0, H] };
  const when = (name, commands) => ({ type: "Sequential", when: "${mmTr == '" + name + "'}", commands });
  const out = Object.entries(slides).map(([name, [dx, dy, ox, oy]]) => when(name, [
    place(x, T(dx, dy), 1),
    { type: "Parallel", commands: [
      anim(x, SWAP_MS, EASE, T(dx, dy), T()),
      anim(y, SWAP_MS, EASE, T(), T(ox, oy)),
    ] },
  ]));
  // the pages' card flip: squash the old photo, expand the new one
  out.push(when("flip", [
    anim(y, SWAP_MS / 2, "ease-in", T(), SQUASHED),
    place(x, SQUASHED, 1),
    anim(x, SWAP_MS / 2, "ease-out", SQUASHED, T()),
  ]));
  // fade and unknown names: the top photo fades in over the old one, or
  // fades out to reveal the new one beneath it
  const known = Object.keys(slides).concat("flip");
  out.push({
    type: "Sequential", when: "${" + known.map((k) => "mmTr != '" + k + "'").join(" && ") + "}",
    commands: xOnTop
      ? [place(x, T(), 0), anim(x, SWAP_MS, EASE, null, null, 0, 1)]
      : [place(x, T(), 1), anim(y, SWAP_MS, EASE, null, null, 1, 0)],
  });
  return out;
}

/** APL components for one `slideshow` or `background` overlay. */
/** The widget's rect in dp and its photo URLs as the Echo fetches them,
 * or null for fewer than 2 photos (draw nothing, like both shipped
 * clients: a lone photo travels as a pair of itself; overlays.js stills a
 * lone background). */
function photos(cfg, ctx) {
  const images = Array.isArray(cfg.images) ? cfg.images.filter((s) => typeof s === "string" && s) : [];
  if (images.length < 2) return null;
  // page backgrounds have no rect - they fill the canvas
  const r = ctx.place.rect(cfg.rect || { x: 0, y: 0, w: ctx.canvas.width, h: ctx.canvas.height });
  const devPx = ctx.vp && ctx.vp.w && ctx.vp.pw ? ctx.vp.pw / ctx.vp.w : 1;
  const urls = images.map((u) => sized(u, r.w * devPx, r.h * devPx, cfg.cropToFill === true));
  return { r, urls, cycles: new Set(urls).size > 1 };
}

/** A new photo list for a slideshow already on screen (apl.js
 * inPlaceUpdate). An image widget fed from a random source gets a fresh
 * list on every render - every calendar swipe - so the list is contents,
 * not layout: hand it over and let the loop carry on, instead of a whole
 * new screen (which blinked everything and restarted the slideshow). A
 * lone photo that changed is set directly. */
function updateCommands(cfg, ctx) {
  const ph = photos(cfg, ctx);
  if (!ph) return [];
  const p = ctx.idPrefix;
  if (!ph.cycles) return [{ type: "SetValue", componentId: p + "ssA", property: "source", value: ph.urls[0] }];
  const { pre, mids, suf } = affixes(ph.urls);
  const set = (property, value) => ({ type: "SetValue", componentId: p + "ss", property, value });
  return [set("mmSsPre", pre), set("mmSsUrls", mids), set("mmSsSuf", suf), set("mmSsN", ph.urls.length)];
}

/** The root variable that keeps this slideshow's photo number, so a whole
 * new screen resumes at the next photo instead of the first (the Roku's
 * lastIndex per widgetSettingId + page, SlideshowOverlay startIndex). */
function resumeKey(cfg, pageIndex, idPrefix) {
  const w = cfg && cfg.widgetSettingId != null ? String(cfg.widgetSettingId).replace(/[^0-9A-Za-z]/g, "") : "";
  return "mmSsI" + (w ? "w" + w + "p" + pageIndex : idPrefix);
}

/** "key:index,..." as the screen reports it (apl.js) -> Map. */
function parseResume(s) {
  const m = new Map();
  for (const part of String(s || "").split(",")) {
    const [k, v] = part.split(":");
    if (/^mmSsI[0-9A-Za-z]+$/.test(k || "") && /^\d+$/.test(v || "")) m.set(k, Number(v));
  }
  return m;
}

function build(cfg, ctx) {
  const ph = photos(cfg, ctx);
  if (!ph) return [];
  const p = ctx.idPrefix;
  const key = resumeKey(cfg, ctx.pageIndex, p);
  const last = ctx.resume && ctx.resume.get(key);
  const start = ph.cycles && Number.isInteger(last) ? (last + 1) % ph.urls.length : 0;
  const { r, urls, cycles } = ph;
  const { pre, mids, suf } = affixes(urls);
  const s = Number(cfg.intervalSeconds);
  const intervalMs = Math.max(MIN_INTERVAL_S, Number.isFinite(s) && s > 0 ? s : DEFAULT_INTERVAL_S) * 1000;
  const brightness = typeof cfg.brightness === "number" ? cfg.brightness : 1;
  const r2 = (v) => Math.round(v * 100) / 100;
  return [{
    type: "MmSlideshow", id: p + "ss",
    position: "absolute", left: r2(r.x), top: r2(r.y), width: r2(r.w), height: r2(r.h),
    mmId: p + "ss", mmKey: key, mmW: r2(r.w), mmH: r2(r.h),
    // one photo sent as a pair: nothing to cycle (and re-setting an Image
    // to the URL it already shows would never fire onLoad)
    mmCyc: cycles, mmFirst: urls[start],
    mmPre: pre, mmUrls: ctx.photoList ? ctx.photoList(mids) : mids, mmSuf: suf, mmN: urls.length, mmIdx: start,
    mmMs: intervalMs, mmTr: String(cfg.transition || "fade"),
    ...(cfg.cropToFill === true ? { mmCrop: true } : {}),
    ...(cfg.pageColor ? { mmColor: cfg.pageColor } : {}),
    ...(brightness < 1 ? { mmDim: 1 - Math.max(0, brightness) } : {}),
  }];
}

/** The package's slideshow (apl-package.js). The state lives on the
 * widget's container (mmSs*, above), the photo on show on its Images
 * <mmId>A and <mmId>B. */
function layouts() {
  const ids = { box: "${mmId}", A: "${mmId}A", B: "${mmId}B" };
  const full = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" };
  const set = (property, value) => ({ type: "SetValue", componentId: ids.box, property, value });

  // A shows the first photo from the start, like any Image - nothing waits
  // on onLoad to make a photo visible. The handlers only report (fast
  // mode): which one loaded, or that it failed; mmDiagLoads (root) counts
  // loads for the skill's log, to learn whether this Echo fires onLoad.
  const image = (x) => ({
    type: "Image", id: ids[x], ...full,
    // A's first photo is a fixed string: a source over mmSsIdx would
    // follow the index before the photo is due
    source: x === "A" ? "${mmFirst}" : "",
    scale: "${mmCrop ? 'best-fill' : 'best-fit'}",
    opacity: x === "A" ? 1 : 0,
    onLoad: [set("mmSsLoaded", x), { type: "SetValue", componentId: "mmRoot", property: "mmDiagLoads", value: "${mmDiagLoads + 1}" }],
    onFail: [set("mmSsFailed", true)],
  });

  // wait (normal mode) until Image `x` has loaded, failed, or LOAD_WAIT_MS
  const waitFor = (x) => ({
    type: "Sequential", repeatCount: Math.ceil(LOAD_WAIT_MS / POLL_MS) - 1, // repeats after the first
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
      // loaded, or the wait ran out: switch; only a reported failure skips
      { type: "Sequential", when: "${!mmSsFailed}", commands: [
        ...swapCommands(ids[x], ids[y], x === "B"),
        { type: "SetValue", componentId: ids[y], property: "opacity", value: 0 },
        set("mmSsFront", x),
      ] },
    ],
  });
  const run = {
    type: "Sequential", sequencer: "slideshow${mmId}", when: "${mmCyc}",
    commands: [{
      type: "Sequential", repeatCount: 1000000,
      commands: [
        { type: "Idle", delay: "${mmMs}" },
        set("mmSsIdx", "${(mmSsIdx + 1) % mmSsN}"),
        // remembered on the root, reported with every refresh (resumeKey;
        // the screen's MmSsKeep, apl.js)
        { type: "MmSsKeep", mmK: "${mmKey}", mmI: "${mmSsIdx}" },
        set("mmSsNext", "${mmSsFront == 'A' ? 'B' : 'A'}"),
        // a photo that failed (or never showed) is simply passed over
        advance("B", "A"),
        advance("A", "B"),
      ],
    }],
  };
  return {
    MmSlideshow: {
      parameters: ["mmId", "mmKey", "mmW", "mmH", "mmCyc", "mmFirst", "mmPre", "mmUrls", "mmSuf", "mmN", "mmIdx", "mmMs", "mmTr",
        { name: "mmCrop", default: false }, { name: "mmColor", default: "" }, { name: "mmDim", default: 0 }],
      items: [{
        type: "Container",
        bind: [
          { name: "mmSsPre", value: "${mmPre}" },
          { name: "mmSsUrls", value: "${mmUrls}" },
          { name: "mmSsSuf", value: "${mmSuf}" },
          { name: "mmSsN", value: "${mmN}" },
          { name: "mmSsIdx", value: "${mmIdx}" },
          { name: "mmSsFront", value: "A" },
          { name: "mmSsLoaded", value: "" },
          { name: "mmSsFailed", value: false },
          { name: "mmSsNext", value: "" },
        ],
        onMount: [run],
        items: [
          // page color sits under the photos (the layered page render is
          // transparent where they show through)
          { type: "Frame", when: "${mmColor != ''}", ...full, backgroundColor: "${mmColor}" },
          image("A"), image("B"),
          // the portal dims with filter:brightness(n): black at 1-n on top
          { type: "Frame", when: "${mmDim > 0}", ...full, backgroundColor: "black", opacity: "${mmDim}" },
        ],
      }],
    },
  };
}

module.exports = { build, layouts, updateCommands, resumeKey, parseResume, sized, affixes, swapCommands };
