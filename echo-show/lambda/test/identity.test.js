const test = require("node:test");
const assert = require("node:assert");
const identity = require("../identity");

test("codes are ET + 9 digits 1-9", () => {
  for (let i = 0; i < 200; i++) assert.match(identity.generateCode(), /^ET[1-9]{9}$/);
});

test("one code per Echo, kept forever", async () => {
  const s = identity.memoryStore();
  const a = await identity.getOrCreateCode("amzn1.ask.device.A", s);
  assert.strictEqual(await identity.getOrCreateCode("amzn1.ask.device.A", s), a);
  assert.notStrictEqual(await identity.getOrCreateCode("amzn1.ask.device.B", s), a);
});
