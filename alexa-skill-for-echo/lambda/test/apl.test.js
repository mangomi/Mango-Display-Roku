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
// the root container, and page i's layer inside it (pages.js)
const rootOf = (d) => d.document.mainTemplate.items[0].items[0];
const layerOf = (d, i = 0) => rootOf(d).items.find((c) => c.id === "mmP" + i).item.items;

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
  const layers = layerOf(screens.display);
  const kinds = layers.map((l) => l.type + (l.source !== undefined ? ":" + (/^data:/.test(l.source) ? "spinner" : String(l.source).split("/").pop().split("?")[0]) : ""));
  // the page is two stacked layers (mmPage + the cross-fade's mmPagePrev, empty until an update)
  assert.deepStrictEqual(kinds, ["Frame", "Image:a.jpg", "Frame", "Image:display_p0.png", "Image:", "Text", "Text"]);
  // the busy spinner is above every page, last on the root
  const top = rootOf(screens.display).items;
  assert.match(top[top.length - 1].source, /^data:image/);
});

test("display: portrait canvas on a portrait Echo fills the screen, rotation ignored", () => {
  const page = layerOf(screens.display).find((l) => l.source && /display_p0/.test(l.source));
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

const v3 = { manifest, assetBase: "https://assets/", version: 3 };
const shownFor = (d) => { const v = apl.displayView(vp, d); return { layout: v.layout, url: v.urls.join("|") }; };

test("in place: a new render with the same layout updates the screen instead of replacing it", () => {
  const swiped = { ...v3, version: 4, manifest: { ...manifest, pages: [{ ...manifest.pages[0], imageHash: "new" }] } };
  const shown = shownFor(v3);
  const up = apl.inPlaceUpdate(vp, swiped, paired, "", false, shown);
  assert.strictEqual(up.type, "Alexa.Presentation.APL.ExecuteCommands");
  assert.strictEqual(up.token, "display");
  const set = (id, prop) => up.commands.find((c) => c.componentId === id && c.property === prop);
  assert.strictEqual(set("mmRoot", "mmVer").value, "4");
  assert.strictEqual(set("mmRoot", "mmSwiping").value, "");
  // cross-fade: the old picture goes on the top layer, the new one is handed over via mmNext
  assert.strictEqual(set("mmPagePrev0", "source").value, shown.url);
  assert.match(set("mmPagePrev0", "mmNext").value, /\?h=new$/);
  assert.strictEqual(set("mmPagePrev0", "opacity").value, 1);
});

test("in place: a moved or resized widget needs a whole new screen", () => {
  const moved = JSON.parse(JSON.stringify(manifest));
  moved.pages[0].overlays[0].elements.time.rect.y += 40;
  assert.strictEqual(apl.inPlaceUpdate(vp, { ...v3, version: 4, manifest: moved }, paired, "", false, shownFor(v3)), null);
  assert.strictEqual(apl.inPlaceUpdate(vp, v3, paired, "", false, { layout: "", url: "" }), null); // older screen: no fingerprint
});

test("in place: checkbox states set on their own boxes; a tick change alone keeps the layout", () => {
  const withBoxes = JSON.parse(JSON.stringify(manifest));
  withBoxes.pages[0].targets = { sprites: { empty: "e.png", checked: "c.png" },
    items: [{ rect: { x: 10, y: 10, w: 20, h: 20 }, checked: false, payload: { id: 77 } }] };
  const before = { ...v3, manifest: withBoxes };
  const after = JSON.parse(JSON.stringify(before)); after.version = 4; after.manifest.pages[0].targets.items[0].checked = true;
  const up = apl.inPlaceUpdate(vp, after, paired, "", false, shownFor(before));
  const box = up.commands.find((c) => c.componentId === "mmBox0_77");
  assert.deepStrictEqual([box.property, box.value], ["mmTicked", true]);
  // and the page image did not change: no cross-fade
  assert.ok(!up.commands.some((c) => c.componentId === "mmPagePrev0"));
});

test("page layers: the new picture loads behind the old one, which is then lifted", () => {
  const items = layerOf(screens.display);
  const page = items.find((i) => i.id === "mmPage0"), prev = items.find((i) => i.id === "mmPagePrev0");
  assert.ok(items.indexOf(prev) > items.indexOf(page), "prev drawn above");
  assert.strictEqual(prev.opacity, 0);
  assert.deepStrictEqual([prev.onLoad[0].componentId, prev.onLoad[0].value], ["mmPage0", "${mmNext}"]);
  // fast mode: the old picture is lifted with a SetValue, not animated
  assert.deepStrictEqual([page.onLoad[0].type, page.onLoad[0].componentId, page.onLoad[0].property, page.onLoad[0].value],
    ["SetValue", "mmPagePrev0", "opacity", 0]);
});

test("in place: the clock's per-minute sample text and its measured width are not layout", () => {
  const next = JSON.parse(JSON.stringify(manifest));
  next.pages[0].overlays[0].elements.time.sample = "2:41";
  next.pages[0].overlays[0].elements.time.textRect = { x: 71, y: 103, w: 203, h: 300 };
  assert.ok(apl.inPlaceUpdate(vp, { ...v3, version: 4, manifest: next }, paired, "", false, shownFor(v3)));
});

// Fast-mode handlers (touch down/up/move/cancel, image load/fail, ticks)
// silently drop commands that take time or reach the skill: on the Echo a
// swipe never arrived (SendEvent in onUp) and no photo ever showed
// (AnimateItem in onLoad). Nothing in any screen may put them there.
const FAST = ["onDown", "onUp", "onMove", "onCancel", "onLoad", "onFail", "handleTick"];
const SLOW = /"type":"(AnimateItem|Idle|SendEvent|Sequential|Parallel|Mm[A-Za-z]+)"/;
function fastModeViolations(document) {
  const bad = [];
  (function walk(n, path) {
    if (Array.isArray(n)) return n.forEach((c, i) => walk(c, path + "[" + i + "]"));
    if (!n || typeof n !== "object") return;
    for (const [k, v] of Object.entries(n)) {
      if (FAST.includes(k)) {
        const cmds = k === "handleTick" ? (v || []).map((h) => h.commands) : v;
        const m = JSON.stringify(cmds || []).match(SLOW);
        if (m) bad.push(path + "." + k + ": " + m[1]);
      }
      walk(v, path + "." + k);
    }
  })(document, "");
  return bad;
}

test("no animation, wait, event or named command in a fast-mode handler, on any screen", () => {
  const rich = JSON.parse(JSON.stringify(manifest));
  rich.gestures = { pageSwipe: true, calendarScroll: true };
  rich.pages[0].regions = [{ kind: "calendar", rect: { x: 100, y: 100, w: 500, h: 600 }, id: 9 }];
  rich.pages[0].targets = { sprites: { empty: "e.png", checked: "c.png" }, items: [{ rect: { x: 10, y: 10, w: 20, h: 20 }, payload: { id: 1 } }] };
  rich.pages[0].overlays.push(
    { type: "slideshow", rect: { x: 0, y: 0, w: 400, h: 300 }, images: ["https://x/a.jpg", "https://x/b.jpg"], intervalSeconds: 15, transition: "slideleft" },
    { type: "gif", rect: { x: 0, y: 400, w: 200, h: 200 }, stripFile: "g.png", frameW: 200, frameH: 200, cols: 3, rows: 1, frameCount: 3, frameMs: 100 },
    { type: "countdown", elements: {} },
  );
  rich.effects = [{ type: "snow" }];
  rich.pages.push(JSON.parse(JSON.stringify(rich.pages[0])));
  for (const d of [
    screens.pairing, screens.connected,
    apl.displayScreen(vp, { manifest: rich, assetBase: "https://assets/", version: 3 }, paired, "", true, 0),
  ]) {
    assert.deepStrictEqual(fastModeViolations(d.document), []);
    assert.deepStrictEqual(fastModeViolations(d.document.layouts || {}), []);
    assert.deepStrictEqual(fastModeViolations(d.document.commands || {}), []);
  }
});
