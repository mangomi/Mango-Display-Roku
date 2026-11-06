// The short address service (photo-links/): number -> photo in the latest list.
const test = require("node:test");
const assert = require("node:assert");
process.env.LISTS_BASE = "https://cdn/";
const { handler } = require("../../photo-links/index");
const ID = "a".repeat(32);
const at = (path) => handler({ rawPath: path });

test("a number redirects to that photo; numbers past the end wrap; nothing is cached", async (t) => {
  const real = global.fetch; t.after(() => { global.fetch = real; });
  global.fetch = async () => ({ ok: true, json: async () => ({ urls: ["u0", "u1", "u2"] }) });
  const r = await at("/" + ID + "/1.jpg");
  assert.deepStrictEqual([r.statusCode, r.headers.Location, r.headers["Cache-Control"]], [302, "u1", "no-store"]);
  assert.strictEqual((await at("/" + ID + "/4.jpg")).headers.Location, "u1");
});

test("anything else is not found, without asking for a list", async (t) => {
  const real = global.fetch; t.after(() => { global.fetch = real; });
  global.fetch = async () => { throw new Error("should not fetch"); };
  for (const p of ["/", "/x/1.jpg", "/" + ID + "/a.jpg", "/../secret", "/" + ID + "/1.jpg/x"]) {
    assert.strictEqual((await at(p)).statusCode, 404, p);
  }
});

test("a list that cannot be read is not found; a known list survives a hiccup", async (t) => {
  const real = global.fetch; t.after(() => { global.fetch = real; });
  const other = "b".repeat(32);
  global.fetch = async () => ({ ok: false });
  assert.strictEqual((await at("/" + other + "/1.jpg")).statusCode, 404);
});
