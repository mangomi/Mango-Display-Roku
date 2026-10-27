const test = require("node:test");
const assert = require("node:assert");
const cel = require("../celebrations");
const all = require("../effect-all");
const apl = require("../apl");

const canvas = { width: 1920, height: 1080 };
const vp = { w: 1920, h: 1080 };
const ctx = { place: apl.placement(canvas, vp), canvas, vp, assetBase: "https://a/" };
const URL = "https://cdn.example/celebrations/burst.png";

function withSheet(fn) {
  const before = process.env.CELEBRATION_URL;
  process.env.CELEBRATION_URL = URL;
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env.CELEBRATION_URL;
    else process.env.CELEBRATION_URL = before;
  }
}
function walk(node, fn) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, fn));
  if (node && typeof node === "object") {
    fn(node);
    Object.values(node).forEach((v) => walk(v, fn));
  }
}

test("no hosted sheet, no celebrations", () => {
  const before = process.env.CELEBRATION_URL;
  delete process.env.CELEBRATION_URL;
  assert.deepStrictEqual(cel.layer(ctx), []);
  assert.deepStrictEqual(cel.commandDefinitions(), {});
  assert.deepStrictEqual(cel.commandsFor({ kind: "burst", x: 10, y: 20 }), []);
  if (before !== undefined) process.env.CELEBRATION_URL = before;
});

test("layer: the box burst and six finale bursts, invisible, as sheet windows", () => withSheet(() => {
  const [layer] = cel.layer(ctx);
  assert.deepStrictEqual([layer.left, layer.top, layer.width, layer.height], [0, 0, 1920, 1080]);
  const [holder, ...finale] = layer.items;
  assert.strictEqual(holder.id, "mmCelAt");
  assert.deepStrictEqual(holder.transform, [{ translateX: "${mmCelX}" }, { translateY: "${mmCelY}" }]);
  // centred on the origin, so the translate is the box centre
  assert.deepStrictEqual([holder.left, holder.top, holder.width], [-190, -190, 380]);
  const box = holder.items[0];
  assert.deepStrictEqual([box.type, box.id, box.opacity, box.mmSrc, box.mmN, box.mmCols, box.mmRows, box.mmMs],
    ["MmFxSheet", "mmCelB", 0, URL, 24, 5, 5, 70]);
  assert.strictEqual(box.mmSeq, undefined); // played by a press, not on mount
  assert.strictEqual(box.bind, undefined); // would replace the layout's own
  assert.strictEqual(finale.length, 6);
  finale.forEach((f, i) => {
    assert.strictEqual(f.id, "mmCelF" + i);
    assert.strictEqual(f.opacity, 0);
    assert.deepStrictEqual(f.transform, [{ scale: 1.474 }]);
    const cx = f.left + f.width / 2;
    const cy = f.top + f.height / 2;
    // left and right bands, alternating, upper half (MainScene playFinale)
    if (i % 2 === 0) assert.ok(cx >= 190 && cx <= 570, String(cx));
    else assert.ok(cx >= 1350 && cx <= 1730, String(cx));
    assert.ok(cy >= 55 && cy <= 485, String(cy));
  });
  assert.deepStrictEqual(cel.layer(ctx), [layer]); // same screen, same document
}));

test("definitions: burst at the box at once, finale volley staggered 210ms, each slot its own sequencer", () => withSheet(() => {
  const d = cel.commandDefinitions();
  assert.deepStrictEqual(Object.keys(d).sort(), ["MmCelebrate", "MmCelebratePlay"]);
  const [x, y, box, volley] = d.MmCelebrate.commands;
  assert.deepStrictEqual([x.componentId, x.property, x.value], ["mmCelAt", "mmCelX", "${x}"]);
  assert.deepStrictEqual([y.componentId, y.property, y.value], ["mmCelAt", "mmCelY", "${y}"]);
  assert.strictEqual(box.sequencer, "celebrations-mmCelB");
  assert.deepStrictEqual(box.commands, [{ type: "MmCelebratePlay", slot: "mmCelB" }]);
  assert.strictEqual(volley.when, "${kind == 'finale'}");
  assert.strictEqual(volley.commands.length, 6);
  volley.commands.forEach((c, i) => {
    assert.strictEqual(c.sequencer, "celebrations-mmCelF" + i);
    const wait = c.commands.find((k) => k.type === "Idle");
    assert.strictEqual(wait ? wait.delay : 0, i * 210);
    assert.strictEqual(c.delay, undefined); // not honoured from a handler
  });
  const [show, play, hide] = d.MmCelebratePlay.commands;
  assert.deepStrictEqual([show.property, show.value, hide.property, hide.value], ["opacity", 1, "opacity", 0]);
  assert.deepStrictEqual(play.value, [{ property: "mmFxF", from: 0, to: 1 }]);
  assert.strictEqual(play.duration, 24 * 70);
  assert.strictEqual(play.componentId, "${slot}");
  // the slots are MmFxSheet instances: the layout must bind what they animate
  assert.deepStrictEqual(all.layouts().MmFxSheet.items[0].bind, [{ name: "mmFxF", value: 0 }]);
}));

test("commandsFor: one short command per press, numbers rounded, expressions passed through", () => withSheet(() => {
  assert.deepStrictEqual(cel.commandsFor({ kind: "burst", x: 101.234, y: 55.55 }), [{ type: "MmCelebrate", kind: "burst", x: 101.2, y: 55.6 }]);
  assert.deepStrictEqual(cel.commandsFor({ x: 1, y: 2 })[0].kind, "burst");
  const inLayout = cel.commandsFor({ kind: "${k}", x: "${mmCx}", y: "${mmCy}" })[0];
  assert.deepStrictEqual([inLayout.kind, inLayout.x, inLayout.y], ["${k}", "${mmCx}", "${mmCy}"]);
  assert.ok(JSON.stringify(cel.commandsFor({ kind: "finale", x: 1, y: 2 })).length < 80);
}));

test("lists: open boxes per widget (todos per project), counted on the device", () => {
  const pages = [
    { targets: { items: [
      { widgetSettingId: 7, payload: { id: 1 } },
      { widgetSettingId: 7, payload: { id: 2 } },
      { widgetSettingId: 8, kind: "todo", payload: { id: 3, projectId: 1 } },
      { widgetSettingId: 8, kind: "todo", payload: { id: 4, projectId: 2 } },
    ] } },
    { targets: { items: [{ widgetSettingId: 7, payload: { id: 5 } }] } },
  ];
  const l = cel.lists(pages, [[true, false, true, false], [false]]);
  assert.deepStrictEqual(l.binds, [
    { name: "mmOpen0", value: 1 }, { name: "mmOpen1", value: 0 }, { name: "mmOpen2", value: 1 }, { name: "mmOpen3", value: 1 },
  ]);
  assert.deepStrictEqual(pages[0].targets.items.map((it) => l.index(0, it)), [0, 0, 1, 2]);
  assert.strictEqual(l.index(1, pages[1].targets.items[0]), 3); // same widget, other page: its own list
  const tick = l.onTick("mmL", "mmRoot");
  assert.strictEqual(tick.length, 4);
  assert.deepStrictEqual(tick[2], {
    type: "SetValue", componentId: "mmRoot", when: "${mmL == 2}", property: "mmOpen2", value: "${mmOpen2 + (mmTicked ? -1 : 1)}",
  });
  assert.strictEqual(l.kind("mmL"),
    "${(mmL == 0 ? mmOpen0 : mmL == 1 ? mmOpen1 : mmL == 2 ? mmOpen2 : mmL == 3 ? mmOpen3 : 1) <= 0 ? 'finale' : 'burst'}");
  assert.strictEqual(cel.lists([], []).kind("mmL"), "burst");
  walk(l.binds, (n) => n.name && assert.match(n.name, /^mm/));
});
