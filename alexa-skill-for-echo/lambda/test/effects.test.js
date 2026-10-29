const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const effects = require("../effects");
const all = require("../effect-all");
const apl = require("../apl");

const canvas = { width: 1920, height: 1080 };
const VP = { w: 1920, h: 1080 };
const ctxFor = (vp = VP, c = canvas) => ({ place: apl.placement(c, vp), canvas: c, assetBase: "https://a/", vp });

const sheet = (file, frameW, frameH, frameCount, cols, frameMs = 90, flipped = true) => ({
  stripFile: file, frameW, frameH, frameCount, cols, rows: Math.ceil(frameCount / cols), frameMs,
  ...(flipped ? { stripFileFlipped: file.replace(".png", "_flip.png") } : {}),
});
const S3 = "https://displaytemplates.s3.us-east-1.amazonaws.com/media/visualoverlays/";

// what render-service/nativeWidgets.js extractEffects sends with every
// seasonal effect switched on - heavier than any real display
const HEAVY = [
  { type: "snow", sprites: [{ url: "effect_snowflake.png", aspect: 1 }], maxCount: 30, spawnEverySeconds: 0.7, sizeRange: [16, 40], speedRange: [70, 105], driftAmplitudeRange: [20, 45], driftPeriodRange: [5, 11], fadeInPx: 60, growthFactor: 1, direction: "down" },
  { type: "leaves", sprites: [1, 2, 3, 4, 5, 6].map((i) => ({ url: "effect_leaf" + i + ".png", aspect: 1.1 })), maxCount: 18, spawnEverySeconds: 1, sizeRange: [34, 62], speedRange: [38, 62], driftAmplitudeRange: [30, 70], driftPeriodRange: [6, 13], fadeInPx: 60, growthFactor: 1, spinTurnsRange: [-1.4, 1.4], direction: "down" },
  { type: "balloons", sprites: ["blue", "green", "yellow", "purple", "pink"].map((c) => ({ url: S3 + "baloons/" + c + "_balloon.png", aspect: 1.6 })), maxCount: 15, spawnEverySeconds: 1.6, sizeRange: [30, 70], speedRange: [12, 42], driftAmplitudeRange: [20, 60], driftPeriodRange: [4.2, 12.6], fadeInPx: 100, growthFactor: 1.25 },
  { type: "spritemover", ...sheet("effect_santa_a.png", 150, 98, 36, 13), width: 150, height: 98, startX: 0, startY: 50, speedX: 120, speedY: 30, flipOnTurn: true },
  { type: "spritemover", ...sheet("effect_witch_b.png", 150, 120, 24, 13), startX: 0, startY: 880, startDirX: 1, startDirY: -1, speedX: 150, speedY: 42, flipOnTurn: true, companion: { ...sheet("effect_bats_c.png", 120, 80, 30, 17), offsetX: -140, offsetY: -20 } },
  { type: "spritemover", ...sheet("effect_spider_d.png", 100, 90, 20, 20), startX: 30, startY: 880, startDirX: 1, startDirY: -1, speedX: 60, speedY: 72, flipOnTurn: true, rotateOnTurn: true },
  { type: "dropper", ...sheet("effect_spiderdrop_e.png", 80, 72, 20, 25), count: 9, speed: 36, maxY: 960, swayAmplitude: 22.5, swayPeriodMs: 3770, threadColor: "0xC8C8C8CC" },
  { type: "popup", sprites: [...Array(8).keys()].map((i) => sheet("effect_elf" + i + ".png", 150 + i, 200, 36, 13, 80)), dwellMsRange: [4000, 6000], popMs: 500 },
  { type: "popup", sprites: [{ stripFile: "effect_firework_1.png", frameW: 332, frameH: 332, frameCount: 26, cols: 6, rows: 5, frameMs: 70 }], dwellMsRange: [1520, 1820], popMs: 130 },
  { type: "popup", sprites: [{ stripFile: "effect_firework_1.png", frameW: 332, frameH: 332, frameCount: 26, cols: 6, rows: 5, frameMs: 70 }], dwellMsRange: [3340, 3640], popMs: 130 },
  { type: "spritesheet", stripFile: "effect_stringlight_f.png", frameW: 1920, frameH: 90, frameCount: 8, cols: 1, rows: 8, frameMs: 120, rect: { x: 0, y: 0, w: 1920, h: 90 } },
  { type: "spritesheet", stripFile: "effect_stringlight_f.png", frameW: 1920, frameH: 90, frameCount: 8, cols: 1, rows: 8, frameMs: 120, rect: { x: 0, y: 990, w: 1920, h: 90 } },
];

function walk(node, fn) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, fn));
  if (node && typeof node === "object") {
    fn(node);
    Object.values(node).forEach((v) => walk(v, fn));
  }
}
const shape = (t) => (Array.isArray(t) ? t.map((o) => Object.keys(o).join()).join("|") : typeof t);
const BUILT_IN = new Set(["checked", "disabled", "opacity", "source", "display", "transform", "width", "height", "left", "top", "id", "type"]);

test("every effect type the Roku registry handles has a builder", () => {
  const brs = fs.readFileSync(path.join(__dirname, "..", "..", "..", "components", "MainScene.brs"), "utf8");
  const reg = brs.match(/m\.effectRegistry = \{([^}]*)\}/)[1];
  const types = [...reg.matchAll(/(\w+):/g)].map((m) => m[1]);
  assert.ok(types.length >= 8);
  for (const t of types) assert.strictEqual(typeof all.builders[t], "function", t);
  for (const t of types) assert.strictEqual(effects.BUILDERS[t], all.builders[t], t);
});

// sequencer names on the screen: literal ones, and those the layouts
// build from an instance's mmSeq (effects-<mmSeq>, +"s", +"f")
function sequencers(comps) {
  const out = [];
  walk(comps, (n) => {
    if (typeof n.sequencer === "string") out.push(n.sequencer);
    if (n.type === "MmFxParticle" || n.type === "MmFxDrop") out.push("effects-" + n.mmSeq, "effects-" + n.mmSeq + "s");
    if (n.type === "MmFxDrop") out.push("effects-" + n.mmSeq + "f");
    if (n.type === "MmFxSheet" && n.mmSeq) out.push("effects-" + n.mmSeq);
  });
  return out;
}
const LAYOUT_PARAMS = Object.fromEntries(Object.entries(all.layouts())
  .map(([k, l]) => [k, l.parameters.map((p) => (typeof p === "string" ? { name: p } : p))]));

test("the heavy set: valid APL by our rules, and small enough for a response", () => {
  const comps = effects.displayEffects(HEAVY, ctxFor());
  const layoutBytes = JSON.stringify(all.layouts()).length;
  const bytes = JSON.stringify(comps).length;
  // Dave's screen is ~54 KB before effects; Alexa caps a response near 120 KB
  assert.ok(bytes + layoutBytes < 45000, "effects " + bytes + " + layouts " + layoutBytes + " bytes");
  const ids = new Set();
  walk([comps, all.layouts()], (n) => {
    if (typeof n.id === "string") {
      assert.ok(!ids.has(n.id), "duplicate id " + n.id);
      ids.add(n.id);
    }
    if (n.type === "Frame") assert.ok(!n.items && !n.item, "a Frame draws one child at most - use a Container");
    for (const b of n.bind || []) {
      assert.match(b.name, /^mm/);
      assert.ok(!BUILT_IN.has(b.name), b.name);
    }
    if (n.type === "AnimateItem") {
      for (const v of n.value) if (v.property === "transform") assert.strictEqual(shape(v.from), shape(v.to));
      if (typeof n.duration === "number") assert.ok(n.duration >= 1);
    }
    if (n.type === "Image" && typeof n.source === "string") assert.ok(!/\.gif$/i.test(n.source), "no animated GIFs in Image");
    // a layout instance gives every parameter that has no default, and no others
    if (LAYOUT_PARAMS[n.type]) {
      for (const p of LAYOUT_PARAMS[n.type]) if (!("default" in p)) assert.ok(p.name in n, n.type + " without " + p.name);
      for (const k of Object.keys(n)) if (/^mm/.test(k)) assert.ok(LAYOUT_PARAMS[n.type].some((p) => p.name === k), n.type + " " + k);
    }
  });
  const seqs = sequencers(comps);
  for (const s of seqs) assert.match(s, /^effects-/);
  assert.strictEqual(new Set(seqs).size, seqs.length, "every loop on its own sequencer");
  console.log("heavy effect set:", bytes, "bytes + layouts", layoutBytes, "-", seqs.length, "loops");
});

test("layouts: animate bound values, loops on their own sequencers, names that are not built-ins", () => {
  const L = all.layouts();
  assert.deepStrictEqual(Object.keys(L).sort(), ["MmFxDrop", "MmFxParticle", "MmFxSheet"]);
  for (const [name, l] of Object.entries(L)) {
    for (const p of l.parameters) assert.match(typeof p === "string" ? p : p.name, /^mm/, name);
    assert.strictEqual(l.items.length, 1);
  }
  // whatever a layout starts on mount runs on a sequencer of its own
  walk(L, (n) => {
    for (const c of n.onMount || []) assert.match(c.sequencer || "", /^effects-\$\{mmSeq\}/);
  });
  // the sheet steps a whole cell at a time, never past the last frame
  const img = L.MmFxSheet.items[0].items[0];
  assert.match(img.transform[0].translateX, /Math\.min\(Math\.floor\(mmFxF \* mmN\), mmN - 1\) % mmCols/);
});

test("same manifest, same document; another slot, other randomness", () => {
  const a = effects.displayEffects(HEAVY, ctxFor());
  const b = effects.displayEffects(HEAVY, ctxFor());
  assert.deepStrictEqual(a, b);
  const p1 = all.builders.snow(HEAVY[0], { ...ctxFor(), idPrefix: "fx0" })[0].items;
  const p2 = all.builders.snow(HEAVY[0], { ...ctxFor(), idPrefix: "fx1" })[0].items;
  assert.notDeepStrictEqual(p1.map((c) => c.left), p2.map((c) => c.left));
});

test("unknown types and empty configs draw nothing", () => {
  assert.deepStrictEqual(effects.displayEffects([{ type: "confetti3d" }, null, { type: "snow", sprites: [] }, { type: "popup" }, { type: "spritemover" }, { type: "dropper" }, { type: "spritesheet" }], ctxFor()), []);
  assert.deepStrictEqual(effects.displayEffects(undefined, ctxFor()), []);
});

test("particles: capped (smaller screens fewer), staggered like the spawn timer, falling across the canvas", () => {
  const [layer] = all.builders.snow(HEAVY[0], { ...ctxFor(), idPrefix: "fx0" });
  assert.deepStrictEqual(layer.bind, [{ name: "mmFxSrc", value: ["https://a/effect_snowflake.png"] }]);
  const big = layer.items;
  assert.strictEqual(big.length, 16); // maxCount 30
  assert.strictEqual(all.builders.snow(HEAVY[0], { ...ctxFor({ w: 960, h: 480 }), idPrefix: "fx0" })[0].items.length, 10);
  assert.strictEqual(all.builders.hearts({ ...HEAVY[0], maxCount: 5 }, { ...ctxFor(), idPrefix: "fx0" })[0].items.length, 5);
  big.forEach((p, i) => {
    assert.strictEqual(p.type, "MmFxParticle");
    assert.strictEqual(p.mmSeq, "fx0p" + i);
    if (i < 4) {
      // on screen from the start, partway along
      assert.ok(p.mmP0 > 0 && p.mmP0 <= 0.7);
      assert.strictEqual(p.mmDel, undefined);
    } else {
      assert.strictEqual(p.mmDel, (i - 3) * 700);
      assert.strictEqual(p.mmP0, undefined);
    }
    // downwards: from just above the canvas to just below it
    assert.ok(p.top < 0);
    assert.ok(p.top + p.mmTr > 1080);
    assert.ok(p.mmFade > 0 && p.mmFade <= 0.4);
    assert.strictEqual(p.mmGrow, undefined); // growthFactor 1
    // 70-105 px/s over 1080 + 2 sprite heights
    assert.ok(p.mmDur >= 10000 && p.mmDur <= 17000, String(p.mmDur));
  });
});

test("balloons rise and grow; leaves spin", () => {
  const b = all.builders.balloons(HEAVY[2], { ...ctxFor(), idPrefix: "fx2" })[0].items[0];
  assert.ok(b.top > 1080);
  // ends just above the canvas
  assert.ok(Math.abs(b.top + b.mmTr + b.height) < 0.5);
  assert.strictEqual(b.mmGrow, 0.25);
  const l = all.builders.leaves(HEAVY[1], { ...ctxFor(), idPrefix: "fx1" })[0].items;
  assert.ok(l.every((p) => Math.abs(p.mmSpin || 0) <= 504));
  assert.ok(l.some((p) => p.mmSpin));
});

test("spritesheet: a frame window at its rect, playing for good", () => {
  const [win] = all.builders.spritesheet(HEAVY[11], { ...ctxFor(), idPrefix: "fx9" });
  assert.deepStrictEqual(
    [win.type, win.id, win.left, win.top, win.width, win.height, win.mmCols, win.mmRows, win.mmN, win.mmMs, win.mmSeq],
    ["MmFxSheet", "fx9g", 0, 990, 1920, 90, 1, 8, 8, 120, "fx9g"]);
  assert.strictEqual(win.mmSrc, "https://a/effect_stringlight_f.png");
});

test("spritemover: independent x and y bounces, facing by direction", () => {
  const [lane] = all.builders.spritemover(HEAVY[3], { ...ctxFor(), idPrefix: "fx3" });
  assert.strictEqual(lane.id, "fx3m");
  const [x] = lane.onMount;
  assert.strictEqual(x.sequencer, "effects-fx3mtranslateX");
  // first leg: from startX to the right wall at 120 px/s
  assert.strictEqual(x.commands[0].duration, Math.round(((1920 - 150) / 120) * 1000));
  const [turn, back] = x.commands[1].commands;
  assert.deepStrictEqual([turn.componentId, turn.property, turn.value], ["fx3m", "mmFxDx", -1]);
  assert.deepStrictEqual(back.value[0].from, [{ translateX: 1770 }]);
  const mover = lane.items[0];
  assert.strictEqual(mover.onMount[0].commands[0].duration, Math.round(((1080 - 98 - 50) / 30) * 1000));
  const [normal, mirrored] = mover.items[0].items;
  assert.strictEqual(normal.display, "${mmFxDx > 0 ? 'normal' : 'invisible'}");
  assert.strictEqual(mirrored.mmSrc, "https://a/effect_santa_a_flip.png");
  assert.strictEqual(mirrored.mmSeq, "fx3mb");
});

test("spritemover: the spiders turn to face their way; the witch's bats swap sides", () => {
  const [spider] = all.builders.spritemover(HEAVY[5], { ...ctxFor(), idPrefix: "fx5" });
  assert.deepStrictEqual(spider.items[0].items[0].transform, [{ rotate: "${mmFxDx * mmFxDy * 90}" }]);
  assert.deepStrictEqual(spider.bind, [{ name: "mmFxDx", value: 1 }, { name: "mmFxDy", value: -1 }]);
  const [witch] = all.builders.spritemover(HEAVY[4], { ...ctxFor(), idPrefix: "fx4" });
  const [, batsRight, batsLeft] = witch.items[0].items;
  // behind her when flying right (offset -140), mirrored when flying left
  assert.strictEqual(batsRight.left, 0);
  assert.strictEqual(batsLeft.left, 140 + 150 + 140 - 120);
  assert.strictEqual(batsLeft.display, "${mmFxDx < 0 ? 'normal' : 'invisible'}");
});

test("popup: one at a time, every character once per round, sheet restarted per appearance", () => {
  const [layer] = all.builders.popup(HEAVY[7], { ...ctxFor(), idPrefix: "fx7" });
  assert.strictEqual(layer.items.length, 8);
  layer.items.forEach((w) => {
    assert.deepStrictEqual(w.transform, [{ translateX: 0 }, { translateY: 0 }, { rotate: 0 }, { scale: 0 }]);
    assert.strictEqual(w.mmSeq, undefined); // played by the round, not on its own
  });
  const loop = layer.onMount[0];
  assert.strictEqual(loop.repeatCount, 1000000);
  const hosts = loop.commands.map((p) => p.commands[0].commands[0].componentId);
  assert.deepStrictEqual([...hosts].sort(), [...Array(8).keys()].map((i) => "fx7u_" + i).sort());
  const [pop, dwell, out] = loop.commands[0].commands[0].commands;
  assert.strictEqual(pop.duration, 500);
  assert.ok(dwell.delay >= 4000 && dwell.delay <= 6000);
  assert.strictEqual(out.duration, 400);
  assert.deepStrictEqual(out.value[0].to.at(-1), { scale: 0 });
  const frames = loop.commands[0].commands[1];
  assert.deepStrictEqual(frames.value, [{ property: "mmFxF", from: 0, to: 1 }]);
  assert.strictEqual(frames.componentId, hosts[0]);
  // a firework: one shell at four spots, one playthrough each
  const [fw] = all.builders.popup(HEAVY[8], { ...ctxFor(), idPrefix: "fx8" });
  assert.strictEqual(fw.onMount[0].commands.length, 4);
  fw.onMount[0].commands.forEach((p) => {
    assert.strictEqual(p.commands[1].duration, 26 * 70);
    assert.strictEqual(p.commands[1].repeatCount, undefined);
  });
});

test("dropper: spiders spread across the top on threads, capped", () => {
  const [layer] = all.builders.dropper(HEAVY[6], { ...ctxFor(), idPrefix: "fx6" });
  assert.strictEqual(layer.items.length, 8); // asked for 9
  const lefts = layer.items.map((d) => d.left);
  for (let i = 1; i < lefts.length; i++) assert.ok(lefts[i] > lefts[i - 1]);
  const d = layer.items[0];
  assert.deepStrictEqual([d.type, d.top, d.mmD, d.mmColor, d.mmDur, d.mmMs, d.mmSw], ["MmFxDrop", 0, 960, "#C8C8C8CC", Math.round((960 / 36) * 1000), 100, 1885]);
  assert.ok(d.mmP0 >= 0 && d.mmP0 < 1);
});

test("a whole display screen with the heavy set stays under the response limit", () => {
  const manifest = {
    canvas, effects: HEAVY,
    pages: [{ image: "display_p0.png", imageHash: "abc", overlays: [], targets: { items: [] }, regions: [] }],
  };
  const d = apl.displayScreen(VP, { manifest, assetBase: "https://a/", version: 3 }, { major: "1", minor: "2" }, "", false, 0);
  const bytes = JSON.stringify(d).length + JSON.stringify(all.layouts()).length;
  assert.ok(bytes < 70000, "document " + bytes + " bytes");
});
