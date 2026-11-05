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

test("help explains, asks a question and keeps the session open", async () => {
  const { response: r } = await handler(intent("AMAZON.HelpIntent"));
  assert.match(r.outputSpeech.text, /until you say stop/);
  assert.match(r.outputSpeech.text, /\?$/);
  assert.match(r.reprompt.outputSpeech.text, /\?$/);
  assert.strictEqual(r.shouldEndSession, false);
});

test("fallback says what the skill can do and keeps the session open", async () => {
  const { response: r } = await handler(intent("AMAZON.FallbackIntent"));
  assert.match(r.outputSpeech.text, /show my display/);
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
  assert.match(launch.response.outputSpeech.text, /enter the code/);
  assert.strictEqual(launch.response.directives[0].token, "pairing");
  const tick = await handler(req({ type: "Alexa.Presentation.APL.UserEvent", arguments: ["pair"] }));
  assert.strictEqual(tick.response.outputSpeech, undefined);
});
