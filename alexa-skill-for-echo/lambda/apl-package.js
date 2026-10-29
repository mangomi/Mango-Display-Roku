// The screen's fixed code as an APL package: the Roku's "installed app".
//
// Alexa refuses a screen over ~120 KB, and a skill has nothing installed
// on the Echo, so every screen used to carry its own code. The parts that
// are the same for every display live here instead, in a JSON file on
// our asset host (s3://mango-echo-assets behind rokuassets.mangodisplay.com,
// <root>/echo/apl/). Each screen imports it by name and version; the Echo
// downloads it once and keeps it, and it does not count toward the cap.
//
// The version is a hash of the contents, so a code change is a new file
// at a new address (never an overwrite): the deploy uploads it before the
// Lambda (tools/deploy.sh), the next whole screen names it, and screens
// still showing the last one keep working off the old file.
//
// Only what does not depend on the display goes in; anything that does
// stays on the screen or reads the screen's own binds.
//
// APL_PACKAGE=off on the Lambda puts everything back on the screen.

const crypto = require("crypto");
const env = require("./env");
const pages = require("./pages");
const effectAll = require("./effect-all");

const APL_VERSION = "2023.2";
const NAME = "mango";

function contents() {
  return {
    type: "APL",
    version: APL_VERSION,
    layouts: effectAll.layouts(),
    commands: pages.commandDefinitions("viewport.width", "viewport.height"),
  };
}

let cached;
function built() {
  if (!cached) {
    const json = JSON.stringify(contents());
    cached = { json, version: crypto.createHash("sha256").update(json).digest("hex").slice(0, 12) };
  }
  return cached;
}

const enabled = () => process.env.APL_PACKAGE !== "off";
const version = () => built().version;
const fileName = () => NAME + "-" + version() + ".json";
const url = () => env.aplPackageBase + fileName();

/** The screen's import entry. */
const importEntry = () => ({ name: NAME, version: version(), source: url() });

module.exports = { contents, enabled, version, fileName, url, importEntry, json: () => built().json, APL_VERSION, NAME };
