// The scroll strip moves on the Echo (one looping AnimateItem) and its
// checkboxes send the same tap as touch.js's. These tests pin the
// document's shape and evaluate the press expressions in JavaScript to
// check the tap lands at the box's position on the canvas at that moment.
const test = require("node:test");
const assert = require("node:assert");
const { build } = require("../overlay-scroll");
const { ev, inflate, dataChildren } = require("./inflate");
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

// the strip as the Echo inflates it from the package: the window, the
// strip in it and what the strip's expressions see
function expand(cfg, c = ctx()) {
  const inst = build(cfg, c)[0];
  const { node: win, scope } = inflate(inst, { mmAB: "https://a/" });
  const strip = win.items[0];
  const s = { ...scope };
  for (const b of strip.bind) s[b.name] = ev(b.value, s);
  return { inst, win, strip, s };
}
// its boxes, `ms` into the motion: per row the layout it drew, the
// component and what that sees
function boxesOf(x, ms = 0) {
  return dataChildren(x.strip.items[1], { ...x.s, mmScrollT0: 1000, elapsedTime: 1000 + ms }).map(({ template, scope }) => {
    const { type, when, id, ...rest } = template;
    const { node, scope: bs } = inflate({ type, ...rest }, scope);
    return { type, id: ev(id, scope), node, s: bs };
  });
}
const geom = (b) => ["left", "top", "width", "height"].map((k) => Math.round(ev(b.node[k], b.s) * 100) / 100);
const press = (b) => b.node.onPress[0];
const tell = (b) => press(b).commands.find((c) => c.type === "MmTell");

test("a clipping window at the rect, the strip inside it, segments stacked", () => {
  const x = expand(strip());
  assert.deepStrictEqual([x.inst.left, x.inst.top, x.inst.width, x.inst.height], [50, 100, 200, 150]);
  assert.strictEqual(x.win.items.length, 1);
  assert.deepStrictEqual([ev(x.strip.width, x.s), ev(x.strip.height, x.s)], [200, 1250]);
  const segs = dataChildren(x.strip.items[0], x.s).map(({ template: t, scope }) => [ev(t.source, scope), ev(t.top, scope), ev(t.height, scope)]);
  assert.deepStrictEqual(segs, [["https://a/scroll_a_0.png", 0, 1000], ["https://a/scroll_a_1.png", 1000, 250]]);
});

test("one looping linear AnimateItem fromY -> toY, on the strip's own sequencer", () => {
  const x = expand(strip());
  assert.strictEqual(ev(x.strip.transform[0].translateY, x.s), 150);
  const seq = x.strip.onMount[0];
  assert.strictEqual(ev(seq.sequencer, x.s), "scrollmmp1o4"); // not the main one: a touch would end it
  const [t0, anim] = seq.commands;
  assert.strictEqual(t0.property, "mmScrollT0");
  assert.strictEqual(anim.type, "AnimateItem");
  assert.strictEqual(anim.componentId, undefined); // the strip's own handler: acts on the strip
  assert.deepStrictEqual([ev(anim.duration, x.s), anim.easing, ev(anim.repeatCount, x.s)], [28000, "linear", 1000000]);
  const [v] = anim.value;
  assert.deepStrictEqual([v.property, ev(v.from[0].translateY, x.s), ev(v.to[0].translateY, x.s)], ["transform", 150, -1250]);
  // played once: stays at the end
  const once = expand(strip({ loop: false }));
  assert.strictEqual(ev(once.strip.onMount[0].commands[1].repeatCount, once.s), 0);
});

test("Roku defaults: fromY 0, toY -stripH, 10s, strip size from the segments", () => {
  const x = expand(strip({ fromY: undefined, toY: undefined, durationMs: undefined, stripH: undefined, stripW: undefined }));
  assert.deepStrictEqual([x.inst.mmMs, x.inst.mmFrom, x.inst.mmTo, x.inst.mmSw, x.inst.mmSh], [10000, 0, -1250, 200, 1250]);
  assert.deepStrictEqual(build(strip({ segments: [] }), ctx()), []);
});

test("boxes ride the strip and press like touch.js's checkboxes", () => {
  const x = expand(strip());
  const boxes = boxesOf(x);
  assert.deepStrictEqual(boxes.map((b) => b.type), ["MmSBox", "MmSBox"]);
  const [b] = boxes;
  const pad = 8; // 16 canvas px
  assert.deepStrictEqual(geom(b), [5 - pad, 20 - pad, 15 + 2 * pad, 15 + 2 * pad]);
  assert.deepStrictEqual([b.s.mmT0, boxes[1].s.mmT0, b.s.mmTid, b.s.mmX], [false, true, "501", 125]);
  // a box is one short row; it only names a size or list unlike the strip's
  assert.deepStrictEqual(x.inst.mmBoxes[0].slice(6), [0, -1, -1, -9]);
  assert.ok(JSON.stringify(x.inst.mmBoxes[0]).length < 45, JSON.stringify(x.inst.mmBoxes[0]));
  // the behaviour lives once, in the package's layout
  assert.deepStrictEqual(b.node.bind[0], { name: "mmTicked", value: "${mmT0}" });
  assert.strictEqual(ev(b.node.item.items[0].source, b.s), "https://a/box_empty.png");
  const [tick, after, hold, send, fast, dwell] = press(b).commands;
  assert.strictEqual(tick.value, "${!mmTicked}");
  assert.strictEqual(after.type, "MmAfterTick");
  assert.strictEqual(hold.componentId, touch.ROOT_ID);
  assert.match(hold.value, /mmTid \+ ':' \+ \(mmTicked \? 1 : 0\)/);
  // the screen's MmTell sends touch.js's arguments: kind, page, x, y, id
  assert.deepStrictEqual([send.type, ev(send.mmK, b.s), ev(send.mmP, b.s), ev(send.mmX, b.s), ev(send.mmT, b.s)], ["MmTell", "tap", "1", 125, "501"]);
  assert.strictEqual(fast.type, "MmFastCheck");
  assert.strictEqual(dwell.type, "MmRestartDwell");
  // nothing is sent from a fast-mode handler
  assert.ok(!b.node.onDown && !b.node.onUp);
});

test("the tap is aimed where the box is now, and only while its row is in the window", () => {
  const x = expand(strip());
  const y = (ms) => ev(tell(boxesOf(x, ms)[0]).mmY, boxesOf(x, ms)[0].s);
  // box centre = rect.y + strip offset + box.y + h/2; the strip runs
  // +300 -> -2500 over 28s
  assert.strictEqual(y(0), 200 + 300 + 55);
  assert.strictEqual(y(7000), 200 + (300 - 700) + 55);
  assert.strictEqual(y(28000), y(0)); // loops
  // box rows 40..70: below the window (0..300) at the start, in it once
  // the strip has moved up 100 px (1s), gone past the top later
  const visible = (ms) => { const b = boxesOf(x, ms)[0]; return ev(press(b).when, b.s); };
  assert.deepStrictEqual([0, 1000, 3000, 4000].map(visible), [false, true, true, false]);
  // played once: it stays at the end
  const once = expand(strip({ loop: false }));
  const b = boxesOf(once, 60000)[0];
  assert.strictEqual(ev(tell(b).mmY, b.s), 200 - 2500 + 55);
});

test("a strip box hands the screen's MmAfterTick its list and its place now (dp)", () => {
  const x = expand(strip(), { ...ctx(), listIndex: () => 3 });
  const b = boxesOf(x)[0];
  const cel = press(b).commands.find((c) => c.type === "MmAfterTick");
  assert.strictEqual(ev(cel.mmL, b.s), 3);
  // canvas 555 at the start -> dp at scale 0.5
  assert.strictEqual(ev(cel.mmBy, b.s), 0 + 0.5 * 555);
});

test("held presses tick strip boxes too; no sprites, no boxes", () => {
  const now = Date.now();
  const held = boxesOf(expand(strip(), ctx("501:1:" + now + ",502:0:" + now + ",")));
  assert.deepStrictEqual(held.map((b) => b.s.mmT0), [true, false]);
  assert.strictEqual(boxesOf(expand(strip({ sprites: null }))).length, 0);
});

test("box ids unique and from the overlay's prefix, as apl.js sets ticks in place", () => {
  const ids = boxesOf(expand(strip())).map((b) => b.id);
  assert.deepStrictEqual(ids, ["mmp1o4Box0", "mmp1o4Box1"]);
});

test("size: a box is one short row (Dave's 113 strip boxes once made a 245 KB screen)", () => {
  const boxes = Array.from({ length: 40 }, (_, i) => ({ x: 10, y: 40 + i * 60, w: 30, h: 30, checked: i % 3 === 0, kind: "todo", widgetSettingId: 7, payload: { id: 1000 + i, projectId: 9 } }));
  const bytes = JSON.stringify(build(strip({ boxes }), ctx())).length;
  assert.ok(bytes < 40 * 50 + 600, "40 boxes are " + bytes + " bytes");
});

test("a box of another size or list says so, and is drawn at its own size", () => {
  const odd = strip();
  odd.boxes = odd.boxes.concat([{ x: 10, y: 80, w: 20, h: 30, checked: false, payload: { id: 503 } }, { x: 10, y: 120, w: 30, h: 30, checked: false, payload: { id: 504 } }]);
  const bs = boxesOf(expand(odd, { ...ctx(), listIndex: (b) => (b.payload.id === 504 ? 7 : 2) }));
  const o = bs.find((b) => b.s.mmTid === "503");
  assert.strictEqual(o.s.mmW, 10);
  assert.deepStrictEqual(geom(o), [5 - 8, 40 - 8, 10 + 16, 15 + 16]);
  assert.strictEqual(bs.find((b) => b.s.mmTid === "504").s.mmLi, 7);
  assert.strictEqual(o.s.mmLi, 2);
});
