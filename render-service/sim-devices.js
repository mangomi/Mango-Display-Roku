/*
 * The device simulator: N pretend TVs polling the control endpoint the
 * way the channel does, so the ownership layer and auto-scaling can be
 * exercised without N real displays. Pairs with SIM_DISPLAYS=1 on the
 * service (fleet.js), which accepts SIM* ids without a backend record.
 *
 *   node tools/sim-devices.js --base https://roku-control-test.mangodisplay.com --count 300
 *   node tools/sim-devices.js --base http://127.0.0.1:8091,http://127.0.0.1:8092 --count 30 --ramp 60
 *
 * Options
 *   --base     one URL, or several comma-separated (each device picks one
 *              at random per poll, like a balancer would)
 *   --count    how many devices (default 10)
 *   --start    first device number (default 1) -> SIM000001 ...
 *   --ramp     devices started per minute (default: all at once)
 *   --down     after this many minutes, ramp down to --floor devices
 *   --floor    devices to keep after ramping down (default 0)
 *   --minutes  stop after this many minutes (default: run until killed)
 *   --report   seconds between summary lines (default 60)
 *
 * Every poll records the owner (x-mm-owner header) so the summary can
 * say whether any device ever saw two owners inside one lease, how many
 * hand-overs happened, the longest gap between successful polls per
 * device, and every 503 by reason. TEST ONLY: refuses a production host.
 */
const http = require("http");
const https = require("https");

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) {
    const k = a.slice(2);
    const v = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : "1";
    args[k] = v;
  }
}
const BASES = (args.base || "http://127.0.0.1:8091").split(",").map((s) => s.trim().replace(/\/+$/, ""));
if (BASES.some((b) => /roku-control\.mangodisplay\.com/.test(b) || /(^|\.)api\.mangomirror\.com/.test(b))) {
  console.error("refusing: a base looks like production");
  process.exit(1);
}
const COUNT = parseInt(args.count || "10", 10);
const START = parseInt(args.start || "1", 10);
const RAMP_PER_MIN = parseFloat(args.ramp || "0");
const DOWN_AFTER_MIN = parseFloat(args.down || "0");
const FLOOR = parseInt(args.floor || "0", 10);
const MINUTES = parseFloat(args.minutes || "0");
const REPORT_S = parseInt(args.report || "60", 10);
const POLL_WAIT_MS = 55000; /* the channel's own timeout */
const MAJOR = parseInt(args.major || "1", 10);
const MINOR = parseInt(args.minor || "1715", 10);

const idOf = (n) => "SIM" + String(n).padStart(6, "0");

function get(url, timeoutMs) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https:") ? https : http;
    const t0 = Date.now();
    const req = mod.get(url, { timeout: timeoutMs, headers: { "User-Agent": "MangoDisplayRoku/sim" } }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body, ms: Date.now() - t0 }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => resolve({ status: 0, headers: {}, body: e.message, ms: Date.now() - t0 }));
  });
}

const devices = new Map(); // id -> state
const totals = { polls: 0, ok: 0, retry: 0, errors: 0, handovers: 0, doubleOwner: 0, versions: 0 };
const retryReasons = new Map();
const t0 = Date.now();

async function runDevice(id) {
  const d = { id, version: 0, owner: null, ownerSince: 0, owners: new Set(), lastOk: Date.now(), maxGap: 0, launch: true, stopped: false, seenOwners: [] };
  devices.set(id, d);
  while (!d.stopped) {
    const base = BASES[Math.floor(Math.random() * BASES.length)];
    const url =
      base + "/wait?since=" + d.version + "&busy=0&mem=normal" + (d.launch ? "&launch=1" : "") +
      "&device=" + id + "&major=" + MAJOR + "&minor=" + MINOR + "&w=1280&h=720";
    const r = await get(url, POLL_WAIT_MS + 5000);
    totals.polls++;
    if (r.status === 200) {
      totals.ok++;
      d.launch = false;
      const gap = Date.now() - d.lastOk;
      if (gap > d.maxGap) d.maxGap = gap;
      d.lastOk = Date.now();
      const owner = r.headers["x-mm-owner"] || "?";
      if (d.owner && owner !== d.owner) {
        totals.handovers++;
        /* two owners inside one lease window is the one thing that must
         * never happen: flag it if the previous owner answered less than
         * a lease ago AND the old owner answers again after the new one */
        d.seenOwners.push({ owner, at: Date.now() });
        const recent = d.seenOwners.filter((x) => Date.now() - x.at < 90000).map((x) => x.owner);
        if (new Set(recent).size > 1 && recent[recent.length - 1] !== owner) totals.doubleOwner++;
      } else if (!d.owner) {
        d.seenOwners.push({ owner, at: Date.now() });
      }
      d.owner = owner;
      d.owners.add(owner);
      try {
        const j = JSON.parse(r.body);
        if (typeof j.version === "number" && j.version !== d.version) {
          d.version = j.version;
          totals.versions++;
        }
      } catch (e) {}
      await sleep(250);
    } else if (r.status === 503) {
      totals.retry++;
      let why = "?";
      try {
        why = JSON.parse(r.body).error || "?";
      } catch (e) {}
      why = why.replace(/\d+%/g, "N%").replace(/\d+s/g, "Ns");
      retryReasons.set(why, (retryReasons.get(why) || 0) + 1);
      await sleep(5000);
    } else if (r.status === 0 && /ECONNREFUSED/.test(r.body) && BASES.length > 1) {
      /* a dead base: a balancer would stop sending there after its
       * health checks, so pick another at once and do not count it */
      totals.skipped = (totals.skipped || 0) + 1;
      await sleep(100);
    } else {
      totals.errors++;
      const why = "HTTP " + r.status + " " + String(r.body).slice(0, 60);
      retryReasons.set(why, (retryReasons.get(why) || 0) + 1);
      if (args.verbose) console.log(new Date().toISOString(), "  " + id + " " + why + " after " + r.ms + "ms via " + base + " (owner was " + (d.owner || "?") + ")");
      await sleep(5000);
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function report(final) {
  const now = Date.now();
  const ownerCounts = new Map();
  let maxGap = 0;
  let stale = 0;
  for (const d of devices.values()) {
    if (d.stopped) continue;
    ownerCounts.set(d.owner || "?", (ownerCounts.get(d.owner || "?") || 0) + 1);
    if (d.maxGap > maxGap) maxGap = d.maxGap;
    if (now - d.lastOk > 150000) stale++;
  }
  const live = [...devices.values()].filter((d) => !d.stopped).length;
  const owners = [...ownerCounts.entries()].sort((a, b) => b[1] - a[1]).map(([o, n]) => o.slice(0, 8) + "=" + n).join(" ");
  console.log(
    new Date().toISOString(),
    (final ? "FINAL" : "sim") + " t+" + Math.round((now - t0) / 60000) + "m",
    "devices=" + live,
    "polls=" + totals.polls,
    "ok=" + totals.ok,
    "503=" + totals.retry,
    "err=" + totals.errors,
    "versions=" + totals.versions,
    "handovers=" + totals.handovers,
    "DOUBLE_OWNER=" + totals.doubleOwner,
    "stale(>150s)=" + stale,
    "maxGap=" + Math.round(maxGap / 1000) + "s",
    "| owners:", owners || "(none yet)",
  );
  if (retryReasons.size) {
    console.log("   retries:", [...retryReasons.entries()].map(([k, v]) => v + "x " + k).join(" ; "));
  }
}

(async () => {
  console.log("sim-devices:", COUNT, "device(s) from", idOf(START), "against", BASES.join(", "), RAMP_PER_MIN ? "ramping " + RAMP_PER_MIN + "/min" : "all at once");
  let started = 0;
  const startOne = () => {
    if (started >= COUNT) return false;
    runDevice(idOf(START + started));
    started++;
    return true;
  };
  if (RAMP_PER_MIN > 0) {
    const gap = 60000 / RAMP_PER_MIN;
    const ramp = setInterval(() => {
      if (!startOne()) clearInterval(ramp);
    }, gap);
    startOne();
  } else {
    for (let i = 0; i < COUNT; i++) {
      startOne();
      await sleep(50); /* not literally the same millisecond */
    }
  }
  const rep = setInterval(() => report(false), REPORT_S * 1000);
  if (DOWN_AFTER_MIN > 0) {
    setTimeout(() => {
      console.log("ramping down to", FLOOR, "device(s)");
      const rate = RAMP_PER_MIN > 0 ? 60000 / RAMP_PER_MIN : 200;
      const ids = [...devices.keys()].reverse();
      let i = 0;
      const down = setInterval(() => {
        const live = [...devices.values()].filter((d) => !d.stopped).length;
        if (live <= FLOOR || i >= ids.length) return clearInterval(down);
        devices.get(ids[i++]).stopped = true;
      }, rate);
    }, DOWN_AFTER_MIN * 60000);
  }
  if (MINUTES > 0) {
    setTimeout(() => {
      clearInterval(rep);
      report(true);
      process.exit(totals.doubleOwner ? 2 : 0);
    }, MINUTES * 60000);
  }
  process.on("SIGINT", () => {
    report(true);
    process.exit(totals.doubleOwner ? 2 : 0);
  });
})();
