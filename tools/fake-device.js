/*
 * A pretend Roku for fleet testing: does exactly what PairingTask.brs does
 * so a real, claimable display exists without a second physical device.
 *
 *   node tools/fake-device.js            # new code, register, poll
 *   node tools/fake-device.js RK...      # resume an existing code
 *
 * Registers the code via saveMirror (same payload as the channel, quoted
 * keys and all), then polls mirrors/deviceId/{code} until someone claims
 * it in the webapp. Prints the identity query string a channel would send
 * once active. TEST BACKEND ONLY.
 */
const https = require("https");

const API = process.env.MANGO_API_BASE || "https://testapi.mangomirror.com/v1.0.5/";
if (!/testapi\./.test(API)) {
  console.error("refusing: " + API + " is not the test backend");
  process.exit(1);
}

const W = 1280;
const H = 720;

const code =
  process.argv[2] ||
  "RK" + Array.from({ length: 9 }, () => 1 + Math.floor(Math.random() * 9)).join("");

function request(method, url, body) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          Accept: "application/json, text/plain, */*",
          // REQUIRED by the backend: without Accept-Language, saveMirror
          // throws server-side and answers {"error":{}} HTTP 500 with no
          // message, for every payload shape. That cost two days of
          // chasing a "broken endpoint" that was only ever a missing
          // header - the channel itself always sent it (PairingTask.brs),
          // which is why real devices paired fine the whole time.
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "MangoDisplayRoku/0.1 (fake-device)",
          ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
        },
        timeout: 15000,
      },
      (res) => {
        let out = "";
        res.on("data", (c) => (out += c));
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(out);
          } catch (e) {}
          resolve({ status: res.statusCode, json, raw: out });
        });
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", (e) => resolve({ status: 0, json: null, raw: e.message }));
    if (data) req.write(data);
    req.end();
  });
}

const truthy = (v) => v === true || v === 1 || v === "true" || v === "1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log("api:", API);
  console.log("code:", code);
  let registered = false;
  for (;;) {
    const r = await request("GET", API + "mirrors/deviceId/" + code);
    const obj = r.json && r.json.object;
    if (obj && truthy(obj.isActive)) {
      console.log("claimed! major=" + obj.major + " minor=" + obj.minor);
      console.log("identity: &device=" + code + "&major=" + obj.major + "&minor=" + obj.minor + "&w=" + W + "&h=" + H);
      return;
    }
    if (obj) {
      console.log("registered, waiting for claim (deviceId in record: " + JSON.stringify(obj.deviceId) + ")");
    } else if (r.json && r.json.error && !registered) {
      console.log("not registered (" + (r.json.error.message || "?") + "), calling saveMirror");
      const save = await request("POST", API + "mirrors/saveMirror", {
        deviceId: code,
        delay: 60,
        deviceMode: "portrait",
        deviceType: "Android tablet",
        isBeaconEnabled: false,
        deviceWidth: W,
        deviceHeight: H,
      });
      console.log("saveMirror -> HTTP " + save.status + " " + save.raw.slice(0, 160));
      if (save.status >= 200 && save.status < 300) {
        registered = true;
        // Paranoia from a real bug: a mangled POST once inserted a BLANK
        // record and still said 200. Confirm the record actually carries
        // our code before anyone claims it.
        const check = await request("GET", API + "mirrors/deviceId/" + code);
        const co = check.json && check.json.object;
        if (co) console.log("verified record deviceId:", JSON.stringify(co.deviceId));
      }
    } else if (r.status === 0) {
      console.log("request failed:", r.raw);
    }
    await sleep(5000);
  }
})();
