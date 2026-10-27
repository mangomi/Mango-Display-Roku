// The Roku's busy spinner (MainScene.xml spinnerPoster, startSpinner):
// images/spinner.png at 80 canvas px, turning clockwise once per 1.1s,
// shown in the same three places (Dave, 2026-10-27: "anywhere the Roku
// uses loaders, the same thing"):
//
//   - the "Connected / Loading your display..." screen, below the text at
//     78% of the screen height (MainScene.onPaired)
//   - while the render service reports busy (an edit being applied, a
//     launch recapture), centred on the screen, with the Roku's 75s
//     watchdog (onBusyChange, onSpinnerWatchdog)
//   - on a calendar swipe, centred on the calendar (InteractionLayer busyAt)
//
// The PNG travels inside the APL document as a data URL (3.7 KB), so no
// new hosting: the deploy zip carries a copy of images/spinner.png
// (tools/deploy.sh); local runs read the repo's own file.

const fs = require("fs");
const path = require("path");

const SIZE_PX = 80;        // canvas px, as on the Roku
const TURN_MS = 1100;      // one clockwise turn
const WATCHDOG_MS = 75000; // never leave it up if a busy=false is missed

let dataUrl = null;
function source() {
  if (dataUrl !== null) return dataUrl;
  dataUrl = "";
  for (const p of [path.join(__dirname, "spinner.png"), path.join(__dirname, "..", "..", "images", "spinner.png")]) {
    try {
      dataUrl = "data:image/png;base64," + fs.readFileSync(p).toString("base64");
      break;
    } catch (e) {}
  }
  if (!dataUrl) console.log("[Mango] spinner.png missing - spinners will be blank");
  return dataUrl;
}

/** A spinning Image centred at (cx, cy) dp. `opacity` may be a number or
 * a binding expression - the spinner keeps turning, shown or not, so
 * showing it is one SetValue. */
function spinner(cx, cy, sizeDp, opacity, id) {
  const c = {
    type: "Image",
    position: "absolute",
    left: cx - sizeDp / 2, top: cy - sizeDp / 2, width: sizeDp, height: sizeDp,
    source: source(), scale: "fill",
    opacity,
    onMount: [{
      type: "AnimateItem", duration: TURN_MS, repeatCount: 1000000, easing: "linear",
      value: [{ property: "transform", from: [{ rotate: 0 }], to: [{ rotate: 360 }] }],
    }],
  };
  if (id) c.id = id;
  return c;
}

module.exports = { spinner, SIZE_PX, WATCHDOG_MS };
