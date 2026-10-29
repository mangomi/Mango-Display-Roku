// The scroll strip moves on the Echo (one looping AnimateItem) and its
// checkboxes send the same tap as touch.js's. These tests pin the
// document's shape and evaluate the press expressions in JavaScript to
// check the tap lands at the box's position on the canvas at that moment.
const test = require("node:test");
const assert = require("node:assert");
const { build, layouts } = require("../overlay-scroll");
const touch = require("../touch");
const apl = require("../apl");

const canvas = { width: 1920, height: 1080 };
const vp = { w: 960, h: 540, pw: 1920, ph: 1080 }; // scale 0.5
const refreshArgs = ["refresh", "${mmVer}", "1", "822", "${overrides}", "${mmBusy ? 1 : 0}", "${mmLayout}", "${mmPageUrls}", "${mmCur}"];
const ctx = (overrides = "") => ({
  place: apl.placement(canvas, vp), canvas, vp, assetBase: "https://a/", idPrefix: "p1o4",
  pageIndex: 1, refreshArgs, major: "1", minor: "822", overrides,
});
const strip = (extra) => ({
  type: "scroll", rect: { x: 100, y: 200, w: 400, h: 300 },
  segments: [{ file: "scroll_a_0.png", h: 2000 }, { file: "scroll_a_1.png", h: 500 }], stripFile: "scroll_a_0.png",
  stripW: 400, stripH: 2500, fromY: 300, toY: -2500, durationMs: 28000, loop: true,
  sprites: { empty: "box_empty.png", checked: "box_checked.png" },
  boxes: [
    { x: 10, y: 40, w: 30, h: 30, checked: false, kind: "todo", widgetSettingId: 7, payload: { id: 501, projectId: 9 } },
    { x: 10, y: 1000, w: 30, h: 30, checked: true, kind: "todo", widgetSettingId: 7, payload: { id: 502, projectId: 9 } },
  ],
  ...extra,
});

function evalExpr(s, vars) {
  const m = /^\$\{(.*)\}$/.exec(s);
  assert.ok(m, "not an expression: " + s);
  return new Function(...Object.keys(vars), "return (" + m[1] + ");")(...Object.values(vars));
}

test("a clipping window at the rect, the strip inside it, segments stacked", () => {
  const [win] = build(strip(), ctx());
  assert.deepStrictEqual([win.left, win.top, win.width, win.height], [50, 100, 200, 150]);
  assert.strictEqual(win.items.length, 1);
  const s = win.items[0];
  assert.deepStrictEqual([s.width, s.height], [200, 1250]);
  const imgs = s.items.filter((c) => c.type === "Image");
  assert.deepStrictEqual(imgs.map((i) => [i.source, i.top, i.height]), [["https://a/scroll_a_0.png", 0, 1000], ["https://a/scroll_a_1.png", 1000, 250]]);
});

test("one looping linear AnimateItem fromY -> toY, on the strip's own sequencer", () => {
  const s = build(strip(), ctx())[0].items[0];
  assert.deepStrictEqual(s.transform, [{ translateY: 150 }]);
  const seq = s.onMount[0];
  assert.strictEqual(seq.sequencer, "scrollp1o4"); // not the main one: a touch would end it
  const [t0, anim] = seq.commands;
  assert.strictEqual(t0.property, "mmScrollT0");
  assert.strictEqual(anim.type, "AnimateItem");
  assert.strictEqual(anim.componentId, s.id);
  assert.strictEqual(anim.duration, 28000);
  assert.strictEqual(anim.easing, "linear");
  assert.strictEqual(anim.repeatCount, 1000000);
  assert.deepStrictEqual(anim.value, [{ property: "transform", from: [{ translateY: 150 }], to: [{ translateY: -1250 }] }]);
  // played once: stays at the end
  assert.strictEqual(build(strip({ loop: false }), ctx())[0].items[0].onMount[0].commands[1].repeatCount, 0);
});

test("Roku defaults: fromY 0, toY -stripH, 10s, strip size from the segments", () => {
  const s = build(strip({ fromY: undefined, toY: undefined, durationMs: undefined, stripH: undefined, stripW: undefined }), ctx())[0].items[0];
  const anim = s.onMount[0].commands[1];
  assert.strictEqual(anim.duration, 10000);
  assert.deepStrictEqual(anim.value[0].from, [{ translateY: 0 }]);
  assert.deepStrictEqual(anim.value[0].to, [{ translateY: -1250 }]);
  assert.deepStrictEqual([s.width, s.height], [200, 1250]);
  assert.deepStrictEqual(build(strip({ segments: [] }), ctx()), []);
});

const LAYOUT = layouts(refreshArgs, "1", "822", false).MmSBox.items[0];
const stripOf = (c) => c[0].items[0];
const sboxes = (c) => stripOf(c).items.filter((x) => x.type === "MmSBox");
// what an expression inside a box sees: the strip's binds, the box's
// parameters (with the layout's defaults), then the layout's own binds
const MS = layouts(refreshArgs, "1", "822", false).MmSBox;
const scope = (s, b, ms) => {
  const v = { ...Object.fromEntries(s.bind.map((x) => [x.name, x.value])), mmScrollT0: 1000, elapsedTime: 1000 + ms, Math };
  for (const p of MS.parameters) if (typeof p === "object") v[p.name] = p.default;
  Object.assign(v, b);
  for (const x of LAYOUT.bind) v[x.name] = evalExpr(x.value, v);
  return v;
};
const geom = (s, b) => ["left", "top", "width", "height"].map((k) => Math.round(evalExpr(LAYOUT[k], scope(s, b, 0)) * 100) / 100);

test("boxes ride the strip and press like touch.js's checkboxes", () => {
  const c = build(strip(), ctx());
  const boxes = sboxes(c);
  assert.strictEqual(boxes.length, 2);
  const [b] = boxes;
  const pad = 8; // 16 canvas px
  assert.deepStrictEqual(geom(stripOf(c), b), [5 - pad, 20 - pad, 15 + 2 * pad, 15 + 2 * pad]);
  assert.deepStrictEqual([b.mmT0, boxes[1].mmT0, b.mmTid, b.mmX], [undefined, true, "501", 125]);
  // a box only carries what differs from the strip's usual box
  assert.ok(!("mmW" in b) && !("mmH" in b) && !("mmL" in b));
  assert.ok(JSON.stringify(b).length < 130, JSON.stringify(b));
  // the behaviour lives once, in the layout
  assert.deepStrictEqual(LAYOUT.bind[0], { name: "mmTicked", value: "${mmT0}" });
  assert.strictEqual(LAYOUT.item.items[0].source, "${mmTicked ? mmSChecked : mmSEmpty}");
  const [gate] = LAYOUT.onPress;
  const [tick, hold, send, fast, dwell] = gate.commands;
  assert.strictEqual(tick.value, "${!mmTicked}");
  assert.strictEqual(hold.componentId, touch.ROOT_ID);
  assert.match(hold.value, /mmTid \+ ':' \+ \(mmTicked \? 1 : 0\)/);
  // touch.js's argument layout: kind, page, x, y, id, major, minor, ver, presses, layout, urls, page shown
  assert.deepStrictEqual(send.arguments.filter((_, i) => i !== 4),
    ["touch", "tap", "${mmSPg}", "${Math.round(mmX)}", "${mmTid}", "1", "822", "${mmVer}", "${overrides}", "${mmLayout}", "${mmPageUrls}", "${mmCur}", undefined]);
  assert.strictEqual(fast.sequencer, "fastcheck");
  assert.strictEqual(dwell.type, "MmRestartDwell");
  // nothing is sent from a fast-mode handler
  assert.ok(!LAYOUT.onDown && !LAYOUT.onUp);
  // the strip binds the page for its boxes
  assert.strictEqual(stripOf(build(strip(), ctx())).bind.find((v) => v.name === "mmSPg").value, "1");
});

test("the tap is aimed where the box is now, and only while its row is in the window", () => {
  const s = stripOf(build(strip(), ctx()));
  const [b] = sboxes([{ items: [s] }]);
  const [gate] = LAYOUT.onPress;
  const send = gate.commands.find((c) => c.type === "SendEvent");
  const y = (ms) => evalExpr(send.arguments[4], scope(s, b, ms));
  // box centre = rect.y + strip offset + box.y + h/2; the strip runs
  // +300 -> -2500 over 28s
  assert.strictEqual(y(0), 200 + 300 + 55);
  assert.strictEqual(y(7000), 200 + (300 - 700) + 55);
  assert.strictEqual(y(28000), y(0)); // loops
  // box rows 40..70: below the window (0..300) at the start, in it once
  // the strip has moved up 100 px (1s), gone past the top later
  const visible = (ms) => evalExpr(gate.when, scope(s, b, ms));
  assert.deepStrictEqual([0, 1000, 3000, 4000].map(visible), [false, true, true, false]);
  // played once: it stays at the end
  const once = stripOf(build(strip({ loop: false }), ctx()));
  assert.strictEqual(evalExpr(send.arguments[4], scope(once, sboxes([{ items: [once] }])[0], 60000)), 200 - 2500 + 55);
});

test("a celebrating strip box calls MmStripDone at the box's place now (dp)", () => {
  const cel = layouts(refreshArgs, "1", "822", true).MmSBox.items[0].onPress[0].commands.find((c) => c.type === "MmStripDone");
  const s = stripOf(build(strip(), { ...ctx(), listIndex: () => 3 }));
  const b = sboxes([{ items: [s] }])[0];
  assert.strictEqual(scope(s, b, 0).mmLi, 3);
  // canvas 555 at the start -> dp at scale 0.5
  assert.strictEqual(evalExpr(cel.mmBy, scope(s, b, 0)), 0 + 0.5 * 555);
  assert.ok(!layouts(refreshArgs, "1", "822", false).MmSBox.items[0].onPress[0].commands.some((c) => c.type === "MmStripDone"));
});

test("held presses tick strip boxes too; no sprites, no boxes", () => {
  const now = Date.now();
  const boxes = (c, extra) => sboxes(build(strip(extra), c));
  const held = boxes(ctx("501:1:" + now + ",502:0:" + now + ","));
  assert.deepStrictEqual(held.map((b) => b.mmT0 === true), [true, false]);
  assert.strictEqual(boxes(ctx(), { sprites: null }).length, 0);
});

test("ids unique and from the overlay's prefix; sequencers prefixed", () => {
  const ids = [];
  const seqs = [];
  (function walk(n) {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    if (n.id) ids.push(n.id);
    if (n.sequencer) seqs.push(n.sequencer);
    Object.values(n).forEach(walk);
  })(build(strip(), ctx()));
  assert.strictEqual(new Set(ids).size, ids.length);
  ids.forEach((id) => assert.match(id, /^mmp1o4/));
  seqs.forEach((s) => assert.match(s, /^(scroll|fastcheck$)/));
});

test("size: a box is a few hundred bytes (Dave's 113 strip boxes made a 245 KB screen)", () => {
  const boxes = Array.from({ length: 40 }, (_, i) => ({ x: 10, y: 40 + i * 60, w: 30, h: 30, checked: i % 3 === 0, kind: "todo", widgetSettingId: 7, payload: { id: 1000 + i, projectId: 9 } }));
  const bytes = JSON.stringify(build(strip({ boxes }), ctx())).length;
  assert.ok(bytes < 40 * 150, "40 boxes are " + bytes + " bytes");
});

test("a box of another size or list says so, and is drawn at its own size", () => {
  const odd = strip();
  odd.boxes = odd.boxes.concat([{ x: 10, y: 80, w: 20, h: 30, checked: false, payload: { id: 503 } }, { x: 10, y: 120, w: 30, h: 30, checked: false, payload: { id: 504 } }]);
  const c = build(odd, { ...ctx(), listIndex: (b) => (b.payload.id === 504 ? 7 : 2) });
  const bs = sboxes(c);
  const s = stripOf(c);
  const o = bs.find((b) => b.mmTid === "503");
  assert.strictEqual(o.mmW, 10);
  assert.deepStrictEqual(geom(s, o), [5 - 8, 40 - 8, 10 + 16, 15 + 16]);
  assert.strictEqual(scope(s, bs.find((b) => b.mmTid === "504"), 0).mmLi, 7);
  assert.strictEqual(scope(s, o, 0).mmLi, 2);
});
