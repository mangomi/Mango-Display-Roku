// A whole screen goes as a file; the reply only says to load it.
process.env.MANGO_ENV = "production";
const test = require("node:test");
const assert = require("node:assert");
const apl = require("../apl");
const screenFile = require("../screen-file");

const vp = { w: 1080, h: 1920, pw: 1080, ph: 1920 };
const paired = { major: "2", minor: "62122" };
const list = (w, n = 200) => Array.from({ length: n }, (_, k) => "https://cvws.icloud-content.com/B/" + k + "y".repeat(400) + "/p.jpg?w=" + w + "&o=" + k * 104729);
const overlay = (w, images) => ({ type: "slideshow", page: 0, widgetSettingId: w, rect: { x: 0, y: 0, w: 500, h: 500 }, images, intervalSeconds: 45, transition: "fade" });
const display = (images, version = 4) => ({
  manifest: { canvas: { width: 1080, height: 1920 }, pages: [{ image: "p.png", imageHash: "a", regions: [], overlays: [overlay(1, images), overlay(2, list(2)), overlay(3, list(3))] }] },
  assetBase: "https://a/", version,
});

test("a 200-photo display: the file carries every photo and the reply stays tiny", () => {
  const f = screenFile.split(apl.displayScreen(vp, display(list(1)), paired, ""));
  assert.ok(JSON.stringify(f.reply).length < 3000, JSON.stringify(f.reply).length + " bytes");
  const file = JSON.parse(f.json);
  assert.strictEqual(f.reply.document.mainTemplate.items[0].type, "MmScreen");
  assert.ok(file.layouts.MmScreen.items[0].items[0].id === "mmRoot");
  assert.ok(file.commands.MmSsKeep);
  assert.ok(f.json.includes("&o=" + 199 * 104729), "the last photo");
  const imp = f.reply.document.import;
  assert.deepStrictEqual(imp.map((i) => i.name), ["mango", "mangoscreen"]);
  assert.strictEqual(imp[1].source, "https://rokuassets.mangodisplay.com/prod/echo/screens/" + f.version + ".json");
  assert.strictEqual(f.key, "prod/echo/screens/" + f.version + ".json");
});

test("the same screen is the same file", () => {
  const a = screenFile.split(apl.displayScreen(vp, display(list(1)), paired, ""));
  const b = screenFile.split(apl.displayScreen(vp, display(list(1)), paired, ""));
  assert.strictEqual(a.version, b.version);
});

test("a tick stays a small live update; a changed long list is a new screen", () => {
  const shown = (x) => { const v = apl.displayView(vp, x); return { layout: v.layout, url: v.urls.join("|"), cal: v.calKey }; };
  const up = apl.inPlaceUpdate(vp, display(list(1), 5), paired, "", false, shown(display(list(1))));
  assert.ok(up, "the same list stays in place");
  assert.ok(JSON.stringify(up).length < 5000, JSON.stringify(up).length + " bytes");
  assert.strictEqual(apl.inPlaceUpdate(vp, display(list(9), 5), paired, "", false, shown(display(list(1)))), null);
});
