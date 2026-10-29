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
//   ["refresh", ver, maj, min, overrides, busyShown, layout, pageUrls, page, photoLoads, slideshows, screen code]
//                              -> every 10s on the display (1.5s after a
//                                 touch): version moved? busy changed?
//                                 new screen code (apl-package.js)?
//   ["touch", kind, page, x, y, id, maj, min, ver, overrides, layout, pageUrls, current, slideshows]
//                              -> a checkbox press or calendar swipe
//                                 (touch.js): forward to /interact and
//                                 answer with the result screen
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
const aplPackage = require("./apl-package");

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
async function showDisplay(e, held, launch, quiet, overrides, shown) {
  const d = await backend.fetchDisplay(e, held, launch);
  if (d.state === "ready") {
    if (quiet && held !== null && String(d.version) === String(held)) return respond();
    return respond({ directives: [screenFor(e, d, overrides, shown)] });
  }
  if (d.state === "unpaired") {
    // removed in the webapp: same code, pairing screen again
    console.log("[Mango] " + e.code + " unpaired - back to pairing");
    return respond({ directives: [apl.pairingScreen(e.vp, e.code, false)] });
  }
  if (quiet) return respond(); // still booting (or a hiccup): leave the screen up
  return respond({ directives: [apl.pairingScreen(e.vp, e.code, true, e)] });
}

/** A ready display as an in-place update of the screen that is up (same
 * layout: no blink) or else as a whole new screen. */
function screenFor(e, d, overrides, shown) {
  const update = apl.inPlaceUpdate(e.vp, d, e, overrides, d.busy, shown);
  console.log("[Mango] " + e.code + " display v" + d.version + ", " + (d.manifest.pages || []).length + " page(s)" +
    (update ? " in place" : " new screen") + (d.manifest.showPage != null ? ", edit on page " + d.manifest.showPage : "") +
    (overrides ? ", holding presses " + overrides : ""));
  if (update) return update;
  // a whole new screen starts on the page the old one was showing; one
  // over Alexa's size cap is sent lighter rather than refused (apl.js)
  const fit = apl.fittedScreen(e.vp, d, e, overrides, d.busy, shown && shown.page, shown && shown.ss);
  if (fit.level > 0) {
    const kb = (n) => Math.round(n / 1024) + " KB";
    console.log("[Mango] " + e.code + " SCREEN TOO BIG v" + d.version + ": " + kb(fit.fullBytes) + " full, sent " +
      kb(fit.bytes) + " as '" + apl.LITE_NAMES[fit.level] + "' (cap " + kb(apl.MAX_SCREEN_BYTES) + ")" +
      (fit.bytes > apl.MAX_SCREEN_BYTES ? " - STILL OVER, the Echo may refuse it" : ""));
  }
  return fit.directive;
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
  const aplIf = envelope.context.System.device.supportedInterfaces["Alexa.Presentation.APL"] || {};
  console.log("[Mango] launch on " + env.name + ": code " + e.code + ", screen " + e.w + "x" + e.h +
    ", APL up to " + ((aplIf.runtime && aplIf.runtime.maxVersion) || "?"));
  return pairStep(e, false);
}

async function onUserEvent(envelope) {
  const e = echoOf(envelope);
  let args = (envelope.request.arguments || []).map((a) => (a == null ? "" : String(a)));
  const rotate = args[0] === "rotate";
  if (rotate) args = args.slice(1);
  if (args[0] === "touch") return onTouch(e, args);
  const [what, ver, major, minor, overrides, busyShown, layout, pageUrls, page] = args;
  const shown = { layout, url: pageUrls, page, ss: args[10] };
  // the stay-awake test's evidence: does the heartbeat still arrive, in
  // which session, and how long after launch (CloudWatch)
  console.log("[Mango] event " + (rotate ? "rotate/" : "") + what + " " + e.code +
    " session=" + (envelope.session ? String(envelope.session.sessionId).slice(-8) + (envelope.session.new ? " (new)" : "") : "none") +
    " screen=" + e.w + "x" + e.h + (what === "refresh" && args[9] !== undefined ? " photoLoads=" + args[9] : "") +
    (what === "refresh" ? " apl=" + (((envelope.context.System.device.supportedInterfaces["Alexa.Presentation.APL"] || {}).runtime || {}).maxVersion || "?") : ""));
  if (major) { e.major = major; e.minor = minor; }

  if (what === "pair" || !e.major) return pairStep(e, !rotate);
  if (what === "loading") return showDisplay(e, null, false, !rotate);
  if (what === "refresh") {
    if (rotate) return showDisplay(e, null, false, false, overrides, { page, ss: args[10] });
    const v = await backend.currentVersion(e);
    if (v === null) return respond();
    if (v.unpaired) {
      // reset in the webapp: same code, pairing screen again (MainScene
      // onVersionChange paired = false)
      console.log("[Mango] " + e.code + " display was reset - back to pairing");
      return respond({ directives: [apl.pairingScreen(e.vp, e.code, false)] });
    }
    if (String(v.version) !== ver) return showDisplay(e, ver, false, true, overrides, shown);
    // the screen runs older screen code than this deploy (or predates the
    // report): a whole new screen, so the Echo loads the new package
    if (args[11] !== aplPackage.screenCode()) {
      console.log("[Mango] " + e.code + " screen code " + (args[11] || "none") + " -> " + aplPackage.screenCode());
      // no `held`: the version is the same, and the screen must still go;
      // no layout: never in place, which would leave the old code running
      // and this firing at every heartbeat
      return showDisplay(e, null, false, true, overrides, { ...shown, layout: "" });
    }
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

// How long one touch reply may wait for its result. Alexa allows ~8s per
// reply and the Lambda's own limit is 8s; the rest is margin.
const TOUCH_BUDGET_MS = 6500;

/** A press or swipe. The screen already reacted (tick / spinner); tell the
 * portal, then wait - like the Roku's held /wait - for the render that
 * shows the result, and answer with it in this same reply, so it appears
 * the moment it is published. A slower render is still caught by the
 * screen's 1.5s fast checks. */
async function onTouch(e, args) {
  const started = Date.now();
  const deadline = started + TOUCH_BUDGET_MS;
  const [, kind, page, x, y, id, major, minor, ver, overrides, layout, pageUrls, current, ss] = args;
  e.major = major; e.minor = minor;
  // wait from the version on screen; the gesture runs alongside
  const result = ver ? backend.waitForNewVersion(e, ver, deadline) : Promise.resolve(null);
  const r = await backend.interact(e, { type: kind, page, x, y, id }, deadline - Date.now());
  console.log("[Mango] touch " + kind + " " + e.code + " page " + page + " at " + x + "," + y +
    (id ? " id " + id : "") + " -> " + (r ? r.status + " " + JSON.stringify(r.json || {}).slice(0, 120) : "no reply yet") +
    " (" + (Date.now() - started) + "ms)");
  const d = await result;
  if (!d) {
    console.log("[Mango] touch " + kind + ": no new render within " + TOUCH_BUDGET_MS + "ms - the screen's fast checks take over");
    return respond();
  }
  console.log("[Mango] touch " + kind + ": result v" + d.version + " in " + (Date.now() - started) + "ms");
  return respond({ directives: [screenFor(e, d, overrides, { layout, url: pageUrls, page: current, ss })] });
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
