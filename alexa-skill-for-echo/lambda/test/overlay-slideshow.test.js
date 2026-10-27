// The slideshow runs on the Echo from commands in the document, so these
// tests check the document's shape against the Echo's APL rules AND step
// its commands with a tiny interpreter (the expressions it uses -
// ternary, %, &&, array index - are also JavaScript) to check what shows:
// the old photo stays until the new one has loaded, failed loads are
// skipped, and the loop waits for a transition in flight.
const test = require("node:test");
const assert = require("node:assert");
const { build, sized, affixes } = require("../overlay-slideshow");
const overlays = require("../overlays");
const apl = require("../apl");

const canvas = { width: 1920, height: 1080 };
const vp = { w: 960, h: 540, pw: 1920, ph: 1080 };
const ctx = { place: apl.placement(canvas, vp), canvas, vp, idPrefix: "p0o2" };
const photos = (n) => Array.from({ length: n }, (_, i) => "https://example.com/photo" + i + ".jpg");
const widget = (extra) => ({ type: "slideshow", rect: { x: 100, y: 200, w: 800, h: 600 }, images: photos(3), intervalSeconds: 10, ...extra });

function walk(node, fn) {
  if (Array.isArray(node)) node.forEach((n) => walk(n, fn));
  else if (node && typeof node === "object") {
    fn(node);
    Object.values(node).forEach((v) => walk(v, fn));
  }
}

/** Runs the built slideshow's commands: vars are the container's binds,
 * comps the Images' props. */
function machine(cfg) {
  const [box] = build(cfg, ctx);
  const vars = Object.fromEntries(box.bind.map((b) => [b.name, b.value]));
  const imgs = Object.fromEntries(box.items.filter((c) => c.type === "Image").map((c) => [c.id, c]));
  const props = Object.fromEntries(Object.keys(imgs).map((id) => [id, { source: imgs[id].source, opacity: imgs[id].opacity }]));
  const evalv = (v) => {
    if (typeof v !== "string" || !v.startsWith("${")) return v;
    return new Function(...Object.keys(vars), "return (" + v.slice(2, -1) + ")")(...Object.values(vars));
  };
  const run = (cmds) => {
    for (const c of cmds) {
      if (c.when !== undefined && !evalv(c.when)) continue;
      if (c.type === "Sequential" || c.type === "Parallel") run(c.commands);
      else if (c.type === "SetValue") {
        if (c.componentId === box.id) vars[c.property] = evalv(c.value);
        else props[c.componentId][c.property] = evalv(c.value);
      } else if (c.type === "AnimateItem") {
        for (const v of c.value) if (v.property === "opacity") props[c.componentId].opacity = v.to;
      }
    }
  };
  const [A, B] = Object.keys(imgs);
  const shown = () => {
    // B draws over A; the photo on show is the top visible one
    const top = props[B].opacity > 0 ? B : props[A].opacity > 0 ? A : null;
    return top && props[top].source;
  };
  return {
    vars, props, A, B, shown, box,
    tick: () => run(box.onMount[0].commands),
    load: (id) => run(imgs[id].onLoad),
    fail: (id) => run(imgs[id].onFail),
    // the Image whose source the last tick changed
    loading: () => [A, B].find((id) => props[id].source && props[id].opacity === 0),
  };
}

test("cycles A/B; the old photo stays up until the new one loads", () => {
  const m = machine(widget());
  assert.strictEqual(m.shown(), null);
  m.load(m.A);
  assert.strictEqual(m.shown(), photos(3)[0]);
  m.tick();
  assert.strictEqual(m.props[m.B].source, photos(3)[1]);
  assert.strictEqual(m.shown(), photos(3)[0], "no empty frame while loading");
  m.load(m.B);
  assert.strictEqual(m.shown(), photos(3)[1]);
  m.tick();
  assert.strictEqual(m.props[m.A].source, photos(3)[2]);
  assert.strictEqual(m.shown(), photos(3)[1]);
  m.load(m.A);
  assert.strictEqual(m.shown(), photos(3)[2]);
  m.tick();
  m.load(m.B);
  assert.strictEqual(m.shown(), photos(3)[0], "wraps around");
});

test("a failed photo is skipped, the old one stays", () => {
  const m = machine(widget());
  m.load(m.A);
  m.tick();
  m.fail(m.B);
  assert.strictEqual(m.shown(), photos(3)[0]);
  m.tick();
  assert.strictEqual(m.props[m.B].source, photos(3)[2]);
  m.load(m.B);
  assert.strictEqual(m.shown(), photos(3)[2]);
});

test("the loop waits for a load in flight, then gives up on it", () => {
  const m = machine(widget({ intervalSeconds: 10 })); // 30s give-up = 3 ticks
  m.load(m.A);
  m.tick();
  m.tick();
  m.tick();
  assert.strictEqual(m.vars.mmSsIdx, 1, "still waiting on photo 1");
  m.tick();
  assert.strictEqual(m.vars.mmSsIdx, 2, "gave up, moved on");
  assert.strictEqual(m.props[m.B].source, photos(3)[2]);
});

test("every transition leaves exactly the new photo visible", () => {
  for (const transition of ["fade", "slideleft", "slideright", "slideup", "slidedown", "flip", "pop"]) {
    const m = machine(widget({ transition }));
    m.load(m.A);
    for (let i = 1; i <= 4; i++) {
      m.tick();
      const id = m.loading();
      m.load(id);
      assert.strictEqual(m.shown(), photos(3)[i % 3], transition);
      assert.strictEqual([m.A, m.B].filter((x) => m.props[x].opacity > 0).length, 1, transition);
    }
  }
});

test("APL rules: unique ids from idPrefix, prefixed sequencers, same transform shapes, Frames of one child", () => {
  for (const transition of ["fade", "slideleft", "flip"]) {
    const comps = build(widget({ transition, pageColor: "#123456", brightness: 0.5 }), ctx);
    const ids = [];
    walk(comps, (n) => {
      if (n.id) ids.push(n.id);
      if (n.sequencer) assert.match(n.sequencer, /^slideshowp0o2/);
      if (n.type === "Frame") assert.ok(!n.items || n.items.length <= 1);
      if (n.type === "AnimateItem") {
        for (const v of n.value) {
          if (v.property !== "transform") continue;
          assert.deepStrictEqual(v.from.map(Object.keys), v.to.map(Object.keys));
        }
      }
      for (const b of n.bind || []) assert.match(b.name, /^mm/);
    });
    assert.ok(ids.every((id) => id.startsWith("p0o2")));
    assert.strictEqual(new Set(ids).size, ids.length);
  }
});

test("layers: page color, the two photos, dimming on top, at the rect", () => {
  const [box] = build(widget({ pageColor: "rgb(1,2,3)", brightness: 0.25, cropToFill: true }), ctx);
  assert.deepStrictEqual([box.left, box.top, box.width, box.height], [50, 100, 400, 300]);
  assert.deepStrictEqual(box.items.map((c) => c.type), ["Frame", "Image", "Image", "Frame"]);
  assert.strictEqual(box.items[0].backgroundColor, "rgb(1,2,3)");
  assert.strictEqual(box.items[1].scale, "best-fill");
  assert.strictEqual(box.items[3].opacity, 0.75);
  assert.strictEqual(build(widget(), ctx)[0].items[0].scale, "best-fit");
});

test("interval: min 3s, default 60s", () => {
  const idle = (extra) => build(widget(extra), ctx)[0].onMount[0].commands[0].delay;
  assert.strictEqual(idle({ intervalSeconds: 1 }), 3000);
  assert.strictEqual(idle({ intervalSeconds: undefined }), 60000);
  assert.strictEqual(idle({ intervalSeconds: 15 }), 15000);
});

test("background: whole canvas; one photo sent as a pair is a still; a lone one falls back", () => {
  const bg = { type: "background", images: ["https://example.com/a.jpg", "https://example.com/a.jpg"], intervalSeconds: 86400, brightness: 1 };
  const [box] = build(bg, ctx);
  assert.deepStrictEqual([box.left, box.top, box.width, box.height], [0, 0, 960, 540]);
  assert.deepStrictEqual(box.onMount, [], "nothing to cycle");
  const m = machine(bg);
  m.load(m.A);
  assert.strictEqual(m.shown(), "https://example.com/a.jpg");
  // fewer than two: nothing here, overlays.js draws the still
  assert.deepStrictEqual(build({ ...bg, images: ["https://example.com/a.jpg"] }, ctx), []);
  const under = overlays.pageOverlays({ overlays: [{ ...bg, images: ["https://example.com/a.jpg"] }] }, ctx, 0).under;
  assert.strictEqual(under[0].type, "Image");
  assert.strictEqual(overlays.pageOverlays({ overlays: [bg] }, ctx, 0).under[0].id, "p0o0ss");
});

test("Unsplash photos are asked for at the widget's device pixels", () => {
  const u = sized("https://images.unsplash.com/photo-1?ixlib=rb-4.0.3&crop=entropy&fit=max&q=80&w=3000", 800.2, 600, true);
  const q = new URL(u).searchParams;
  assert.deepStrictEqual([q.get("w"), q.get("h"), q.get("fit"), q.get("crop"), q.get("q")], ["801", "600", "crop", null, "80"]);
  assert.strictEqual(new URL(sized("https://images.unsplash.com/p", 10, 10, false)).searchParams.get("fit"), "clip");
  assert.strictEqual(sized("https://example.com/a.jpg?w=1", 10, 10, true), "https://example.com/a.jpg?w=1");
  // device px = dp * pw / w: an 800x600 canvas rect at half scale on a 2x screen
  const [box] = build(widget({ images: ["https://images.unsplash.com/a", "https://images.unsplash.com/b"] }), ctx);
  assert.strictEqual(new URL(box.items[0].source).searchParams.get("w"), "800");
});

test("URLs travel as a shared start and end plus what differs", () => {
  const urls = ["https://x.com/p/abc.jpg?q=1", "https://x.com/p/aXY.jpg?q=1", "https://x.com/p/abc.jpg?q=1"];
  const { pre, mids, suf } = affixes(urls);
  assert.deepStrictEqual([pre, mids, suf], ["https://x.com/p/a", ["bc", "XY", "bc"], ".jpg?q=1"]);
  assert.deepStrictEqual(mids.map((m) => pre + m + suf), urls);
  assert.deepStrictEqual(affixes(["u", "u"]), { pre: "u", mids: ["", ""], suf: "" });
});

test("size: a 30-photo background and slideshow on each of 5 pages stays well under Alexa's limit", () => {
  const unsplash = Array.from({ length: 30 }, (_, i) =>
    "https://images.unsplash.com/photo-16" + String(i).padStart(11, "0") + "-a1b2c3d4e5f6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w1MjQ0NTd8MHwxfHNlYXJjaHwxfHxuYXR1cmV8ZW58MHx8fHwxNzAwMDAwMDAwfDA&ixlib=rb-4.0.3&q=80&w=3000");
  const one = JSON.stringify(build({ type: "background", images: unsplash, intervalSeconds: 30, brightness: 0.8, pageColor: "#000000", transition: "slideleft" }, ctx));
  // ~5 KB of commands whatever the count: the URLs add ~5 bytes a photo (affixes)
  assert.ok(one.length < 7000, "one 30-photo slideshow is " + one.length + " bytes");
  const page = (i) => ({
    image: "display_p" + i + ".png",
    overlays: [
      { type: "background", images: unsplash, intervalSeconds: 30, brightness: 0.8, pageColor: "#000000" },
      { type: "slideshow", rect: { x: 100, y: 100, w: 600, h: 400 }, images: unsplash, intervalSeconds: 10, transition: "flip" },
    ],
  });
  const d = apl.displayScreen(vp, { manifest: { canvas, pages: [0, 1, 2, 3, 4].map(page) }, assetBase: "https://assets/", version: 1 }, { major: "1", minor: "2" });
  const bytes = JSON.stringify(d).length;
  // ~78 KB: ten 30-photo slideshows, far beyond a real display
  assert.ok(bytes < 120000, "screen is " + bytes + " bytes");
});
