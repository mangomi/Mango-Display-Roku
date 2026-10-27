// The scroll strip moves on the Echo (one looping AnimateItem) and its
// checkboxes send the same tap as touch.js's. These tests pin the
// document's shape and evaluate the press expressions in JavaScript to
// check the tap lands at the box's position on the canvas at that moment.
const test = require("node:test");
const assert = require("node:assert");
const { build } = require("../overlay-scroll");
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

test("boxes ride the strip and press like touch.js's checkboxes", () => {
  const boxes = build(strip(), ctx())[0].items[0].items.filter((c) => c.type === "TouchWrapper");
  assert.strictEqual(boxes.length, 2);
  const [b] = boxes;
  const pad = 8; // 16 canvas px
  assert.deepStrictEqual([b.left, b.top, b.width, b.height], [5 - pad, 20 - pad, 15 + 2 * pad, 15 + 2 * pad]);
  assert.strictEqual(b.bind.find((v) => v.name === "mmTicked").value, false);
  assert.strictEqual(boxes[1].bind.find((v) => v.name === "mmTicked").value, true);
  assert.ok(!b.bind.some((v) => v.name === "checked"));
  assert.strictEqual(b.item.items[0].source, "${mmTicked ? mmSChecked : mmSEmpty}");
  const [gate] = b.onPress;
  const [tick, hold, send, fast, dwell] = gate.commands;
  assert.strictEqual(tick.value, "${!mmTicked}");
  assert.strictEqual(hold.componentId, touch.ROOT_ID);
  assert.match(hold.value, /'501:' \+ \(mmTicked \? 1 : 0\)/);
  // touch.js's argument layout: kind, page, x, y, id, major, minor, ver, presses, layout, urls, page shown
  assert.deepStrictEqual(send.arguments.filter((_, i) => i !== 4),
    ["touch", "tap", "1", "125", "501", "1", "822", "${mmVer}", "${overrides}", "${mmLayout}", "${mmPageUrls}", "${mmCur}"]);
  assert.strictEqual(fast.sequencer, "fastcheck");
  assert.strictEqual(dwell.type, "MmRestartDwell");
  // nothing is sent from a fast-mode handler
  assert.ok(!b.onDown && !b.onUp);
});

test("the tap is aimed where the box is now, and only while its row is in the window", () => {
  const [b] = build(strip(), ctx())[0].items[0].items.filter((c) => c.type === "TouchWrapper");
  const [gate] = b.onPress;
  const send = gate.commands.find((c) => c.type === "SendEvent");
  const at = (ms) => ({ elapsedTime: 1000 + ms, mmScrollT0: 1000, Math });
  const y = (ms) => evalExpr(send.arguments[4], at(ms));
  // box centre = rect.y + strip offset + box.y + h/2; the strip runs
  // +300 -> -2500 over 28s
  assert.strictEqual(y(0), 200 + 300 + 55);
  assert.strictEqual(y(7000), 200 + (300 - 700) + 55);
  assert.strictEqual(y(28000), y(0)); // loops
  // box rows 40..70: below the window (0..300) at the start, in it once
  // the strip has moved up 100 px (1s), gone past the top later
  const visible = (ms) => evalExpr(gate.when, at(ms));
  assert.deepStrictEqual([0, 1000, 3000, 4000].map(visible), [false, true, true, false]);
  // played once: it stays at the end
  const [once] = build(strip({ loop: false }), ctx())[0].items[0].items.filter((c) => c.type === "TouchWrapper");
  const sendOnce = once.onPress[0].commands.find((c) => c.type === "SendEvent");
  assert.strictEqual(evalExpr(sendOnce.arguments[4], at(60000)), 200 - 2500 + 55);
});

test("held presses tick strip boxes too; no sprites, no boxes", () => {
  const now = Date.now();
  const boxes = (c, extra) => build(strip(extra), c)[0].items[0].items.filter((x) => x.type === "TouchWrapper");
  const held = boxes(ctx("501:1:" + now + ",502:0:" + now + ","));
  assert.deepStrictEqual(held.map((b) => b.bind[0].value), [true, false]);
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

test("size: a 40-task scrolling list is a few KB a box", () => {
  const boxes = Array.from({ length: 40 }, (_, i) => ({ x: 10, y: 40 + i * 60, w: 30, h: 30, checked: i % 3 === 0, kind: "todo", widgetSettingId: 7, payload: { id: 1000 + i, projectId: 9 } }));
  const bytes = JSON.stringify(build(strip({ boxes }), ctx())).length;
  assert.ok(bytes < 40 * 1300, "40 boxes are " + bytes + " bytes");
});
