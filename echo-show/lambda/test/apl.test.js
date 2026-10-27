// Echo-side APL rules a browser preview does not enforce. A Frame draws
// ONE child and drops the rest without an error - which shipped a screen
// showing only its first layer (2026-10-27).
const test = require("node:test");
const assert = require("node:assert");
const apl = require("../apl");

const vp = { w: 1080, h: 1920, pw: 1080, ph: 1920 };
const manifest = {
  canvas: { width: 1080, height: 1920 },
  rotation: 90,
  pages: [{
    image: "display_p0.png",
    overlays: [
      { type: "clock", tzOffsetMinutes: -240, elements: {
        time: { rect: { x: 3, y: 103, w: 348, h: 300 }, fontSizePx: 93, is24h: false },
        date: { rect: { x: 3, y: 404, w: 348, h: 90 }, fontSizePx: 34 },
      } },
      { type: "background", images: ["https://example.com/a.jpg"], pageColor: "#1A237E", brightness: 0.8 },
    ],
  }],
};
const paired = { major: "1", minor: "822" };

function frames(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => frames(n, out));
  else if (node && typeof node === "object") {
    if (node.type === "Frame") out.push(node);
    for (const v of Object.values(node)) frames(v, out);
  }
  return out;
}

const screens = {
  pairing: apl.pairingScreen(vp, "ET123456789", false),
  connected: apl.pairingScreen(vp, "ET123456789", true, paired),
  display: apl.displayScreen(vp, { manifest, assetBase: "https://assets/", version: 3 }, paired),
};

for (const [name, d] of Object.entries(screens)) {
  test(name + ": every Frame has at most one child", () => {
    for (const f of frames(d.document.mainTemplate)) {
      assert.ok(!f.items || f.items.length <= 1, "Frame with " + (f.items || []).length + " items");
    }
  });
}

test("display: background, photo, page and clock all inside the one container", () => {
  const layers = screens.display.document.mainTemplate.items[0].items[0].items;
  const kinds = layers.map((l) => l.type + (l.source ? ":" + l.source.split("/").pop().split("?")[0] : ""));
  assert.deepStrictEqual(kinds, ["Frame", "Image:a.jpg", "Frame", "Image:display_p0.png", "Text", "Text"]);
});

test("display: portrait canvas on a portrait Echo fills the screen, rotation ignored", () => {
  const page = screens.display.document.mainTemplate.items[0].items[0].items.find((l) => l.source && /display_p0/.test(l.source));
  assert.deepStrictEqual([page.left, page.top, page.width, page.height], [0, 0, 1080, 1920]);
});
