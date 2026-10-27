// The clock's APL expressions can only be evaluated on an Echo (or the
// APL authoring tool), so these tests pin the composition: which pieces
// appear, in what order, and that manifest strings stay out of the
// expression text.
const test = require("node:test");
const assert = require("node:assert");
const { timeText, dateText, timeExpr } = require("../clock");

const T = "(utcTime + 0)";

test("display timezone offset, else device local", () => {
  assert.strictEqual(timeExpr({ tzOffsetMinutes: -240 }), "(utcTime + -14400000)");
  assert.strictEqual(timeExpr({}), "localTime");
});

test("24h with padded hour", () => {
  const r = timeText({ is24h: true, padHour: true }, T);
  assert.match(r.text, /^\$\{Time\.hours\(.*\) < 10 \? '0' : ''\}\$\{Time\.hours/);
  assert.ok(!r.text.includes("mmAm"));
});

test("12h with the manifest's meridiem, prefixed and unspaced", () => {
  const r = timeText({ is24h: false, showMeridiem: true, am: "午前", pm: "午後", meridiemPrefix: true, meridiemSpaced: false }, T);
  assert.ok(r.text.startsWith("${Time.hours(" + T + ") < 12 ? mmAm : mmPm}${"));
  assert.deepStrictEqual(r.bind, [{ name: "mmAm", value: "午前" }, { name: "mmPm", value: "午後" }]);
  assert.ok(!r.text.includes("午前"));
});

test("12h with meridiem switched off shows none", () => {
  const r = timeText({ is24h: false, showMeridiem: false, am: "AM", pm: "PM" }, T);
  assert.ok(!r.text.includes("mmAm"));
});

test("legacy manifest: English suffix, lower-case unless upperMeridiem", () => {
  const r = timeText({ is24h: false, upperMeridiem: false }, T);
  assert.ok(r.text.endsWith(" ${Time.hours(" + T + ") < 12 ? mmAm : mmPm}"));
  assert.strictEqual(r.bind[0].value, "am");
});

test("date follows the manifest's pattern, literals bound", () => {
  const wd = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const mo = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const r = dateText({ pattern: [{ t: "weekday" }, { t: "lit", v: ", ${x} " }, { t: "day" }, { t: "lit", v: " de " }, { t: "month" }], weekdays: wd, months: mo }, T);
  assert.strictEqual(r.text, "${mmWeekdays[Time.weekDay(" + T + ")]}${mmLit1}${Time.date(" + T + ")}${mmLit3}${mmMonths[Time.month(" + T + ")]}");
  assert.strictEqual(r.bind.find((b) => b.name === "mmLit1").value, ", ${x} ");
  assert.deepStrictEqual(r.bind[0].value, wd);
});

test("legacy date: English weekday, month day", () => {
  const r = dateText({}, T);
  assert.strictEqual(r.bind[0].value[0], "Sunday");
  assert.ok(r.text.includes("Time.weekDay") && r.text.includes("Time.month") && r.text.includes("Time.date"));
});
