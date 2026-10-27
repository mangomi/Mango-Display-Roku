// Mango Display for Echo Show - the skill's Lambda handler.
//
// The Echo runs no code of ours; Alexa calls this handler on launch and on
// every APL UserEvent the screens send back (apl.js heartbeat). Each call
// does ONE step of what a TV client does in a loop, then answers with the
// next screen, or with nothing to leave the current one up:
//
//   launch                     -> this Echo's code (identity.js), one
//                                 pairing step; a claimed display goes
//                                 straight to its page
//   ["pair"]                   -> every 5s on the pairing screen
//   ["loading", "", maj, min]  -> every 5s on "Connected": first page yet?
//   ["refresh", ver, maj, min, overrides, busyShown]
//                              -> every 10s on the display (1.5s after a
//                                 touch): version moved? busy changed?
//   ["touch", kind, page, x, y, id, maj, min]
//                              -> a checkbox press or calendar swipe
//                                 (touch.js): forward to /interact
//   ["rotate", ...one of the above] -> the Echo Show 15 was turned: redraw
//
// The handler keeps no state between calls. Alexa closes the session ~30s
// after a response while the screen stays up, so each event carries what
// is needed to answer it, and the code is re-derived from the request.
// The response never sets shouldEndSession, so the microphone stays shut.

const env = require("./env");
const identity = require("./identity");
const backend = require("./backend");
const apl = require("./apl");

function respond({ directives = [], speech, end } = {}) {
  const response = { directives };
  if (speech) response.outputSpeech = { type: "PlainText", text: speech };
  if (end !== undefined) response.shouldEndSession = end;
  return { version: "1.0", response };
}

function supportsApl(envelope) {
  const ifs = envelope.context && envelope.context.System.device.supportedInterfaces;
  return !!(ifs && ifs["Alexa.Presentation.APL"]);
}

/** This request's Echo: code, registration size, viewport. */
function echoOf(envelope) {
  const sys = envelope.context.System;
  const vp = apl.viewportDp(envelope);
  return { code: identity.codeFor(sys.device.deviceId, sys.user && sys.user.userId), w: vp.pw, h: vp.ph, vp };
}

/** Paired: show the display if it moved past `held` (null = always), or
 * "Connected" while the fleet boots it. `quiet`: answer with nothing
 * instead of redrawing a screen that is already up. */
async function showDisplay(e, held, launch, quiet, overrides) {
  const d = await backend.fetchDisplay(e, held, launch);
  if (d.state === "ready") {
    if (quiet && held !== null && String(d.version) === String(held)) return respond();
    console.log("[Mango] " + e.code + " display v" + d.version + ", " + (d.manifest.pages || []).length + " page(s)" +
      (overrides ? " holding presses " + overrides : ""));
    return respond({ directives: [apl.displayScreen(e.vp, d, e, overrides, d.busy)] });
  }
  if (d.state === "unpaired") {
    // removed in the webapp: same code, pairing screen again
    console.log("[Mango] " + e.code + " unpaired - back to pairing");
    return respond({ directives: [apl.pairingScreen(e.vp, e.code, false)] });
  }
  if (quiet) return respond(); // still booting (or a hiccup): leave the screen up
  return respond({ directives: [apl.pairingScreen(e.vp, e.code, true, e)] });
}

/** One pairing iteration. `onScreen`: the pairing screen is already up. */
async function pairStep(e, onScreen) {
  const p = await backend.pairingStep(e.code, e.w, e.h);
  if (p.state === "linked") {
    e.major = p.major; e.minor = p.minor;
    return showDisplay(e, null, true, false);
  }
  return respond(onScreen ? {} : { directives: [apl.pairingScreen(e.vp, e.code, false)] });
}

async function onLaunch(envelope) {
  if (!supportsApl(envelope)) {
    return respond({ speech: "Mango Display needs an Echo with a screen, like the Echo Show.", end: true });
  }
  const e = echoOf(envelope);
  console.log("[Mango] launch on " + env.name + ": code " + e.code + ", screen " + e.w + "x" + e.h);
  return pairStep(e, false);
}

async function onUserEvent(envelope) {
  const e = echoOf(envelope);
  let args = (envelope.request.arguments || []).map((a) => (a == null ? "" : String(a)));
  const rotate = args[0] === "rotate";
  if (rotate) args = args.slice(1);
  if (args[0] === "touch") return onTouch(e, args);
  const [what, ver, major, minor, overrides, busyShown] = args;
  // the stay-awake test's evidence: does the heartbeat still arrive, in
  // which session, and how long after launch (CloudWatch)
  console.log("[Mango] event " + (rotate ? "rotate/" : "") + what + " " + e.code +
    " session=" + (envelope.session ? String(envelope.session.sessionId).slice(-8) + (envelope.session.new ? " (new)" : "") : "none") +
    " screen=" + e.w + "x" + e.h);
  if (major) { e.major = major; e.minor = minor; }

  if (what === "pair" || !e.major) return pairStep(e, !rotate);
  if (what === "loading") return showDisplay(e, null, false, !rotate);
  if (what === "refresh") {
    if (rotate) return showDisplay(e, null, false, false, overrides);
    const v = await backend.currentVersion(e);
    if (v === null) return respond();
    if (String(v.version) !== ver) return showDisplay(e, ver, false, true, overrides);
    // same pictures, but the service started/finished applying an edit:
    // flip the spinner without a redraw (the Roku's onBusyChange)
    if ((v.busy ? "1" : "0") !== busyShown && busyShown !== undefined) {
      console.log("[Mango] " + e.code + " busy -> " + v.busy);
      return respond({ directives: [apl.busyCommands(v.busy)] });
    }
    return respond();
  }
  return respond();
}

/** A press or swipe: the screen already drew its own feedback, so only
 * the portal needs telling. The result arrives as a new version, which
 * the screen's fast checks pick up. */
async function onTouch(e, args) {
  const [, kind, page, x, y, id, major, minor] = args;
  e.major = major; e.minor = minor;
  const r = await backend.interact(e, { type: kind, page, x, y, id });
  console.log("[Mango] touch " + kind + " " + e.code + " page " + page + " at " + x + "," + y +
    (id ? " id " + id : "") + " -> " + (r ? r.status + " " + JSON.stringify(r.json || {}).slice(0, 120) : "no reply"));
  return respond();
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
        if (name === "AMAZON.StopIntent" || name === "AMAZON.CancelIntent") return respond({ end: true });
        if (name === "AMAZON.HelpIntent") {
          return respond({ speech: "Mango Display shows your display on this screen. Enter the code on the screen at " + env.setupHost + " to connect it." });
        }
        return await onLaunch(envelope);
      }
      case "SessionEndedRequest":
        console.log("[Mango] session ended:", req.reason, req.error ? JSON.stringify(req.error) : "");
        return { version: "1.0", response: {} };
      default:
        return respond();
    }
  } catch (err) {
    console.log("[Mango] handler failed:", err.stack || err.message);
    return respond({ speech: "Sorry, Mango Display had a problem. Please try again.", end: true });
  }
};
