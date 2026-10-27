const test = require("node:test");
const assert = require("node:assert");
const apl = require("../apl");
const pages = require("../pages");

const vp = { w: 1080, h: 1920 };
const paired = { major: "1", minor: "822" };
const page = (n, extra = {}) => ({ image: "display_p" + n + ".png", imageHash: "h" + n, overlays: [], ...extra });
const manifest = {
  canvas: { width: 1080, height: 1920 },
  gestures: { pageSwipe: true, calendarScroll: true },
  pages: [
    page(0, { autoRotate: true, delaySeconds: 20, transition: "slideleft" }),
    page(1, { autoRotate: true, transition: "flip" }),
    page(2, { autoRotate: false, delaySeconds: 1, transition: "pop" }),
  ],
};
const display = { manifest, assetBase: "https://a/", version: 7 };
const rootOf = (d) => d.document.mainTemplate.items[0].items[0];
const bind = (d, n) => rootOf(d).bind.find((b) => b.name === n).value;

test("every page is its own layer; only the current one is shown", () => {
  const d = apl.displayScreen(vp, display, paired, "", false, 1);
  const layers = rootOf(d).items.filter((c) => /^mmP\d$/.test(c.id));
  assert.deepStrictEqual(layers.map((l) => [l.id, l.display]), [["mmP0", "invisible"], ["mmP1", "normal"], ["mmP2", "invisible"]]);
  assert.strictEqual(bind(d, "mmCur"), 1);
  // a bad page number from an old screen falls back to the first page
  assert.strictEqual(bind(apl.displayScreen(vp, display, paired, "", false, "9"), "mmCur"), 0);
});

test("the Roku's rotation rules: delaySeconds min 3 default 60, autoRotate per page", () => {
  const d = apl.displayScreen(vp, display, paired, "", false, 0);
  assert.deepStrictEqual(bind(d, "mmDwell"), [20000, 60000, 3000]);
  assert.deepStrictEqual(bind(d, "mmAuto"), [true, true, false]);
  assert.deepStrictEqual(bind(d, "mmTrans"), ["slideleft", "flip", "pop"]);
  assert.strictEqual(bind(d, "mmPageSwipe"), true);
  assert.ok(rootOf(d).onMount.some((c) => c.type === "MmRotate"));
});

test("turns run on the Echo from named commands, on one sequencer, never two at once", () => {
  const cmds = apl.displayScreen(vp, display, paired, "", false, 0).document.commands;
  for (const name of ["MmTurn", "MmRotate", "MmPageNext", "MmPagePrev", "MmRestartDwell"]) assert.ok(cmds[name], name);
  assert.deepStrictEqual(cmds.MmTurn.parameters, ["from", "to"]);
  for (const name of ["MmRotate", "MmPageNext", "MmPagePrev", "MmRestartDwell"]) {
    assert.strictEqual(cmds[name].commands[0].sequencer, "rotation", name);
  }
  assert.match(cmds.MmPageNext.commands[0].when, /mmPageSwipe/);
  assert.match(cmds.MmPageNext.commands[0].when, /!mmTurning/);
  const turn = JSON.stringify(cmds.MmTurn);
  assert.ok(turn.includes(pages.EASE) && turn.includes('"duration":3000'), "3s inOutCubic");
  for (const t of ["slideleft", "slideright", "slideup", "slidedown", "pop", "rotate", "flip"]) assert.ok(turn.includes("'" + t + "'"), t);
});

test("a horizontal swipe anywhere turns the page; recorded in fast mode, acted on in onPress", () => {
  const catcher = rootOf(apl.displayScreen(vp, display, paired, "", false, 0)).items[0];
  assert.strictEqual(catcher.type, "TouchWrapper");
  assert.ok(!JSON.stringify(catcher.onUp).includes("Mm"), "no page commands from fast-mode onUp");
  assert.deepStrictEqual(catcher.onPress.slice(0, 2).map((c) => c.type), ["MmPageNext", "MmPagePrev"]);
  assert.match(catcher.onUp[0].when, /< 0/); // finger moves left -> next
});

test("in place across pages: only the pages whose pictures changed cross-fade", () => {
  const shownView = apl.displayView(vp, display);
  const shown = { layout: shownView.layout, url: shownView.urls.join("|") };
  const next = JSON.parse(JSON.stringify(display));
  next.version = 8;
  next.manifest.pages[2].imageHash = "changed";
  const up = apl.inPlaceUpdate(vp, next, paired, "", false, shown);
  const faded = up.commands.filter((c) => /^mmPagePrev\d$/.test(c.componentId || "") && c.property === "source").map((c) => c.componentId);
  assert.deepStrictEqual(faded, ["mmPagePrev2"]);
  // a page's rotation settings changing is a layout change
  const slower = JSON.parse(JSON.stringify(display));
  slower.manifest.pages[0].delaySeconds = 30;
  assert.strictEqual(apl.inPlaceUpdate(vp, slower, paired, "", false, shown), null);
});
