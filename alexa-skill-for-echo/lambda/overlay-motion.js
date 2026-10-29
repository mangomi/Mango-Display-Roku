// `motion` overlay: a natively animated weather icon, the calendar strips'
// weather particles, and night mode's moving badge. Port of
// MotionOverlay.brs / MotionOverlayView.swift: the render service ships
// each moving part ONCE as a transparent PNG (the whole icon box) with its
// motion as keyframe tracks; the device draws the layers bottom to top at
// `rect`, clipped to it, and plays the tracks. (MANIFEST.md "motion".)
//
//   track  { prop, cycleMs, delayMs, keys[0..1], values, center }
//          rotation (degrees clockwise, about center px), translation
//          ([[dx, dy]] px), scale ([[sx, sy]] about center), opacity.
//          Linear between keys, the last value held to the end of the
//          cycle, repeated forever, after delayMs.
//   chain  outer motions on top of the layer's own, outermost first.
//
// A track is ONE AnimateItem, looping from onMount on its own sequencer
// (the main one is cut short by every touch): its keyframes become the
// command's easing curve. APL's path() easing is a piecewise-linear
// curve whose y values "may be arbitrary" (APL data types, Easing), so a
// track's values map onto one from -> to range: from = the value at the
// start of the cycle, y = (value - from) / (to - from). One command per
// track however many keys - the calendar strips sample up to 48 keys a
// cycle, and keys a straight line would join anyway are dropped first
// (simplify) to keep the document small.
//
// AnimateItem drives a component's whole transform, so each moving part
// of a group gets its own nested Container, like SceneGraph's node
// order: translation outermost, then rotation about its centre, then
// scale about its centre. One easing drives every number in a command, so
// x and y move in separate Containers when both change. Opacity rides
// the group's outermost Container: a layer's `opacity` is its value until
// its own opacity track takes over (tvOS: a replacement, not a
// multiplier); chain levels multiply, as nested groups do.
//
// Transforms apply about a component's centre, right to left (APL
// component docs): rotating about point c is
// translate(c - mid), rotate, translate(mid - c).

// how far (value units; translation in canvas px) a dropped key may sit
// off the line that replaces it
const TOL = { rotation: 0.3, translation: 0.3, scale: 0.003, opacity: 0.008 };
const X_END = 0.99999; // last explicit easing point before the implicit (1,1)

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const fix = (v, d) => Number(v.toFixed(d));

/** Drops keys a straight line between their neighbours already gives,
 * within `tol` (Douglas-Peucker on the value). pts: [[x, v]] ascending. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i++) {
      const [x0, v0] = pts[a], [x1, v1] = pts[b];
      const line = x1 === x0 ? v0 : v0 + ((v1 - v0) * (pts[i][0] - x0)) / (x1 - x0);
      const err = Math.abs(pts[i][1] - line);
      if (err > worst) { worst = err; at = i; }
    }
    if (worst > tol) {
      keep[at] = true;
      stack.push([a, at], [at, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** One scalar keyframe series over a cycle -> { from, to, easing } for an
 * AnimateItem, or { value } when it never changes. Before the first key
 * the first value holds, after the last key the last (tvOS piecewise). */
function curve(keys, values, tol) {
  let pts = [];
  keys.forEach((k, i) => {
    const x = Math.max(0, Math.min(1, k));
    // path() needs ascending x: a jump at one instant becomes a very steep line
    const prev = pts.length ? pts[pts.length - 1][0] : -1;
    pts.push([x > prev ? x : Math.min(1, prev + 1e-5), values[i]]);
  });
  if (pts[0][0] > 0) pts.unshift([0, pts[0][1]]);
  if (pts[pts.length - 1][0] < 1) pts.push([1, pts[pts.length - 1][1]]);
  pts = simplify(pts, tol);
  const vs = pts.map((p) => p[1]);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi - lo <= tol) return { value: pts[0][1] };
  const from = pts[0][1];
  const end = pts[pts.length - 1][1];
  let inner = pts.slice(1, -1);
  let to = end;
  if (Math.abs(end - from) <= 1e-9) {
    // a loop that ends where it began (most do): `to` cannot be `from`,
    // so the curve holds the end value up to X_END and only the final
    // instant of the cycle touches `to`
    to = from + (hi - lo);
    inner = inner.filter((p) => p[0] < X_END).concat([[X_END, end]]);
  }
  const ys = inner.map(([x, v]) => fix(x, 6) + "," + fix((v - from) / (to - from), 4));
  return { from, to, easing: ys.length ? "path(" + ys.join(",") + ")" : "linear" };
}

/** The layer's tracks, parsed: only those that can be played. */
function tracksOf(list) {
  return (Array.isArray(list) ? list : []).filter((t) => t && TOL[t.prop] !== undefined &&
    Array.isArray(t.keys) && t.keys.length && Array.isArray(t.values) && t.values.length === t.keys.length &&
    num(t.cycleMs, 0) > 0);
}

/** A group of tracks (a layer's own, or one chain level) around `child`:
 * nested Containers, innermost first, each moved by one AnimateItem.
 * `rest`: the group's opacity before its opacity track runs. */
function group(child, tracks, rest, k) {
  const { box, place, id } = k;
  const seqs = new Map(); // wrapper -> its sequencers' name
  const s = place.len(1);
  const r2 = (v) => fix(v, 2);
  let inner = child;
  let n = 0;
  const container = () => {
    // a single child sits at the wrapper's top-left in plain flow
    inner = { type: "Container", width: "100%", height: "100%", items: [inner] };
    seqs.set(inner, id + "w" + n++);
    return inner;
  };
  // one moving number of a track -> one Container, unless it stays at
  // rest (`still`) for good: an icon that only falls has no x to move
  const move = (t, c, still, transformOf) => {
    if (c.value !== undefined && Math.abs(c.value - still) < 1e-9) return;
    const comp = container();
    play(comp, seqs.get(comp), t, "transform", c, transformOf);
  };
  // the pivot as an offset from the box centre, dp (Roku/tvOS default:
  // the box's top-left)
  const pivot = (t) => {
    const c = Array.isArray(t.center) ? t.center : [0, 0];
    return [r2(num(c[0], 0) * s - box.w / 2), r2(num(c[1], 0) * s - box.h / 2)];
  };
  const about = ([dx, dy], op) => [{ translateX: dx }, { translateY: dy }, op, { translateX: -dx }, { translateY: -dy }];
  const axis = (t, j, d) => t.values.map((v) => num(Array.isArray(v) ? v[j] : undefined, d));

  // innermost first: scale, rotation, translation
  for (const t of tracks.filter((t) => t.prop === "scale")) {
    const p = pivot(t);
    move(t, curve(t.keys, axis(t, 0, 1), TOL.scale), 1, (v) => about(p, { scaleX: fix(v, 4) }));
    move(t, curve(t.keys, axis(t, 1, 1), TOL.scale), 1, (v) => about(p, { scaleY: fix(v, 4) }));
  }
  for (const t of tracks.filter((t) => t.prop === "rotation")) {
    const p = pivot(t);
    move(t, curve(t.keys, t.values.map((v) => num(v, 0)), TOL.rotation), 0, (v) => about(p, { rotate: r2(v) }));
  }
  for (const t of tracks.filter((t) => t.prop === "translation")) {
    move(t, curve(t.keys, axis(t, 0, 0), TOL.translation), 0, (v) => [{ translateX: r2(v * s) }]);
    move(t, curve(t.keys, axis(t, 1, 0), TOL.translation), 0, (v) => [{ translateY: r2(v * s) }]);
  }
  const op = tracks.find((t) => t.prop === "opacity");
  if (!op && rest === 1) return inner;
  if (inner === child) container();
  if (rest !== 1) inner.opacity = rest;
  if (op) play(inner, seqs.get(inner), op, "opacity", curve(op.keys, op.values.map((v) => num(v, 1)), TOL.opacity), (v) => fix(v, 3));
  return inner;
}

/** Adds one track's AnimateItem to `comp`'s onMount, on a sequencer of
 * its own (`seq`), after the track's delay. No componentId: a command
 * acts on the component whose handler runs it (as spinner.js's turn
 * does), which spares every wrapper an id. */
function play(comp, seq, track, property, c, valueOf) {
  const cmd = c.value !== undefined
    // never changes: take the value once the delay is over
    ? { type: "AnimateItem", duration: 1, value: [{ property, from: valueOf(c.value), to: valueOf(c.value) }] }
    : {
      type: "AnimateItem", duration: Math.round(track.cycleMs), easing: c.easing, repeatCount: 1000000,
      value: [{ property, from: valueOf(c.from), to: valueOf(c.to) }],
    };
  const delay = Math.round(num(track.delayMs, 0));
  if (delay > 0) cmd.delay = delay;
  cmd.sequencer = seq + (property === "opacity" ? "o" : "");
  comp.onMount = (comp.onMount || []).concat([cmd]);
}

/** APL components for one `motion` overlay. */
function build(cfg, ctx) {
  const rect = cfg && cfg.rect;
  if (!rect || !Array.isArray(cfg.layers)) return [];
  const { place, assetBase, idPrefix } = ctx;
  const r = place.rect(rect);
  const box = { w: r.w, h: r.h };
  const items = [];
  cfg.layers.forEach((layer, n) => {
    if (!layer || typeof layer.file !== "string" || !layer.file) return;
    const id = "motion" + idPrefix + "L" + n; // names its sequencers
    let comp = { type: "Image", position: "absolute", left: 0, top: 0, width: box.w, height: box.h, source: assetBase + layer.file, scale: "fill" };
    comp = group(comp, tracksOf(layer.tracks), num(layer.opacity, 1), { box, place, id });
    // chain levels wrap the layer, the outermost last
    const chain = Array.isArray(layer.chain) ? layer.chain : [];
    for (let lvl = chain.length - 1; lvl >= 0; lvl--) {
      comp = group(comp, tracksOf(chain[lvl] && chain[lvl].tracks), 1, { box, place, id: id + "c" + lvl });
    }
    // the layers stack in the box
    if (comp.position !== "absolute") Object.assign(comp, { position: "absolute", left: 0, top: 0 });
    items.push(comp);
  });
  if (!items.length) return [];
  // the box clips, as the portal's does: a raindrop's travel starts above
  // the strip (MotionOverlay.brs; see overlay-gif.js on APL clipping)
  return [{
    type: "Container",
    position: "absolute", left: r.x, top: r.y, width: box.w, height: box.h,
    items,
  }];
}

module.exports = { build, curve, simplify };
