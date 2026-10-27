// The display's permanent identity: "ET" + 9 digits, the same for an Echo
// forever. The Roku keeps a random code in roRegistry and tvOS in the
// Keychain; an Alexa skill has no storage on the device, so instead of
// storing a code we DERIVE it from the Alexa device id
// (context.System.device.deviceId), which Alexa sends with every request
// and keeps stable for this skill on this Echo. Same Echo -> same code,
// no table to keep (Dave, 2026-10-27).
//
// What changes the code: anything that changes the Alexa device id - the
// Echo deregistered and set up again, or the skill recreated under a new
// skill id. Either way the Echo shows a new code to claim, just as a
// reinstalled Roku would without its registry.

const crypto = require("crypto");

const PREFIX = "ET";
const DIGITS = 9;

/** "ET" + 9 digits 1-9 from a hash of the Alexa device id - the
 * Roku/Tizen/tvOS digit range, so codes never contain a zero. 9^9 (387M)
 * codes; the hash spreads device ids evenly across them. */
function codeFor(alexaDeviceId) {
  let n = BigInt("0x" + crypto.createHash("sha256").update(alexaDeviceId).digest("hex"));
  let digits = "";
  for (let i = 0; i < DIGITS; i++) {
    digits += String(Number(n % 9n) + 1);
    n /= 9n;
  }
  return PREFIX + digits;
}

module.exports = { PREFIX, codeFor };
