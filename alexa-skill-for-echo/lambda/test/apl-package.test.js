const test = require("node:test");
const assert = require("node:assert");
const apl = require("../apl");
const aplPackage = require("../apl-package");
const pages = require("../pages");

const vp = { w: 1080, h: 1920 };
const display = {
  manifest: { canvas: { width: 1080, height: 1920 }, pages: [{ image: "p0.png", overlays: [] }, { image: "p1.png", overlays: [] }] },
  assetBase: "https://a/", version: 3,
};
const screen = () => apl.displayScreen(vp, display, { major: "1", minor: "2" }, "", false, 0);

test("the screen imports the package by content version, from our asset host", () => {
  const d = screen().document;
  const [imp] = d.import;
  assert.strictEqual(imp.name, "mango");
  assert.match(imp.version, /^[0-9a-f]{12}$/);
  assert.strictEqual(imp.source, "https://rokuassets.mangodisplay.com/test/echo/apl/mango-" + imp.version + ".json");
  // the fixed code is not on the screen any more
  for (const n of Object.keys(aplPackage.contents().commands)) assert.ok(!(d.commands || {})[n], n);
  for (const n of Object.keys(aplPackage.contents().layouts)) assert.ok(!(d.layouts || {})[n], n);
});

test("the package is the same for every Echo: page turns read the viewport, not a size", () => {
  const c = aplPackage.contents();
  assert.strictEqual(c.type, "APL");
  const turn = JSON.stringify(c.commands.MmTurn);
  assert.ok(turn.includes('"translateX":"${viewport.width}"') && turn.includes('"translateX":"${-viewport.width}"'));
  assert.ok(turn.includes('"translateY":"${viewport.height}"') && turn.includes('"translateY":"${-viewport.height}"'));
  // a numeric size still works for the on-screen fallback
  assert.ok(JSON.stringify(pages.commandDefinitions(1080, 1920).MmTurn).includes('"translateX":-1080'));
});

test("a code change is a new version; the same code is the same version", () => {
  assert.strictEqual(aplPackage.version(), require("crypto").createHash("sha256").update(aplPackage.json()).digest("hex").slice(0, 12));
  assert.strictEqual(aplPackage.json(), JSON.stringify(aplPackage.contents()));
});

test("APL_PACKAGE=off puts the code back on the screen", () => {
  process.env.APL_PACKAGE = "off";
  try {
    const d = screen().document;
    assert.strictEqual(d.import, undefined);
    assert.ok(d.commands.MmTurn && d.layouts.MmFxSheet);
  } finally {
    delete process.env.APL_PACKAGE;
  }
});
