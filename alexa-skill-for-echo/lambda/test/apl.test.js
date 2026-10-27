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
  const kinds = layers.map((l) => l.type + (l.source ? ":" + (/^data:/.test(l.source) ? "spinner" : l.source.split("/").pop().split("?")[0]) : ""));
  assert.deepStrictEqual(kinds, ["Frame", "Image:a.jpg", "Frame", "Image:display_p0.png", "Text", "Text", "Image:spinner"]);
});

test("display: portrait canvas on a portrait Echo fills the screen, rotation ignored", () => {
  const page = screens.display.document.mainTemplate.items[0].items[0].items.find((l) => l.source && /display_p0/.test(l.source));
  assert.deepStrictEqual([page.left, page.top, page.width, page.height], [0, 0, 1080, 1920]);
});

test("spinner: the Roku's own art, turning clockwise; on the Connected screen at 78% height", () => {
  const conn = screens.connected.document.mainTemplate.items[0].items[0].items;
  const sp = conn.find((i) => i.type === "Image" && /^data:image\/png;base64,/.test(i.source));
  assert.ok(sp, "spinner on Connected");
  assert.strictEqual(sp.top + sp.height / 2, 1920 * 0.78);
  const turn = sp.onMount[0].value[0];
  assert.deepStrictEqual([turn.from[0].rotate, turn.to[0].rotate], [0, 360]);
  assert.ok(!screens.pairing.document.mainTemplate.items[0].items[0].items.some((i) => /^data:/.test(i.source || "")));
});

test("spinner: display screen shows it while the service is busy, not during a swipe", () => {
  const layers = screens.display.document.mainTemplate.items[0].items[0];
  const sp = layers.items[layers.items.length - 1];
  assert.strictEqual(sp.opacity, "${mmBusy && mmSwiping == '' ? 1 : 0}");
  assert.strictEqual(layers.bind.find((b) => b.name === "mmBusy").value, false);
  const busy = apl.displayScreen(vp, { manifest, assetBase: "https://assets/", version: 3 }, paired, "", true);
  assert.strictEqual(busy.document.mainTemplate.items[0].items[0].bind.find((b) => b.name === "mmBusy").value, true);
});

test("busy flips without a redraw; on carries the 75s watchdog", () => {
  const on = apl.busyCommands(true);
  assert.strictEqual(on.type, "Alexa.Presentation.APL.ExecuteCommands");
  assert.strictEqual(on.token, "display");
  assert.strictEqual(on.commands[0].value, true);
  assert.strictEqual(on.commands[1].commands[0].delay, 75000);
  assert.strictEqual(apl.busyCommands(false).commands.length, 1);
});
