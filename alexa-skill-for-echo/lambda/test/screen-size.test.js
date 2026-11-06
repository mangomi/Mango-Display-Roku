// A long scrolling list keeps every checkbox, at ~40 bytes each.
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

test("a long scrolling list keeps every box: 1200, every one pressable", () => {
  const strip = [];
  walk(apl.displayScreen(vp, display(1200), paired, "", false, 0, ""), (n) => { if (n.type === "MmStrip") strip.push(n); });
  assert.strictEqual(strip[0].mmBoxes.length, 1200);
  assert.strictEqual(strip[0].mmBoxes.filter((r) => r[6] === 1).length, 600);
});
