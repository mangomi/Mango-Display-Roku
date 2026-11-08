// A month swipe on the calendar must change only the month: its scrolling
// cells are slots refilled in place, never a whole new screen (Dave saw
// the background restart on every swipe, 2026-11-03).
const test = require("node:test");
const assert = require("node:assert");
const apl = require("../apl");
const calSlots = require("../calendar-slots");
const { inflate } = require("./inflate");

const vp = { w: 1080, h: 1920, pw: 1080, ph: 1920 };
const paired = { major: "1", minor: "822" };
const cell = (date, x, y, h = 88, file = "cell_" + date + ".png") => ({
  type: "scroll", page: 0, date, widgetSettingId: "calendar_9", rect: { x, y, w: 149, h: 69 }, durationMs: 16281,
  segments: [{ file, h }], stripW: 149, stripH: h, fromY: 69, toY: -h, loop: true,
});
const month = (cells) => ({
  canvas: { width: 1080, height: 1920 },
  pages: [{
    image: "page.png", imageHash: "a",
    regions: [{ kind: "calendar", page: 0, rect: { x: 12, y: 689, w: 1053, h: 554 }, id: "9" }],
    overlays: [{ type: "background", images: ["bg1.jpg", "bg2.jpg"], intervalMs: 8000 }, ...cells],
  }],
});
const nov = month([cell("2026-11-02", 164, 759), cell("2026-11-08", 14, 858), cell("2026-11-11", 464, 858, 110)]);
const dec = month([cell("2026-12-03", 314, 759), cell("2026-12-19", 914, 958, 110)]);
const d = (manifest, version) => ({ manifest, assetBase: "https://a/", version });
const shownFor = (x) => { const v = apl.displayView(vp, x); return { layout: v.layout, url: v.urls.join("|"), cal: v.calKey }; };

const layerOf = (screen) => screen.document.mainTemplate.items[0].items[0].items.find((i) => i.id === "mmP0").item.items;

test("calendar cells are slots on the page, not strips; the slot count is in steps of 8", () => {
  const items = layerOf(apl.displayScreen(vp, d(nov, 1), paired, ""));
  const slots = items.filter((i) => i.type === "MmCalSlot");
  assert.strictEqual(slots.length, calSlots.SLOTS);
  assert.ok(!items.some((i) => i.type === "MmStrip"), "a dated cell drawn as an MmStrip");
  assert.deepStrictEqual(slots.map((s) => s.mmV.on), [1, 1, 1, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual([slots[0].id, slots[0].mmId], ["mmCal0s0", "mmCal0s0"]);
  const v = slots[2].mmV;
  assert.deepStrictEqual([v.l, v.t, v.w, v.h, v.sh, v.f, v.to, v.src], [464, 858, 149, 69, 110, 69, -110, "cell_2026-11-11.png"]);
  // a busy month: more slots, so a new layout
  const many = month(Array.from({ length: 9 }, (_, k) => cell("2026-11-" + (10 + k), 14 + k, 858)));
  assert.strictEqual(calSlots.slotCount(many.pages[0]), 16);
  assert.notStrictEqual(apl.displayView(vp, d(many, 2)).layout, apl.displayView(vp, d(nov, 1)).layout);
});

test("a month swipe keeps the screen: same layout, the slots refilled and restarted", () => {
  assert.strictEqual(apl.displayView(vp, d(dec, 2)).layout, apl.displayView(vp, d(nov, 1)).layout);
  const up = apl.inPlaceUpdate(vp, d(dec, 2), paired, "", false, shownFor(d(nov, 1)));
  assert.ok(up, "a whole new screen for a month change");
  const set = (k) => up.commands.find((c) => c.componentId === "mmCal0s" + k && c.property === "mmCs");
  assert.strictEqual(set(0).value.src, "cell_2026-12-03.png");
  assert.strictEqual(set(1).value.t, 958);
  assert.strictEqual(set(2).value.on, 0); // November's third cell goes
  const run = up.commands.find((c) => c.type === "AnimateItem" && c.componentId === "mmCal0s1S");
  assert.deepStrictEqual([run.sequencer, run.duration, run.value[0].from[0].translateY, run.value[0].to[0].translateY],
    ["calmmCal0s1", 16281, 69, -110]);
  assert.ok(up.commands.some((c) => c.type === "Idle" && c.sequencer === "calmmCal0s2"), "an emptied slot stops");
  const key = up.commands.find((c) => c.componentId === "mmRoot" && c.property === "mmCalKey");
  assert.strictEqual(key.value, apl.displayView(vp, d(dec, 2)).calKey);
});

test("an update with the same cells leaves the slots scrolling where they are", () => {
  const ticked = JSON.parse(JSON.stringify(nov)); ticked.pages[0].imageHash = "b";
  const up = apl.inPlaceUpdate(vp, d(ticked, 2), paired, "", false, shownFor(d(nov, 1)));
  assert.ok(up);
  assert.ok(!up.commands.some((c) => /^mmCal/.test(c.componentId || "") || /^calmmCal/.test(c.sequencer || "")));
});

test("the screen reports its slot key with every refresh and touch", () => {
  const screen = apl.displayScreen(vp, d(nov, 1), paired, "");
  const doc = screen.document;
  const root = doc.mainTemplate.items[0].items[0];
  assert.strictEqual(root.bind.find((b) => b.name === "mmCalKey").value, apl.displayView(vp, d(nov, 1)).calKey);
  assert.strictEqual(doc.commands.MmRefresh.commands[0].arguments[12], "${mmCalKey}");
  assert.strictEqual(doc.commands.MmTell.commands[0].arguments[14], "${mmCalKey}");
});

test("the slot layout: placed, hidden and drawn from its value; scrolls from mount on its own sequencer", () => {
  const v = calSlots.values(nov.pages[0], apl.placement(nov.canvas, vp));
  const ev = (inst) => inflate(inst, { mmAB: "https://a/" });
  const { node, scope } = ev({ type: "MmCalSlot", id: "mmCal0s0", mmId: "mmCal0s0", mmV: v[0] });
  assert.strictEqual(node.id, "mmCal0s0");
  assert.deepStrictEqual(node.bind, [{ name: "mmCs", value: "${mmV}" }]);
  assert.strictEqual(scope.mmCs.l, 164);
  const strip = node.items[0];
  assert.strictEqual(strip.id, "${mmId}S");
  assert.strictEqual(strip.onMount[0].sequencer, "cal${mmId}");
  assert.strictEqual(strip.items[0].source, "${mmCs.on ? mmAB + mmCs.src : ''}");
  const off = ev({ type: "MmCalSlot", id: "mmCal0s7", mmId: "mmCal0s7", mmV: v[7] });
  assert.strictEqual(off.scope.mmCs.on, 0);
  assert.strictEqual(off.node.display, "${mmCs.on ? 'normal' : 'none'}");
});
