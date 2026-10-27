#!/usr/bin/env node
// Drives the skill handler locally the way an Echo Show 15 would, against
// the TEST backend and render service - no Alexa account needed.
//
//   node tools/try-skill.js [--device ID] [--user ID] [--portrait] [--out DIR] [--ticks N]
//
// The Echo's code is derived from its Alexa device and user ids
// (identity.js); the default fake ids always give the same code, so
// re-runs resume as the same Echo. Pass another --device (a different
// Echo) or --user (the skill re-enabled) for a new, unregistered code -
// its first launch registers it on the test backend, exactly what a real
// Echo does. Each screen's APL document is written to --out,
// ready to paste into the APL authoring tool in the Alexa developer console.

const fs = require("fs");
const path = require("path");
const { handler } = require("../lambda/index");

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const outDir = opt("--out") || ".";
const ticks = parseInt(opt("--ticks") || "0", 10);
const portrait = args.includes("--portrait");
const DEVICE = opt("--device") || "amzn1.ask.device.LOCALTEST";
const USER = opt("--user") || "amzn1.ask.account.LOCALTEST";

const viewport = portrait
  ? { pixelWidth: 1080, pixelHeight: 1920, currentPixelWidth: 1080, currentPixelHeight: 1920, dpi: 160 }
  : { pixelWidth: 1920, pixelHeight: 1080, currentPixelWidth: 1920, currentPixelHeight: 1080, dpi: 160 };

function envelope(request, attributes) {
  return {
    version: "1.0",
    session: { new: !attributes, attributes: attributes || {} },
    context: {
      System: { user: { userId: USER }, device: { deviceId: DEVICE, supportedInterfaces: { "Alexa.Presentation.APL": { runtime: { maxVersion: "2023.2" } } } } },
      Viewport: viewport,
    },
    request: { requestId: "local", timestamp: new Date().toISOString(), ...request },
  };
}

function report(step, res) {
  const d = (res.response.directives || [])[0];
  if (!d) return console.log(step + ": (no new screen)");
  const file = path.join(outDir, "apl-" + d.token + ".json");
  fs.writeFileSync(file, JSON.stringify(d.document, null, 2));
  const texts = [];
  JSON.stringify(d.document, (k, v) => { if (k === "text") texts.push(v); return v; });
  console.log(step + ": screen '" + d.token + "' -> " + file);
  for (const t of texts) console.log("    " + t.slice(0, 140));
}

(async () => {
  let res = await handler(envelope({ type: "LaunchRequest" }));
  report("launch", res);
  for (let i = 0; i < ticks; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const arg = res.sessionAttributes.major ? (res.sessionAttributes.version == null ? "loading" : "refresh") : "pair";
    res = await handler(envelope({ type: "Alexa.Presentation.APL.UserEvent", arguments: [arg] }, res.sessionAttributes));
    report("tick " + (i + 1) + " (" + arg + ")", res);
  }
  console.log("session:", JSON.stringify(res.sessionAttributes));
})();
