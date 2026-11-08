// The countdown's numbers are APL expressions the Echo evaluates; the
// subset they use (Math.*, %, arithmetic) is also JavaScript, so these
// tests evaluate them as preview-apl.js does and check the text the Echo
// should show for a given moment.
const test = require("node:test");
const assert = require("node:assert");
const { build, remainExpr, unitText } = require("../overlay-countdown");
const { placement } = require("../apl");

const place = placement({ width: 1920, height: 1080 }, { w: 960, h: 540 });
const ctx = { place, canvas: { width: 1920, height: 1080 }, idPrefix: "p0o1" };
const el = (x) => ({ rect: { x, y: 200, w: 40, h: 50 }, fontSizePx: 40, bold: true, align: "center", color: "#FFFFFFFF" });
const cfg = (target, units = ["day", "hour", "minute", "second"]) => ({
  type: "countdown", targetEpochSeconds: target,
  elements: Object.fromEntries(units.map((u, i) => [u, el(100 + i * 100)])),
});

/** The text an APL Text shows at `nowMs`. */
const show = (c, nowMs) => c.text.replace(/\$\{([^}]*)\}/g, (_, e) => String(new Function("Math", "utcTime", "return (" + e + ")")(Math, nowMs)));

test("days, hours, minutes, seconds, one second ahead like the portal", () => {
  const now = 1_800_000_000_000;
  const target = now / 1000 + 2 * 86400 + 3 * 3600 + 4 * 60 + 5 + 1;
  assert.deepStrictEqual(build(cfg(target), ctx).map((c) => show(c, now)), ["2", "3", "4", "5"]);
  // whole seconds only: 999ms later it still reads the same
  assert.deepStrictEqual(build(cfg(target), ctx).map((c) => show(c, now + 999)), ["2", "3", "4", "5"]);
  assert.deepStrictEqual(build(cfg(target), ctx).map((c) => show(c, now + 1000)), ["2", "3", "4", "4"]);
});

test("fixed modulo whichever boxes are enabled", () => {
  const now = 1_800_000_000_000;
  const target = now / 1000 + 3 * 86400 + 5 * 3600 + 1;
  // no day box: hours stay hours-of-the-day, as on the portal and Roku
  const comps = build(cfg(target, ["hour", "minute"]), ctx);
  assert.deepStrictEqual(comps.map((c) => show(c, now)), ["5", "0"]);
});

test("past the target reads 0 everywhere", () => {
  const now = 1_800_000_000_000;
  assert.deepStrictEqual(build(cfg(now / 1000 - 50), ctx).map((c) => show(c, now)), ["0", "0", "0", "0"]);
});

test("no target, nothing drawn", () => {
  assert.deepStrictEqual(build({ elements: { day: el(0) } }, ctx), []);
});

test("the target goes in as a number only", () => {
  assert.strictEqual(remainExpr("1800000000.7"), "Math.max(0, 1800000000 - Math.floor(utcTime / 1000) - 1)");
  assert.strictEqual(unitText("second", "R"), "${(R) % 60}");
});

test("measured label: style from the manifest, a font-size of slack on the aligned side", () => {
  const center = build(cfg(1, ["day"]), ctx)[0];
  // canvas x 100 - 20 slack, w 40 + 40, at half scale
  assert.deepStrictEqual([center.left, center.top, center.width, center.height], [40, 100, 40, 25]);
  assert.strictEqual(center.fontSize, 20);
  assert.strictEqual(center.fontWeight, "bold");
  assert.strictEqual(center.textAlign, "center");
  const right = build({ targetEpochSeconds: 1, elements: { second: { ...el(100), align: "end", bold: false } } }, ctx)[0];
  assert.deepStrictEqual([right.left, right.width, right.textAlign, right.fontWeight], [30, 40, "right", "normal"]);
  const left = build({ targetEpochSeconds: 1, elements: { second: { ...el(100), align: "start" } } }, ctx)[0];
  assert.deepStrictEqual([left.left, left.width, left.textAlign], [50, 40, "left"]);
});
