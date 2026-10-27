// Motion tracks play on the Echo as AnimateItems whose easing curve
// carries the keyframes, so these tests evaluate that curve the way APL
// defines path() (piecewise linear through the listed points, with (0,0)
// and (1,1) implied) and compare it with the manifest's own rule (tvOS
// MotionOverlayView: linear between keys, first value before the first
// key, last value held to the end of the cycle). They also pin the
// nesting, the pivot maths, and the document size for a realistic
// weather-heavy screen.
const test = require("node:test");
const assert = require("node:assert");
const { build, curve, simplify } = require("../overlay-motion");
const apl = require("../apl");

const canvas = { width: 1920, height: 1080 };
const vp = { w: 960, h: 540, pw: 1920, ph: 1080 }; // scale 0.5
const ctx = { place: apl.placement(canvas, vp), canvas, vp, assetBase: "https://a/", idPrefix: "p0o5" };

/** The manifest's rule: value at position x (0..1) of the cycle. */
function reference(keys, values, x) {
  if (x <= keys[0]) return values[0];
  for (let i = 1; i < keys.length; i++) {
    if (x <= keys[i]) {
      const span = keys[i] - keys[i - 1];
      return span > 0 ? values[i - 1] + ((values[i] - values[i - 1]) * (x - keys[i - 1])) / span : values[i];
    }
  }
  return values[values.length - 1];
}

/** APL's AnimateItem value at x with a path() easing. */
function played(c, x) {
  if (c.value !== undefined) return c.value;
  const nums = c.easing === "linear" ? [] : c.easing.slice(5, -1).split(",").map(Number);
  const pts = [[0, 0]];
  for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  pts.push([1, 1]);
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const y = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      return c.from + (c.to - c.from) * y;
    }
  }
  return c.to;
}

function assertPlaysLike(keys, values, tol) {
  const c = curve(keys, values, tol);
  for (let i = 0; i <= 1000; i++) {
    const x = Math.min(i / 1000, 0.99998); // the final instant may touch `to` (curve())
    const want = reference(keys, values, x);
    assert.ok(Math.abs(played(c, x) - want) <= tol + 1e-3, "at " + x + ": " + played(c, x) + " vs " + want);
  }
  return c;
}

// a 48-key eased bob, as the calendar strips sample their CSS animations
const keys48 = Array.from({ length: 49 }, (_, k) => Math.round((k / 48) * 1000) / 1000);
const bob = keys48.map((k) => Math.round(-6 * Math.sin(Math.PI * k) ** 2 * 100) / 100);

test("easing curve reproduces the keyframes: loops, holds, delays in the keys", () => {
  assertPlaysLike([0, 0.5, 1], [0, 10, 0], 0.01); // ends where it began
  assertPlaysLike([0, 1], [0, 360], 0.01); // a spin: plain linear
  assertPlaysLike([0.2, 0.6], [5, -5], 0.01); // held before the first key and after the last
  assertPlaysLike([0, 0.3, 0.3, 1], [0, 1, 0, 0], 0.01); // a jump at one instant
  assertPlaysLike(keys48, bob, 0.25);
  assert.deepStrictEqual(curve([0, 0.5, 1], [3, 3, 3], 0.01), { value: 3 });
  assert.strictEqual(curve([0, 1], [0, 360], 0.01).easing, "linear");
});

test("night badge: an 8-slot 280s loop with 50ms jumps keeps its shape", () => {
  const cycle = 280000, slot = 35000, fade = 4000;
  const k = (ms) => Math.round((ms / cycle) * 10000) / 10000;
  const keys = [], op = [];
  for (let i = 0; i < 8; i++) {
    keys.push(k(i * slot), k(i * slot + fade), k(i * slot + slot - fade), k(i * slot + slot - 50));
    op.push(0, 0.6, 0.6, 0);
  }
  keys.push(1);
  op.push(0);
  assertPlaysLike(keys, op, 0.004);
});

test("simplify drops only keys a straight line already gives", () => {
  const line = Array.from({ length: 11 }, (_, i) => [i / 10, i * 2]);
  assert.deepStrictEqual(simplify(line, 0.01), [[0, 0], [1, 20]]);
  const pts = keys48.map((k, i) => [k, bob[i]]);
  const s = simplify(pts, 0.25);
  assert.ok(s.length < 20, s.length + " of 49 kept");
});

/** Every component in the tree, depth first. */
function all(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => all(n, out));
  else if (node && typeof node === "object") {
    if (node.type) out.push(node);
    for (const v of Object.values(node)) if (v && typeof v === "object") all(v, out);
  }
  return out;
}

const drop = {
  file: "wx_drop.png", opacity: 0,
  tracks: [
    { prop: "translation", cycleMs: 1000, delayMs: 300, keys: [0, 1], values: [[0, -20], [0, 40]] },
    { prop: "opacity", cycleMs: 1000, delayMs: 300, keys: [0, 0.1, 0.9, 1], values: [0, 1, 1, 0] },
  ],
};
const sun = { file: "wx_sun.png", tracks: [{ prop: "rotation", cycleMs: 9000, delayMs: 0, keys: [0, 1], values: [0, 360], center: [60, 40] }] };
const flake = {
  file: "wx_flake.png",
  tracks: [{ prop: "scale", cycleMs: 2000, keys: [0, 0.5, 1], values: [[1, 1], [0.5, 0.5], [1, 1]], center: [30, 30] }],
  chain: [{ tracks: [{ prop: "translation", cycleMs: 3000, keys: [0, 1], values: [[0, 0], [10, 50]] }] }],
};
const motion = (layers) => ({ type: "motion", rect: { x: 100, y: 200, w: 120, h: 80 }, layers });

test("a clipping box at the rect, layers bottom to top, each the whole box", () => {
  const [box] = build(motion([{ file: "wx_cloud.png" }, sun]), ctx);
  assert.deepStrictEqual([box.left, box.top, box.width, box.height], [50, 100, 60, 40]);
  assert.strictEqual(box.items.length, 2);
  assert.strictEqual(box.items[0].type, "Image"); // a still layer stays a bare Image
  const imgs = all(box).filter((c) => c.type === "Image");
  assert.deepStrictEqual(imgs.map((i) => [i.source, i.width, i.height]), [["https://a/wx_cloud.png", 60, 40], ["https://a/wx_sun.png", 60, 40]]);
});

test("rotation turns about its centre: translate, rotate, translate back", () => {
  const [box] = build(motion([sun]), ctx);
  const w = box.items[0];
  const [cmd] = w.onMount;
  assert.strictEqual(cmd.type, "AnimateItem");
  assert.strictEqual(cmd.componentId, undefined); // acts on its own component
  assert.strictEqual(cmd.duration, 9000);
  assert.strictEqual(cmd.repeatCount, 1000000);
  const { from, to } = cmd.value[0];
  // same shape both ends (AnimateItem needs it)
  assert.deepStrictEqual(from.map(Object.keys), to.map(Object.keys));
  // centre [60,40] canvas px = [30,20] dp; the box centre is [30,20] dp
  // -> pivot offset [0,0]... use an off-centre pivot to see the maths
  const [off] = build(motion([{ ...sun, tracks: [{ ...sun.tracks[0], center: [0, 0] }] }]), ctx);
  const t = off.items[0].onMount[0].value[0].to;
  assert.deepStrictEqual(t, [{ translateX: -30 }, { translateY: -20 }, { rotate: 360 }, { translateX: 30 }, { translateY: 20 }]);
  // right to left about the component centre (30,20): the pivot (0,0) stays put
  const rot = (deg, [x, y]) => {
    const a = (deg * Math.PI) / 180;
    return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  };
  let p = [0 - 30, 0 - 20]; // pivot relative to the centre
  p = [p[0] + 30, p[1] + 20];
  p = rot(90, p);
  p = [p[0] - 30, p[1] - 20];
  assert.ok(Math.abs(p[0] + 30) < 1e-9 && Math.abs(p[1] + 20) < 1e-9);
});

test("a delayed raindrop waits invisible, then falls and fades on its own clocks", () => {
  const [box] = build(motion([drop]), ctx);
  const outer = box.items[0];
  assert.strictEqual(outer.opacity, 0); // resting value until its track runs
  const op = outer.onMount.find((c) => c.value[0].property === "opacity");
  assert.strictEqual(op.delay, 300);
  assert.strictEqual(op.duration, 1000);
  // a drop moves only down: no Container for x
  const moves = all(box).filter((c) => (c.onMount || []).some((m) => m.value[0].property === "transform"));
  assert.strictEqual(moves.length, 1);
  const tr = moves[0].onMount.find((m) => m.value[0].property === "transform");
  assert.deepStrictEqual([tr.value[0].from, tr.value[0].to], [[{ translateY: -10 }], [{ translateY: 20 }]]);
  assert.strictEqual(tr.delay, 300);
  assert.notStrictEqual(tr.sequencer, op.sequencer);
});

test("chain levels wrap the layer: outer motion outside, own motion inside", () => {
  const [box] = build(motion([flake]), ctx);
  assert.match(box.items[0].onMount[0].sequencer, /^motionp0o5L0c0w/);
  const props = (c) => c.onMount[0].value[0].to.map((o) => Object.keys(o)[0]);
  // the chain's fall: x and y as separate Containers, both outside the scale
  const comps = all(box).filter((c) => c.onMount);
  assert.deepStrictEqual(comps.map(props), [["translateY"], ["translateX"], ["translateX", "translateY", "scaleY", "translateX", "translateY"], ["translateX", "translateY", "scaleX", "translateX", "translateY"]]);
});

test("one sequencer per command, named from the prefix; nothing on fast-mode handlers", () => {
  const out = build(motion([drop, sun, flake, { file: "wx_cloud.png", opacity: 0.5 }]), ctx);
  const comps = all(out);
  assert.ok(!comps.some((c) => c.id)); // nothing to collide with
  const seqs = comps.flatMap((c) => (c.onMount || []).map((m) => m.sequencer));
  assert.strictEqual(new Set(seqs).size, seqs.length);
  seqs.forEach((s) => assert.match(s, /^motionp0o5L/));
  assert.ok(!comps.some((c) => c.handleTick || c.onDown || c.onUp || c.onMove));
  assert.ok(!comps.some((c) => c.bind));
  assert.ok(!comps.some((c) => c.type === "Frame"));
});

test("size: a weather-heavy 5-page screen stays under Alexa's limit", () => {
  // Worst case: a 10-day calendar where EVERY day rains - per cell the
  // strip's particles (4 drops, 48-key tracks drifting in x and y and
  // fading) and the condition icon (2 layers, bobbing in a swaying
  // chain), as two motion overlays - plus 5 forecast GIFs, and icons on
  // the other 4 pages. ~1 KB per animated drop: ~5.5 KB a rainy cell.
  const sampled = (amp, phase) => keys48.map((k) => Math.round(amp * Math.sin(2 * Math.PI * (k + phase)) * 100) / 100);
  const particle = (i) => ({
    file: "cwm_rain_" + i + ".png", opacity: 0,
    tracks: [
      { prop: "translation", cycleMs: 1100, delayMs: i * 150, keys: keys48, values: keys48.map((k) => [Math.round(-3 * k * 100) / 100, Math.round(60 * (k ** 1.6) * 100) / 100]) },
      { prop: "opacity", cycleMs: 1100, delayMs: i * 150, keys: keys48, values: keys48.map((k) => Math.round(Math.min(1, 4 * k, 4 * (1 - k)) * 100) / 100) },
    ],
  });
  const icon = { file: "cwm_icon.png", tracks: [{ prop: "translation", cycleMs: 3000, keys: keys48, values: sampled(3, 0).map((v) => [0, v]) }], chain: [{ tracks: [{ prop: "rotation", cycleMs: 6000, keys: keys48, values: sampled(4, 0.25), center: [20, 20] }] }] };
  const calendar = [];
  for (let c = 0; c < 10; c++) {
    calendar.push(motion([0, 1, 2, 3].map(particle)), motion([{ file: "cwm_cloud.png" }, icon]));
  }
  const gif = { type: "gif", rect: { x: 10, y: 10, w: 80, h: 80 }, stripFile: "g.png", frameW: 80, frameH: 80, cols: 6, rows: 6, frameCount: 36, frameMs: 66 };
  const page = (i) => ({ image: "display_p" + i + ".png", overlays: i === 0 ? calendar.concat(Array(5).fill(gif)) : [gif, motion([drop, sun]), motion([flake])] });
  const manifest = { canvas, pages: [0, 1, 2, 3, 4].map(page) };
  const one = JSON.stringify(build(calendar[0], ctx)).length + JSON.stringify(build(calendar[1], ctx)).length;
  assert.ok(one < 6000, "one calendar cell is " + one + " bytes");
  const d = apl.displayScreen(vp, { manifest, assetBase: "https://assets/", version: 1 }, { major: "1", minor: "2" });
  const bytes = JSON.stringify(d).length;
  // ~93 KB, of which ~22 KB is the 5-page screen itself
  assert.ok(bytes < 100000, "screen is " + bytes + " bytes");
});
