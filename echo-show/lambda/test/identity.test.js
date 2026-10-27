const test = require("node:test");
const assert = require("node:assert");
const { codeFor } = require("../identity");

test("codes are ET + 9 digits 1-9", () => {
  for (let i = 0; i < 500; i++) assert.match(codeFor("amzn1.ask.device.TEST" + i), /^ET[1-9]{9}$/);
});

test("same Echo, same code; different Echo, different code", () => {
  const a = codeFor("amzn1.ask.device.A");
  assert.strictEqual(codeFor("amzn1.ask.device.A"), a);
  assert.notStrictEqual(codeFor("amzn1.ask.device.B"), a);
});

// 9^9 codes: like the random Roku/tvOS codes, N displays share a code with
// odds ~N^2/(2*9^9) - expect ~13 shared pairs at 100k. The hash must do no
// worse than random; at 1,000 Echos the expectation is 0.001 pairs.
test("collisions no worse than random codes", () => {
  const seen = new Set();
  for (let i = 0; i < 100000; i++) seen.add(codeFor("amzn1.ask.device." + i));
  assert.ok(100000 - seen.size <= 30, "shared codes: " + (100000 - seen.size));
  const small = new Set();
  for (let i = 0; i < 1000; i++) small.add(codeFor("amzn1.ask.device.x" + i));
  assert.strictEqual(small.size, 1000);
});
