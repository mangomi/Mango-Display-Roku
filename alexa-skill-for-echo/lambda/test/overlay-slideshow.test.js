// The slideshow runs on the Echo from commands in the document, so these
// tests check the document's shape against the Echo's APL rules AND step
// its commands with a tiny interpreter (the expressions it uses -
// ternary, %, &&, array index - are also JavaScript) to check what shows:
// the old photo stays until the new one has loaded, failed loads are
// skipped, and a load that never ends is given up on. Image onLoad/onFail
// only record (they run in fast mode on the Echo); the loop does the rest.
const test = require("node:test");
const assert = require("node:assert");
const { build, sized, affixes } = require("../overlay-slideshow");
const overlays = require("../overlays");
const apl = require("../apl");
const { ev, inflate } = require("./inflate");

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

/** The slideshow's instance expanded from the package (inflate.js): the
 * container, what its expressions see, its drawn children. */
function expand(cfg) {
  const [inst] = build(cfg, ctx);
  const { node: box, scope: vars } = inflate(inst, { mmDiagLoads: 0 });
  const E = (v) => ev(v, vars);
  return { inst, box, vars, E, items: box.items.filter((c) => c.when === undefined || E(c.when)) };
}

/** Steps the built slideshow's mount sequence: vars are the container's
 * binds, props the Images'. The sequence pauses at each Idle; load/fail
 * play the Images' handlers in between. */
function machine(cfg) {
  const { box, vars, E, items } = expand(cfg);
  const imgs = Object.fromEntries(items.filter((c) => c.type === "Image").map((c) => [E(c.id), c]));
  const props = Object.fromEntries(Object.keys(imgs).map((id) => [id, { source: E(imgs[id].source), opacity: E(imgs[id].opacity) }]));
  const evalv = E;
  function* run(cmds) {
    for (const c of cmds) {
      if (c.when !== undefined && !evalv(c.when)) continue;
      if (c.type === "Sequential" || c.type === "Parallel") {
        for (let k = 0; k < (evalv(c.repeatCount) || 0) + 1; k++) yield* run(c.commands);
      } else if (c.type === "Idle") yield evalv(c.delay);
      else if (c.type === "SetValue") {
        const id = evalv(c.componentId);
        if (id === box.id) vars[c.property] = evalv(c.value);
        else if (id === "mmRoot") continue; // the load count (apl.js)
        else props[id][c.property] = evalv(c.value);
      } else if (c.type === "AnimateItem") {
        for (const v of c.value) if (v.property === "opacity") props[evalv(c.componentId)].opacity = v.to;
      }
    }
  }
  const gen = run(box.onMount);
  const handle = (cmds) => { for (const _ of run(cmds.filter((c) => c.componentId !== "mmRoot"))); };
  // the resume number goes to the screen's MmSsKeep (apl.js)
  const [A, B] = Object.keys(imgs);
  const interval = Math.max(3, Number(cfg.intervalSeconds) || 60) * 1000;
  const m = {
    vars, props, A, B, box,
    shown: () => {
      // B draws over A; the photo on show is the top visible one
      const top = props[B].opacity > 0 ? B : props[A].opacity > 0 ? A : null;
      return top && props[top].source;
    },
    load: (id) => handle(imgs[id].onLoad),
    fail: (id) => handle(imgs[id].onFail),
    // run until the loop rests on its interval (or the sequence ends);
    // returns how many 250ms polls it spent waiting on a load
    rest: () => {
      let polls = 0;
      for (;;) {
        const r = gen.next();
        if (r.done || r.value === interval) return polls;
        polls++;
      }
    },
    // the interval passes: the next photo is handed out and waited for
    tick: () => gen.next(),
    // the Image the loop is waiting on
    loading: () => (vars.mmSsNext || "A") === "A" ? A : B,
  };
  return m;
}

test("cycles A/B; the old photo stays up until the new one loads", () => {
  const m = machine(widget());
  // the first photo shows at once - no waiting on onLoad to be visible
  assert.strictEqual(m.shown(), photos(3)[0]);
  m.rest();
  assert.strictEqual(m.shown(), photos(3)[0]);
  m.tick();
  assert.strictEqual(m.props[m.B].source, photos(3)[1]);
  assert.strictEqual(m.shown(), photos(3)[0], "no empty frame while loading");
  m.load(m.B);
  m.rest();
  assert.strictEqual(m.shown(), photos(3)[1]);
  m.tick();
  assert.strictEqual(m.props[m.A].source, photos(3)[2]);
  assert.strictEqual(m.shown(), photos(3)[1]);
  m.load(m.A);
  m.rest();
  assert.strictEqual(m.shown(), photos(3)[2]);
  m.tick();
  m.load(m.B);
  m.rest();
  assert.strictEqual(m.shown(), photos(3)[0], "wraps around");
});

test("a failed photo is skipped, the old one stays", () => {
  const m = machine(widget());
  m.rest();
  m.tick();
  m.fail(m.B);
  m.rest();
  assert.strictEqual(m.shown(), photos(3)[0]);
  m.tick();
  assert.strictEqual(m.props[m.B].source, photos(3)[2]);
  m.load(m.B);
  m.rest();
  assert.strictEqual(m.shown(), photos(3)[2]);
});

test("an Echo that never reports onLoad still changes photos, after at most 3s", () => {
  const m = machine(widget());
  m.rest();
  m.tick();
  const polls = m.rest(); // B never reports a load
  assert.strictEqual(polls, 3000 / 250 - 1, "waited up to 3s in 250ms polls");
  assert.strictEqual(m.shown(), photos(3)[1], "switched anyway");
  m.tick();
  m.rest();
  assert.strictEqual(m.shown(), photos(3)[2], "and keeps cycling");
});

test("every transition leaves exactly the new photo visible", () => {
  for (const transition of ["fade", "slideleft", "slideright", "slideup", "slidedown", "flip", "pop"]) {
    const m = machine(widget({ transition }));
    m.rest();
    for (let i = 1; i <= 4; i++) {
      m.tick();
      m.load(m.loading());
      m.rest();
      assert.strictEqual(m.shown(), photos(3)[i % 3], transition);
      assert.strictEqual([m.A, m.B].filter((x) => m.props[x].opacity > 0).length, 1, transition);
    }
  }
});

test("the photos' load handlers only record - they run in fast mode on the Echo", () => {
  for (const img of expand(widget()).items.filter((c) => c.type === "Image")) {
    for (const c of [...img.onLoad, ...img.onFail]) assert.strictEqual(c.type, "SetValue");
  }
});

test("APL rules: unique ids from idPrefix, prefixed sequencers, same transform shapes, Frames of one child", () => {
  for (const transition of ["fade", "slideleft", "flip"]) {
    const { box, E } = expand(widget({ transition, pageColor: "#123456", brightness: 0.5 }));
    const ids = [];
    walk(box, (n) => {
      if (n.id) ids.push(E(n.id));
      if (n.sequencer) assert.match(E(n.sequencer), /^slideshowp0o2/);
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
  const { inst, items, E } = expand(widget({ pageColor: "rgb(1,2,3)", brightness: 0.25, cropToFill: true }));
  assert.deepStrictEqual([inst.left, inst.top, inst.width, inst.height], [50, 100, 400, 300]);
  assert.deepStrictEqual(items.map((c) => c.type), ["Frame", "Image", "Image", "Frame"]);
  assert.strictEqual(E(items[0].backgroundColor), "rgb(1,2,3)");
  assert.strictEqual(E(items[1].scale), "best-fill");
  assert.strictEqual(E(items[3].opacity), 0.75);
  const plain = expand(widget());
  assert.deepStrictEqual(plain.items.map((c) => c.type), ["Image", "Image"]);
  assert.strictEqual(plain.E(plain.items[0].scale), "best-fit");
});

test("interval: min 3s, default 60s", () => {
  const idle = (extra) => {
    const { box, E } = expand(widget(extra));
    return E(box.onMount[0].commands.find((c) => c.repeatCount === 1000000).commands[0].delay);
  };
  const { items, E } = expand(widget());
  assert.strictEqual(items.find((c) => /ssA$/.test(E(c.id))).opacity, 1, "first photo visible from the start");
  assert.strictEqual(idle({ intervalSeconds: 1 }), 3000);
  assert.strictEqual(idle({ intervalSeconds: undefined }), 60000);
  assert.strictEqual(idle({ intervalSeconds: 15 }), 15000);
});

test("background: whole canvas; one photo sent as a pair is a still; a lone one falls back", () => {
  const bg = { type: "background", images: ["https://example.com/a.jpg", "https://example.com/a.jpg"], intervalSeconds: 86400, brightness: 1 };
  const [box] = build(bg, ctx);
  assert.deepStrictEqual([box.left, box.top, box.width, box.height], [0, 0, 960, 540]);
  assert.strictEqual(box.mmCyc, false, "nothing to cycle");
  const m = machine(bg);
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
  assert.strictEqual(new URL(box.mmFirst).searchParams.get("w"), "800");
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
  // the loop and transitions are the package's: the screen carries the
  // settings and the URLs, ~5 bytes a photo (affixes)
  assert.ok(one.length < 1200, "one 30-photo slideshow is " + one.length + " bytes");
  const page = (i) => ({
    image: "display_p" + i + ".png",
    overlays: [
      { type: "background", images: unsplash, intervalSeconds: 30, brightness: 0.8, pageColor: "#000000" },
      { type: "slideshow", rect: { x: 100, y: 100, w: 600, h: 400 }, images: unsplash, intervalSeconds: 10, transition: "flip" },
    ],
  });
  const d = apl.displayScreen(vp, { manifest: { canvas, pages: [0, 1, 2, 3, 4].map(page) }, assetBase: "https://assets/", version: 1 }, { major: "1", minor: "2" });
  const bytes = JSON.stringify(d).length;
  // ten 30-photo slideshows, far beyond a real display; the list is the
  // same everywhere, so each size of it travels once (was ~78 KB)
  assert.ok(bytes < 25000, "screen is " + bytes + " bytes");
});
