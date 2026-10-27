// The display's permanent identity: "ET" + 9 digits. The Roku keeps a
// random code in roRegistry and tvOS in the Keychain; an Alexa skill has
// no storage on the device, so instead of storing a code we DERIVE it
// from two ids Alexa sends with every request (Dave, 2026-10-27):
//
//   context.System.device.deviceId - this Echo, for this skill
//   context.System.user.userId     - this Amazon account's enablement of
//                                    the skill; Amazon issues a NEW one
//                                    when the skill is disabled and
//                                    enabled again
//
// So the code is the same on every launch, and DISABLING AND RE-ENABLING
// THE SKILL REROLLS IT - the reroll a reinstalled Roku gets by losing its
// registry, and the way out if a code is ever shared with another display.
// Anything else that changes either id (the Echo deregistered and set up
// again, the skill recreated under a new skill id) also gives a new code.

const crypto = require("crypto");

const PREFIX = "ET";
const DIGITS = 9;

/** "ET" + 9 digits 1-9 from a hash of the two ids - the Roku/Tizen/tvOS
 * digit range, so codes never contain a zero. 9^9 (387M) codes; the hash
 * spreads ids evenly across them. */
function codeFor(alexaDeviceId, alexaUserId) {
  const h = crypto.createHash("sha256").update(alexaDeviceId + "\n" + (alexaUserId || "")).digest("hex");
  let n = BigInt("0x" + h);
  let digits = "";
  for (let i = 0; i < DIGITS; i++) {
    digits += String(Number(n % 9n) + 1);
    n /= 9n;
  }
  return PREFIX + digits;
}

module.exports = { PREFIX, codeFor };
