// The GIF player runs on the Echo (a tick handler and a bound transform),
// so these tests pin the document's shape and evaluate its expressions in
// JavaScript (the ones it uses - %, Math.floor - mean the same there) to
// check which frame of the sheet the window shows.
const test = require("node:test");
const assert = require("node:assert");
const { build } = require("../overlay-gif");
const apl = require("../apl");

const canvas = { width: 1920, height: 1080 };
const vp = { w: 960, h: 540, pw: 1920, ph: 1080 }; // scale 0.5
const ctx = { place: apl.placement(canvas, vp), canvas, vp, assetBase: "https://a/", idPrefix: "p0o1" };
const gif = (extra) => ({
  type: "gif", rect: { x: 100, y: 200, w: 120, h: 80 }, stripFile: "overlay_gif_ab.png",
  frameW: 120, frameH: 80, cols: 4, rows: 3, frameCount: 10, frameMs: 70, source: "https://x/y.gif", ...extra,
});

/** Evaluates an APL "${...}" expression with the given variables. */
function evalExpr(s, vars) {
  const m = /^\$\{(.*)\}$/.exec(s);
  assert.ok(m, "not an expression: " + s);
  return new Function(...Object.keys(vars), "return (" + m[1] + ");")(...Object.values(vars));
}

test("one frame-sized window at the rect, the sheet stretched to the grid", () => {
  const [win] = build(gif(), ctx);
  assert.strictEqual(win.type, "Container");
  assert.deepStrictEqual([win.left, win.top, win.width, win.height], [50, 100, 60, 40]);
  const [sheet] = win.items;
  assert.strictEqual(win.items.length, 1);
  assert.strictEqual(sheet.source, "https://a/overlay_gif_ab.png");
  assert.strictEqual(sheet.scale, "fill");
  assert.deepStrictEqual([sheet.width, sheet.height], [4 * 60, 3 * 40]);
  assert.strictEqual(win.id, "mmp0o1Gif");
});

test("the frame follows the clock and walks the grid row by row", () => {
  const [win] = build(gif(), ctx);
  const [tick] = win.handleTick;
  assert.strictEqual(tick.minimumDelay, 70);
  // fast mode: SetValue only (SendEvent and timed commands are dropped there)
  assert.deepStrictEqual(tick.commands.map((c) => c.type), ["SetValue"]);
  assert.match(win.bind[0].name, /^mm/);
  const frameAt = (ms) => evalExpr(tick.commands[0].value, { elapsedTime: ms, Math });
  assert.deepStrictEqual([0, 69, 70, 699, 700, 7000].map(frameAt), [0, 0, 1, 9, 0, 0]);
  const offset = (f) => win.items[0].transform.map((t) => evalExpr(Object.values(t)[0], { mmGifFrame: f, Math }));
  assert.deepStrictEqual(offset(0), [-0, -0]);
  assert.deepStrictEqual(offset(3), [-180, -0]);
  assert.deepStrictEqual(offset(4), [-0, -40]);
  assert.deepStrictEqual(offset(9), [-60, -80]);
});

test("cadence capped at ~30fps; defaults as on the Roku and tvOS", () => {
  assert.strictEqual(build(gif({ frameMs: 10 }), ctx)[0].handleTick[0].minimumDelay, 33);
  const [win] = build(gif({ frameMs: undefined, frameW: undefined, frameH: undefined, cols: undefined, rows: undefined }), ctx);
  assert.strictEqual(win.handleTick[0].minimumDelay, 100);
  // no frame size -> the rect; no grid -> one column of frameCount rows
  assert.deepStrictEqual([win.width, win.height, win.items[0].width, win.items[0].height], [60, 40, 60, 400]);
});

test("a single frame is a still; no sheet draws nothing", () => {
  const [win] = build(gif({ frameCount: 1, cols: 1, rows: 1 }), ctx);
  assert.strictEqual(win.handleTick, undefined);
  assert.strictEqual(win.items[0].transform, undefined);
  assert.deepStrictEqual(build(gif({ stripFile: "" }), ctx), []);
  assert.deepStrictEqual(build({ type: "gif" }, ctx), []);
});

test("size: a page of 12 weather icons is a few KB", () => {
  const bytes = JSON.stringify(Array.from({ length: 12 }, (_, i) => build(gif(), { ...ctx, idPrefix: "p0o" + i }))).length;
  assert.ok(bytes < 12 * 700, "12 gifs are " + bytes + " bytes");
});
