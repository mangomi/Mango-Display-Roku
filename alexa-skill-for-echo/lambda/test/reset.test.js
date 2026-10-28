const test = require("node:test");
const assert = require("node:assert");
const { handler } = require("../index");

// a heartbeat from Dave's paired Echo
const envelope = (args) => ({
  version: "1.0",
  session: { sessionId: "s-1", new: false, application: { applicationId: "x" } },
  context: {
    System: {
      device: { deviceId: "dev-1", supportedInterfaces: { "Alexa.Presentation.APL": { runtime: { maxVersion: "2026.2" } } } },
      user: { userId: "user-1" }, application: { applicationId: "x" },
    },
    Viewport: { pixelWidth: 1080, pixelHeight: 1920, dpi: 160 },
  },
  request: { type: "Alexa.Presentation.APL.UserEvent", requestId: "r", arguments: args },
});

test("reset in the webapp: the next heartbeat puts the pairing screen back", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  // after a reset the service no longer knows the display
  global.fetch = async (url) => ({ status: /\/version\?/.test(url) ? 404 : 500, text: async () => '{"error":"unknown display"}' });
  const res = await handler(envelope(["refresh", "284", "1", "822", "", "0", "abc", "", "0", "0"]));
  const d = res.response.directives && res.response.directives[0];
  assert.ok(d, "a new screen");
  assert.strictEqual(d.token, "pairing");
  assert.ok(JSON.stringify(d.document).includes("Display Device Code"));
});

test("a service hiccup is not a reset: the screen stays", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  global.fetch = async () => ({ status: 502, text: async () => "" });
  const res = await handler(envelope(["refresh", "284", "1", "822", "", "0", "abc", "", "0", "0"]));
  assert.ok(!res.response.directives || res.response.directives.length === 0);
});
