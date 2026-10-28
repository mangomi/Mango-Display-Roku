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

test("a horizontal swipe anywhere turns the page: each page layer IS the swipe catcher", () => {
  const d = apl.displayScreen(vp, display, paired, "", false, 0);
  const layers = rootOf(d).items.filter((c) => /^mmP\d$/.test(c.id));
  // a sibling beneath the pages never got a touch on the Echo: the page
  // image above it took every one. The layer wraps the page instead.
  assert.ok(!rootOf(d).items.some((c) => c.type === "TouchWrapper" && !/^mmP\d$/.test(c.id || "")), "no catcher outside the pages");
  for (const l of layers) {
    assert.strictEqual(l.type, "TouchWrapper");
    assert.ok(Array.isArray(l.item.items), "the page's content is inside the wrapper");
    assert.ok(!JSON.stringify(l.onUp).includes("Mm"), "no page commands from fast-mode onUp");
    assert.deepStrictEqual(l.onPress.slice(0, 2).map((c) => c.type), ["MmPageNext", "MmPagePrev"]);
    assert.match(l.onUp[0].when, /< 0/); // finger moves left -> next
  }
  // inner touch targets stay above, inside the wrapper (MmTurn animates the layer id)
  assert.ok(d.document.commands.MmTurn);
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

test("scroll-strip checkboxes: ticks are contents (in place), held presses survive, set by id", () => {
  const strip = {
    type: "scroll", rect: { x: 0, y: 0, w: 300, h: 400 }, segments: [{ file: "s0.png", h: 1200 }], stripFile: "s0.png",
    stripW: 300, stripH: 1200, fromY: 400, toY: -1200, durationMs: 20000, loop: true,
    sprites: { empty: "e.png", checked: "c.png" },
    boxes: [{ x: 10, y: 50, w: 24, h: 24, checked: false, payload: { id: 901 } }],
  };
  const withStrip = JSON.parse(JSON.stringify(display));
  withStrip.manifest.pages[0].overlays = [strip];
  const v = apl.displayView(vp, withStrip);
  const shown = { layout: v.layout, url: v.urls.join("|") };
  const ticked = JSON.parse(JSON.stringify(withStrip));
  ticked.version = 8;
  ticked.manifest.pages[0].overlays[0].boxes[0].checked = true;
  const press = "901:1:" + Date.now() + ",";
  const up = apl.inPlaceUpdate(vp, ticked, paired, press, false, shown);
  assert.ok(up, "a tick inside a strip does not force a whole new screen");
  const set = up.commands.find((c) => c.componentId === "mmp0o0Box0");
  assert.deepStrictEqual([set.property, set.value], ["mmTicked", true]);
  // a press the render has not caught up with is still held on the screen
  const behind = apl.inPlaceUpdate(vp, withStrip, paired, press, false, shown);
  assert.strictEqual(behind.commands.find((c) => c.property === "overrides").value, press);
});

test("a layout edit takes the screen to the page being edited (showPage)", () => {
  const edited = JSON.parse(JSON.stringify(display));
  edited.version = 8;
  edited.manifest.showPage = 0;
  // a whole new screen: starts where it was, then turns to the edited page
  const d = apl.displayScreen(vp, edited, paired, "", false, 1);
  assert.strictEqual(bind(d, "mmCur"), 1);
  assert.deepStrictEqual(rootOf(d).onMount.find((c) => /^Mm/.test(c.type)), { type: "MmGoTo", to: 0 });
  assert.ok(d.document.commands.MmGoTo);
  // in place: the same turn, appended to the update
  const v = apl.displayView(vp, display);
  const up = apl.inPlaceUpdate(vp, edited, paired, "", false, { layout: v.layout, url: v.urls.join("|"), page: "2" });
  assert.deepStrictEqual(up.commands[up.commands.length - 1], { type: "MmGoTo", to: 0 });
  // already there, out of range, or absent: no turn
  assert.ok(!apl.inPlaceUpdate(vp, edited, paired, "", false, { layout: v.layout, url: v.urls.join("|"), page: "0" }).commands.some((c) => c.type === "MmGoTo"));
  edited.manifest.showPage = 9;
  assert.ok(!apl.inPlaceUpdate(vp, edited, paired, "", false, { layout: v.layout, url: v.urls.join("|"), page: "2" }).commands.some((c) => c.type === "MmGoTo"));
  assert.ok(rootOf(apl.displayScreen(vp, display, paired, "", false, 1)).onMount.some((c) => c.type === "MmRotate"));
});

test("a new random photo list for an image widget updates in place, not a whole new screen", () => {
  const ss = (urls) => ({ type: "slideshow", rect: { x: 0, y: 0, w: 400, h: 300 }, images: urls, intervalSeconds: 60, transition: "fade" });
  const before = JSON.parse(JSON.stringify(display));
  before.manifest.pages[0].overlays = [ss(["https://x/a.jpg", "https://x/b.jpg", "https://x/c.jpg"])];
  const v = apl.displayView(vp, before);
  const after = JSON.parse(JSON.stringify(before));
  after.version = 8;
  after.manifest.pages[0].overlays = [ss(["https://x/q.jpg", "https://x/r.jpg", "https://x/s.jpg", "https://x/t.jpg"])];
  const up = apl.inPlaceUpdate(vp, after, paired, "", false, { layout: v.layout, url: v.urls.join("|"), page: "0" });
  assert.ok(up, "photo list change is contents");
  const set = (prop) => up.commands.find((c) => c.componentId === "p0o0ss" && c.property === prop);
  assert.deepStrictEqual(set("mmSsN").value, 4);
  assert.deepStrictEqual(set("mmSsUrls").value.map((m) => set("mmSsPre").value + m + set("mmSsSuf").value),
    ["https://x/q.jpg", "https://x/r.jpg", "https://x/s.jpg", "https://x/t.jpg"]);
  // but a widget that stops or starts cycling is a layout change
  const lone = JSON.parse(JSON.stringify(before));
  lone.manifest.pages[0].overlays = [ss(["https://x/a.jpg", "https://x/a.jpg"])];
  assert.strictEqual(apl.inPlaceUpdate(vp, lone, paired, "", false, { layout: v.layout, url: v.urls.join("|"), page: "0" }), null);
});
