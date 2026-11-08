// What Alexa's certification checks of a skill's spoken side.
const test = require("node:test");
const assert = require("node:assert");
const { handler } = require("../index");
const env = require("../env");

const req = (request, applicationId = env.skillId) => ({
  version: "1.0",
  session: { sessionId: "s-1", new: true, application: { applicationId } },
  context: { System: {
    device: { deviceId: "d-1", supportedInterfaces: { "Alexa.Presentation.APL": { runtime: { maxVersion: "2026.2" } } } },
    user: { userId: "u-1" }, application: { applicationId }, viewport: { pixelWidth: 1080, pixelHeight: 1920, dpi: 160 },
  } },
  request,
});
const intent = (name) => req({ type: "IntentRequest", intent: { name } });

test("a request for another skill is refused", async () => {
  await assert.rejects(handler(req({ type: "LaunchRequest" }, "amzn1.ask.skill.other")));
});

const backendSays = (t, body) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  global.fetch = async () => ({ status: 200, text: async () => body });
};
const host = (h) => h.replace(/\./g, " dot ");

test("help on a connected Echo explains, points to the help site, asks a question and keeps listening", async (t) => {
  backendSays(t, '{"object":{"isActive":true,"major":2,"minor":1}}');
  const { response: r } = await handler(intent("AMAZON.HelpIntent"));
  assert.strictEqual(r.outputSpeech.text,
    "Mango Display keeps your calendar, lists and photos on this screen until you say stop. " +
    "To change what's on it, sign in at " + host(env.setupHost) + ". " +
    "For more help, visit help dot mangodisplay dot com. What would you like to do?");
  assert.strictEqual(r.reprompt.outputSpeech.text, "What would you like to do?");
  assert.strictEqual(r.shouldEndSession, false);
  assert.deepStrictEqual(r.directives, []); // the screen stays as it is
});

test("help while the code shows gives the setup steps", async (t) => {
  backendSays(t, '{"error":"Mirror not registered"}');
  const { response: r } = await handler(intent("AMAZON.HelpIntent"));
  assert.strictEqual(r.outputSpeech.text,
    "To connect this screen, sign in at " + host(env.setupHost) +
    " on your phone, tablet, or computer, choose Add New Display, and enter the code you see here. " +
    "For more help, visit help dot mangodisplay dot com. What would you like to do?");
  assert.strictEqual(r.shouldEndSession, false);
});

test("fallback says what the skill can do, points to the help site and keeps listening", async () => {
  const { response: r } = await handler(intent("AMAZON.FallbackIntent"));
  assert.strictEqual(r.outputSpeech.text,
    "Sorry, Mango Display can't help with that. You can say show my display, or stop to close it. " +
    "For more help, visit help dot mangodisplay dot com. What would you like to do?");
  assert.strictEqual(r.reprompt.outputSpeech.text, "You can say show my display, or stop to close it. What would you like to do?");
  assert.strictEqual(r.shouldEndSession, false);
});

test("stop, cancel, home and no all end the session", async () => {
  for (const name of ["AMAZON.StopIntent", "AMAZON.CancelIntent", "AMAZON.NavigateHomeIntent", "AMAZON.NoIntent"]) {
    assert.strictEqual((await handler(intent(name))).response.shouldEndSession, true, name);
  }
});

test("launching on an unclaimed Echo says what the code is for; the 5s check stays silent", async (t) => {
  const real = global.fetch;
  t.after(() => { global.fetch = real; });
  global.fetch = async () => ({ status: 200, text: async () => '{"error":"Mirror not registered"}' });
  const launch = await handler(req({ type: "LaunchRequest" }));
  assert.strictEqual(launch.response.outputSpeech.text,
    "Welcome to Mango Display. To connect this screen, sign in at " + host(env.setupHost) +
    " on your phone, tablet, or computer, choose Add New Display, and enter the code you see here.");
  assert.strictEqual(launch.response.directives[0].token, "pairing");
  const tick = await handler(req({ type: "Alexa.Presentation.APL.UserEvent", arguments: ["pair"] }));
  assert.strictEqual(tick.response.outputSpeech, undefined);
});

test("each environment has its own skill; production and test each accept only their own", () => {
  const load = (mango) => {
    const file = require.resolve("../env");
    const saved = process.env.MANGO_ENV, cached = require.cache[file];
    delete require.cache[file];
    if (mango) process.env.MANGO_ENV = mango; else delete process.env.MANGO_ENV;
    const e = require("../env");
    if (saved === undefined) delete process.env.MANGO_ENV; else process.env.MANGO_ENV = saved;
    delete require.cache[file];
    if (cached) require.cache[file] = cached;
    return e;
  };
  const prod = load("production"), testEnv = load();
  assert.strictEqual(prod.skillId, "amzn1.ask.skill.117359b3-7ca0-4ca7-929f-c748c96fe8b9");
  assert.strictEqual(testEnv.skillId, "amzn1.ask.skill.9d53ff8a-88ee-48c1-bb87-3c8b9427918f");
  assert.ok(!prod.skillId.includes("ccb7fdb4"));
});
