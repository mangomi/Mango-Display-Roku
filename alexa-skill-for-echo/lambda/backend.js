// The two servers an Echo Show talks to, ported from the TV clients:
//
// Pairing (components/PairingTask.brs, tvos Backend.swift):
//   GET mirrors/deviceId/{code}; an unknown device self-registers via POST
//   mirrors/saveMirror; when the user claims the code in the webapp,
//   isActive flips true and the record carries major/minor.
//   The TVs loop this every 5s inside one process. A skill has no
//   process between requests, so each call here is ONE iteration and the
//   APL pairing screen's tick (apl.js) drives the 5s cadence.
//
// Render service (components/VersionTask.brs, DisplayController.swift):
//   /version and /wait with the device identity. The Echo cannot hold a
//   long-poll open (every request is a Lambda invocation that must answer
//   within seconds), so it asks with a `since` it knows differs, which the
//   service answers immediately with the manifest inline.

const env = require("./env");

// Standard browser-ish headers, as the Roku and tvOS send - the backend was
// built for browser clients (Tizen) and relies on them implicitly.
const HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (Linux; Echo Show) AppleWebKit/537.36 (KHTML, like Gecko) MangoDisplayEcho/0.1",
};

// Alexa expects an answer within 8s; leave room for the rest of the request
const TIMEOUT_MS = 6000;

async function request(url, postJson) {
  try {
    const r = await fetch(url, {
      method: postJson ? "POST" : "GET",
      headers: postJson ? { ...HEADERS, "Content-Type": "application/json" } : HEADERS,
      body: postJson ? JSON.stringify(postJson) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    return { status: r.status, json, headers: r.headers };
  } catch (e) {
    console.log("[Mango] request failed:", url, e.message);
    return null;
  }
}

function truthy(v) {
  if (v === true) return true;
  if (typeof v === "string") return v.toLowerCase() === "true";
  if (typeof v === "number") return v !== 0;
  return false;
}

/** One pairing iteration. Returns
 *  { state: "linked", major, minor } | { state: "waiting" } | { state: "error" } */
async function pairingStep(code, screenW, screenH) {
  const resp = await request(env.apiBase + "mirrors/deviceId/" + code);
  if (!resp || !resp.json) return { state: "error" };
  const obj = resp.json.object;
  if (obj && truthy(obj.isActive)) {
    console.log("[Mango] linked! code=" + code + " major=" + obj.major + " minor=" + obj.minor);
    return { state: "linked", major: String(obj.major), minor: String(obj.minor) };
  }
  if (obj) return { state: "waiting" };
  if (resp.json.error) {
    // the backend reports unknown devices with an error payload ("Mirror
    // not registered"). Same payload as Roku/Tizen/tvOS so the backend
    // treats every painted TV identically; device-class behavior keys on
    // the code PREFIX, not on deviceType.
    console.log("[Mango] " + code + " not registered, calling saveMirror");
    const save = await request(env.apiBase + "mirrors/saveMirror", {
      deviceId: code,
      delay: 60,
      deviceMode: "portrait",
      deviceType: "Android tablet",
      isBeaconEnabled: false,
      deviceWidth: screenW,
      deviceHeight: screenH,
    });
    if (save && save.status >= 200 && save.status < 300) {
      console.log("[Mango] saveMirror ok");
      return { state: "waiting" };
    }
    console.log("[Mango] saveMirror failed, will retry");
  }
  return { state: "error" };
}

function identity(d) {
  return "&device=" + d.code + "&major=" + d.major + "&minor=" + d.minor + "&w=" + d.w + "&h=" + d.h;
}

/** Fetch the display's current manifest. `held` is the version this Echo
 * is showing (or null on launch). Returns
 *  { state: "ready", version, assetBase, manifest } |
 *  { state: "loading" }  (service booting the display, nothing published yet) |
 *  { state: "unpaired" } (display removed in the webapp) |
 *  { state: "error" } */
async function fetchDisplay(d, held, launch) {
  // -1 never matches a real version, so the service answers at once
  const since = held == null ? -1 : held;
  const url = env.controlBase + "/wait?since=" + since + "&busy=0&mem=normal" + (launch ? "&launch=1" : "") + identity(d);
  const r = await request(url);
  if (!r) return { state: "error" };
  if (r.status === 503) return { state: "loading" }; // fleet's Retry-After: display starting
  if (r.status === 404) return { state: "unpaired" };
  if (r.status !== 200 || !r.json) return { state: "error" };
  const { version, assetBase } = r.json;
  let manifest = r.json.manifest;
  if (!manifest && assetBase) {
    // older services, or nothing inline yet: display.json from R2
    const m = await request(assetBase + "display.json?t=" + version);
    if (m && m.status === 200) manifest = m.json;
  }
  if (!manifest) return { state: "loading" };
  if (manifest.paired === false) return { state: "unpaired" };
  return { state: "ready", version, assetBase, manifest, busy: r.json.busy === true };
}

/** Forward a touch: tap (with the task's payload id) or swipeup /
 * swipedown on a calendar region - the Roku's InteractTask call, same
 * parameters. A swipe's reply waits for the portal's redraw (up to 15s
 * service-side); the Lambda gives up first and the screen's fast checks
 * still pick the result up. */
async function interact(d, g) {
  return request(env.controlBase + "/interact?type=" + encodeURIComponent(g.type) +
    "&page=" + encodeURIComponent(g.page || "0") + "&x=" + encodeURIComponent(g.x) + "&y=" + encodeURIComponent(g.y) +
    "&id=" + encodeURIComponent(g.id || "") + identity(d));
}

/** Cheap check for "anything new?" - /version answers immediately with
 * { version, busy } (busy: the service is applying an edit). null when
 * the service could not be asked. */
async function currentVersion(d) {
  const r = await request(env.controlBase + "/version?v=1" + identity(d));
  return r && r.status === 200 && r.json ? { version: r.json.version, busy: r.json.busy === true } : null;
}

module.exports = { pairingStep, fetchDisplay, currentVersion, interact };
