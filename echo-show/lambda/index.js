// Mango Display for Echo Show - the skill's Lambda handler.
//
// The Echo runs no code of ours; Alexa calls this handler on launch and on
// every APL UserEvent the screens send back (apl.js handleTick). Each call
// does ONE step of what a TV client does in a loop, then answers with the
// next screen, or with nothing to leave the current one up:
//
//   launch   -> code for this Echo (identity.js), one pairing step; a
//               claimed display goes straight to its page
//   "pair"   -> every 5s on the pairing screen: one pairing step
//   "loading"-> every 5s on "Connected": is the first page published yet?
//   "refresh"-> every 60s on the display: did the version move?
//
// What a step needs to remember lives in the session attributes. The
// response never sets shouldEndSession, so the session stays open behind
// the screen without the microphone listening.

const env = require("./env");
const identity = require("./identity");
const backend = require("./backend");
const apl = require("./apl");

function respond(sessionAttributes, { directives = [], speech, end } = {}) {
  const response = { directives };
  if (speech) response.outputSpeech = { type: "PlainText", text: speech };
  if (end !== undefined) response.shouldEndSession = end;
  return { version: "1.0", sessionAttributes, response };
}

function supportsApl(envelope) {
  const ifs = envelope.context && envelope.context.System.device.supportedInterfaces;
  return !!(ifs && ifs["Alexa.Presentation.APL"]);
}

/** Paired: fetch the display and show it, or "Connected" while it boots. */
async function showDisplay(st, vp, launch) {
  const d = await backend.fetchDisplay(st, launch ? null : st.version, launch);
  if (d.state === "ready") {
    st.version = d.version;
    console.log("[Mango] " + st.code + " display v" + d.version + ", " + (d.manifest.pages || []).length + " page(s)");
    return respond(st, { directives: [apl.displayScreen(vp, d)] });
  }
  if (d.state === "unpaired") return backToPairing(st, vp);
  return respond(st, { directives: [apl.pairingScreen(vp, st.code, true)] });
}

/** Removed in the webapp: same code, pairing screen again (manifest `paired:false`). */
function backToPairing(st, vp) {
  console.log("[Mango] " + st.code + " unpaired - back to pairing");
  delete st.major; delete st.minor; delete st.version;
  return respond(st, { directives: [apl.pairingScreen(vp, st.code, false)] });
}

async function pairStep(st, vp, onScreen) {
  const p = await backend.pairingStep(st.code, st.w, st.h);
  if (p.state === "linked") {
    st.major = p.major; st.minor = p.minor;
    return showDisplay(st, vp, true);
  }
  // still waiting: leave the pairing screen up (or put it up on launch)
  return respond(st, onScreen ? {} : { directives: [apl.pairingScreen(vp, st.code, false)] });
}

async function onLaunch(envelope) {
  if (!supportsApl(envelope)) {
    return respond({}, { speech: "Mango Display needs an Echo with a screen, like the Echo Show.", end: true });
  }
  const vp = apl.viewportDp(envelope);
  const code = await identity.getOrCreateCode(envelope.context.System.device.deviceId);
  console.log("[Mango] launch on " + env.name + ": code " + code + ", screen " + vp.pw + "x" + vp.ph);
  const st = { code, w: vp.pw, h: vp.ph };
  return pairStep(st, vp, false);
}

async function onUserEvent(envelope) {
  const st = (envelope.session && envelope.session.attributes) || {};
  const vp = apl.viewportDp(envelope);
  const what = (envelope.request.arguments || [])[0];
  if (!st.code) return onLaunch(envelope); // lost session state: start over
  if (what === "pair") return pairStep(st, vp, true);
  if (!st.major) return pairStep(st, vp, false);
  if (what === "loading") {
    const r = await showDisplay(st, vp, false);
    // still booting: the "Connected" screen is already up, don't redraw it
    return r.response.directives[0] && r.response.directives[0].token === "display" ? r : respond(st);
  }
  if (what === "refresh") {
    const v = await backend.currentVersion(st);
    if (v !== null && v !== st.version) return showDisplay(st, vp, false);
    return respond(st);
  }
  return respond(st);
}

exports.handler = async (envelope) => {
  const req = envelope.request;
  try {
    switch (req.type) {
      case "LaunchRequest":
        return await onLaunch(envelope);
      case "Alexa.Presentation.APL.UserEvent":
        return await onUserEvent(envelope);
      case "IntentRequest": {
        const name = req.intent.name;
        if (name === "AMAZON.StopIntent" || name === "AMAZON.CancelIntent") return respond({}, { end: true });
        if (name === "AMAZON.HelpIntent") {
          return respond((envelope.session && envelope.session.attributes) || {}, {
            speech: "Mango Display shows your display on this screen. Enter the code on the screen at " + env.setupHost + " to connect it.",
          });
        }
        return await onLaunch(envelope);
      }
      case "SessionEndedRequest":
        console.log("[Mango] session ended:", req.reason, req.error ? JSON.stringify(req.error) : "");
        return { version: "1.0", response: {} };
      default:
        return respond({});
    }
  } catch (e) {
    console.log("[Mango] handler failed:", e.stack || e.message);
    return respond({}, { speech: "Sorry, Mango Display had a problem. Please try again.", end: true });
  }
};
