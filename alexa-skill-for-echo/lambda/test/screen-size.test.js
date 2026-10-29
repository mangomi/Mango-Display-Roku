// Alexa refuses a screen over its size cap and the Echo then keeps the old
// one (Dave's 245 KB screen, 2026-10-28). fittedScreen sends a lighter
// screen instead, step by step (apl.LITE).
const test = require("node:test");
const assert = require("node:assert");
const apl = require("../apl");

const vp = { w: 1080, h: 1920 };
const paired = { major: "1", minor: "822" };
const strip = (n) => ({
  type: "scroll", rect: { x: 0, y: 1000, w: 400, h: 300 },
  segments: [{ file: "s0.png", h: 2048 }, { file: "s1.png", h: 2048 }], stripW: 400, stripH: 4096,
  fromY: 300, toY: -4096, durationMs: 240000, loop: true,
  sprites: { empty: "e.png", checked: "c.png" },
  boxes: Array.from({ length: n }, (_, i) => ({ x: 10, y: 10 + i * 3, w: 24, h: 24, checked: i % 2 === 0, payload: { id: 5000 + i } })),
});
const display = (boxes, extra = {}) => ({
  assetBase: "https://a/", version: 9,
  manifest: {
    canvas: { width: 1080, height: 1920 }, gestures: {},
    pages: [{ image: "p0.png", imageHash: "h0", overlays: [
      { type: "clock", rect: { x: 0, y: 0, w: 400, h: 100 } },
      strip(boxes),
    ] }],
    ...extra,
  },
});
const walk = (n, f) => {
  if (Array.isArray(n)) return n.forEach((c) => walk(c, f));
  if (!n || typeof n !== "object") return;
  f(n);
  Object.values(n).forEach((c) => walk(c, f));
};
const count = (doc, pred) => { let k = 0; walk(doc, (n) => { if (pred(n)) k++; }); return k; };

test("a screen under the cap is sent as it is", () => {
  const fit = apl.fittedScreen(vp, display(20), paired, "", false, 0, "");
  assert.strictEqual(fit.level, apl.LITE.NONE);
  assert.strictEqual(fit.bytes, fit.fullBytes);
  assert.deepStrictEqual(fit.directive, apl.displayScreen(vp, display(20), paired, "", false, 0, ""));
});

test("a long scrolling list over the cap: ticks drawn, not pressable, and it fits", () => {
  const fit = apl.fittedScreen(vp, display(1200), paired, "", false, 0, "");
  assert.ok(fit.fullBytes > apl.MAX_SCREEN_BYTES, "full screen is " + fit.fullBytes);
  assert.strictEqual(fit.level, apl.LITE.STATIC_STRIP_BOXES);
  assert.ok(fit.bytes <= apl.MAX_SCREEN_BYTES, "sent " + fit.bytes);
  assert.strictEqual(count(fit.directive, (n) => n.type === "MmSBox"), 0);
  // every tick still drawn, with its state
  assert.strictEqual(count(fit.directive, (n) => n.type === "MmSTick" && n.mmT0 === true), 600);
  assert.strictEqual(count(fit.directive, (n) => n.type === "MmSTick" && n.mmT0 === undefined), 600);
  // the strip still scrolls
  assert.ok(count(fit.directive, (n) => n.type === "AnimateItem" && n.repeatCount === 1000000) >= 1);
});

test("each level is lighter; the last keeps only the page pictures", () => {
  const d = display(60, { effects: [{ type: "snow", density: 50 }] });
  const sizes = [0, 1, 2, 3].map((l) => JSON.stringify(apl.displayScreen(vp, d, paired, "", false, 0, "", l)).length);
  for (let l = 1; l < 4; l++) assert.ok(sizes[l] <= sizes[l - 1], "level " + l + ": " + sizes);
  const still = apl.fittedScreen(vp, d, paired, "", false, 0, "", 1); // nothing fits 1 byte
  assert.strictEqual(still.level, apl.LITE.STILL);
  assert.strictEqual(count(still.directive, (n) => /Strip$/.test(n.id || "")), 0);
  assert.strictEqual(count(still.directive, (n) => n.id === "mmPage0" || (n.source || "").endsWith("p0.png")) > 0, true);
  // a level just big enough is the one picked
  assert.strictEqual(apl.fittedScreen(vp, d, paired, "", false, 0, "", sizes[2]).level, sizes[1] <= sizes[2] ? 1 : 2);
});
