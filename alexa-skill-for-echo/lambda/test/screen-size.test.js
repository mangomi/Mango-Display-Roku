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

test("a long scrolling list fits whole: 1200 boxes, every one pressable", () => {
  // as layout instances these went over the cap (2026-10-28); as rows of
  // the package's MmStrip they are ~40 bytes each
  const fit = apl.fittedScreen(vp, display(1200), paired, "", false, 0, "");
  assert.strictEqual(fit.level, apl.LITE.NONE, "full screen is " + fit.fullBytes);
  const strip = [];
  walk(fit.directive, (n) => { if (n.type === "MmStrip") strip.push(n); });
  assert.strictEqual(strip[0].mmBoxes.length, 1200);
  assert.strictEqual(strip[0].mmBoxes.filter((r) => r[6] === 1).length, 600);
});

test("each level is lighter; the last keeps only the page pictures", () => {
  const d = display(60, { effects: [{ type: "snow", density: 50 }] });
  const sizes = [0, 1, 2].map((l) => JSON.stringify(apl.displayScreen(vp, d, paired, "", false, 0, "", l)).length);
  for (let l = 1; l < 3; l++) assert.ok(sizes[l] <= sizes[l - 1], "level " + l + ": " + sizes);
  const still = apl.fittedScreen(vp, d, paired, "", false, 0, "", 1); // nothing fits 1 byte
  assert.strictEqual(still.level, apl.LITE.STILL);
  assert.strictEqual(count(still.directive, (n) => n.type === "MmStrip"), 0);
  assert.strictEqual(count(still.directive, (n) => n.id === "mmPage0" || (n.source || "").endsWith("p0.png")) > 0, true);
  // a level just big enough is the one picked
  assert.strictEqual(apl.fittedScreen(vp, d, paired, "", false, 0, "", sizes[1]).level, sizes[0] <= sizes[1] ? 0 : 1);
});
