/*
 * The fleet manager: many displays, one service.
 *
 * Every control-channel request carries the display's identity
 * (device/major/minor/w/h - the device knows all of it after pairing), so
 * ANY request can bring a display's worker into existence. That is the
 * whole recovery story: this container keeps no registry, and after a
 * restart the TVs' own long-polls - which arrive within a minute, they
 * never stop - resurrect exactly the displays that are actually out
 * there. R2 outlives the container and prefixes are derived, not stored,
 * so a resurrected display serves its previous content immediately and
 * re-renders moments later.
 *
 * A worker is only created for a display the backend recognises
 * (GET mirrors/deviceId/{code} -> isActive): this endpoint is on the open
 * internet, and booting Chromium for every scanner that guesses a
 * parameter would be an expensive way to say 404.
 *
 * One worker owns one display outright - its socket (the backend closes
 * duplicate connections for the same identity, so exactly one owner is a
 * hard rule), its renders, its files, its R2 prefix. NOTE: this makes the
 * service single-task by design; running two of these containers behind
 * one balancer means two sockets per display and endless churn. Scaling
 * past one task needs a partitioner in front, not a bigger desired-count.
 */
const http = require("http");
const https = require("https");
const path = require("path");
const { DisplayWorker } = require("./displayWorker");
const { PaintedWorker } = require("./paintedWorker");

const env = (name, fallback) => process.env[name] || fallback;

// The defaults are the TEST backend deliberately: running this with no
// configuration must never reach production.
const ENV = {
  socketBase: env("MANGO_SOCKET_BASE", "wss://testsocket.mangomirror.com/connection/"),
  portalBase: env("MANGO_PORTAL_BASE", "https://testportal.mangodisplay.com/"),
  apiBase: env("MANGO_API_BASE", "https://testapi.mangomirror.com/v1.0.5/"),
};

const PORT = parseInt(env("VERSION_PORT", "8091"), 10);
const DATA_ROOT = env("DATA_DIR", path.join(__dirname, "displays"));

// How many displays may render at once. The task is 1 vCPU / 2GB and a
// render is a whole Chromium, so the safe answer starts at 1; renders
// queue behind each other and the TVs' spinners cover the wait.
const RENDER_CONCURRENCY = parseInt(env("RENDER_CONCURRENCY", "1"), 10);

// A worker whose TV has stopped polling is torn down: its socket closes
// and its scheduled renders stop, so a powered-off display costs nothing.
// The TV's first poll on return resurrects it, fresh render included.
const IDLE_EVICT_MS = parseInt(env("IDLE_EVICT_MS", String(30 * 60 * 1000)), 10);
const EVICT_SWEEP_MS = 5 * 60 * 1000;

// Warm pages are the memory cost that scales with fleet size, so they are
// a small-fleet luxury: past this many workers, pushes fall back to cold
// renders, which are slower and always correct.
const PREWARM_MAX_WORKERS = parseInt(env("PREWARM_MAX_WORKERS", "2"), 10);

// deviceId becomes a path component and an R2 key segment - the pattern
// is the actual security boundary, not a formality
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{4,32}$/;

function log(...args) {
  console.log(new Date().toISOString(), "[fleet]", ...args);
}

// ---- shared render gate --------------------------------------------------

class RenderGate {
  constructor(slots) {
    this.slots = slots;
    this.active = 0;
    this.queue = [];
  }

  idle() {
    return this.active === 0 && this.queue.length === 0;
  }

  // Non-blocking claim for best-effort background work (the settings
  // probe): either a slot is free RIGHT NOW and you get its release, or
  // you get null and skip - background work must never queue ahead of a
  // render someone is waiting on.
  tryAcquire() {
    if (this.active >= this.slots) return null;
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    };
  }

  acquire() {
    return new Promise((resolve) => {
      const grant = () => {
        this.active++;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.active--;
          const next = this.queue.shift();
          if (next) next();
        });
      };
      if (this.active < this.slots) grant();
      else this.queue.push(grant);
    });
  }
}

const gate = new RenderGate(RENDER_CONCURRENCY);

// ---- registry ------------------------------------------------------------

const workers = new Map(); // deviceId -> DisplayWorker
const creating = new Map(); // deviceId -> Promise<DisplayWorker|null>
const rejected = new Map(); // deviceId -> retry-after timestamp (negative cache)
const REJECT_HOLD_MS = 60000;

function httpGetJson(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith("https:") ? https : http;
    const req = mod.get(url, { timeout: 10000 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, json: null });
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => resolve(null));
  });
}

const truthy = (v) => v === true || v === 1 || v === "true" || v === "1";

// The backend is the authority on which displays exist. The same
// unauthenticated GET the device itself pairs with; isActive means a
// person claimed this code in the webapp.
async function validateDisplay(deviceId) {
  const r = await httpGetJson(ENV.apiBase + "mirrors/deviceId/" + encodeURIComponent(deviceId));
  if (!r || !r.json || !r.json.object) return null;
  const o = r.json.object;
  if (!truthy(o.isActive)) return null;
  return {
    major: parseInt(o.major, 10),
    minor: parseInt(o.minor, 10),
    w: parseInt(o.deviceWidth, 10) || 0,
    h: parseInt(o.deviceHeight, 10) || 0,
  };
}

function identityFrom(u) {
  const device = u.searchParams.get("device") || "";
  return {
    device,
    major: parseInt(u.searchParams.get("major") || "0", 10),
    minor: parseInt(u.searchParams.get("minor") || "0", 10),
    w: parseInt(u.searchParams.get("w") || "0", 10),
    h: parseInt(u.searchParams.get("h") || "0", 10),
  };
}

/* Which architecture serves a display.
 *
 * PAINTED_DISPLAYS is a comma-separated list of entries that run the
 * live portal: the portal owns the socket, reports what changed, and we
 * only capture. An entry is a full device id (RK569557324), a device
 * PREFIX that matches every id starting with it (RK, ATV - Dave
 * 2026-08-26: this is the permanent shape, one entry per platform), or
 * the literal "all". Anything unmatched keeps the original pipeline,
 * so rollout and rollback stay an environment-variable edit rather
 * than a deploy. */
const PAINTED_LIST = (process.env.PAINTED_DISPLAYS || "").split(",").map((s) => s.trim()).filter(Boolean);
function isPainted(deviceId) {
  return PAINTED_LIST.some((entry) => entry === "all" || deviceId === entry || deviceId.startsWith(entry));
}

async function startWorker(cfg) {
  const Worker = isPainted(cfg.deviceId) ? PaintedWorker : DisplayWorker;
  const worker = new Worker({
    deviceId: cfg.deviceId,
    major: cfg.major,
    minor: cfg.minor,
    outW: cfg.outW,
    outH: cfg.outH,
    dir: path.join(DATA_ROOT, cfg.deviceId),
    env: ENV,
    gate,
    prewarmOk: () => workers.size <= PREWARM_MAX_WORKERS,
    legacy: cfg.legacy,
  });
  await worker.start();
  workers.set(cfg.deviceId, worker);
  log("fleet:", workers.size, "worker(s)", isPainted(cfg.deviceId) ? "| " + cfg.deviceId + " is PAINTED (live portal)" : "");
  return worker;
}

// Existing worker, or create one for a display the backend vouches for.
// Concurrent requests for the same display (a TV re-arms /wait while its
// /interact is in flight) must land on ONE worker - two would mean two
// sockets fighting over the identity.
async function getOrCreateWorker(id) {
  const existing = workers.get(id.device);
  if (existing) {
    existing.lastSeen = Date.now();
    return existing;
  }
  if (!DEVICE_ID_RE.test(id.device)) return null;
  const until = rejected.get(id.device);
  if (until && Date.now() < until) return null;
  if (creating.has(id.device)) return creating.get(id.device);

  const p = (async () => {
    const known = await validateDisplay(id.device);
    if (!known || !(known.major > 0) || !(known.minor > 0)) {
      log("refused unknown display:", id.device);
      rejected.set(id.device, Date.now() + REJECT_HOLD_MS);
      return null;
    }
    // The device's own report of its resolution wins - it is live truth,
    // while old mirror records carry 0x0. The backend record breaks ties
    // for requests that did not carry a size.
    return startWorker({
      deviceId: id.device,
      major: known.major,
      minor: known.minor,
      outW: id.w > 0 ? id.w : known.w > 0 ? known.w : 1920,
      outH: id.h > 0 ? id.h : known.h > 0 ? known.h : 1080,
      legacy: false,
    });
  })();
  creating.set(id.device, p);
  try {
    return await p;
  } finally {
    creating.delete(id.device);
  }
}

// The single-display era: DISPLAY_* environment variables name one
// trusted display served since boot, and requests with no identity - the
// currently-installed channel, and the balancer's health check - route to
// it. Drop the env vars once every fielded channel sends identity.
let legacyWorker = null;
async function startLegacyWorker() {
  const deviceId = env("DISPLAY_DEVICE_ID", "");
  if (!deviceId) {
    log("no DISPLAY_DEVICE_ID: fleet starts empty, workers come from device requests");
    return;
  }
  legacyWorker = await startWorker({
    deviceId,
    major: parseInt(env("DISPLAY_MAJOR", "1"), 10),
    minor: parseInt(env("DISPLAY_MINOR", "0"), 10),
    outW: parseInt(env("DISPLAY_OUT_W", "1920"), 10),
    outH: parseInt(env("DISPLAY_OUT_H", "1080"), 10),
    legacy: true,
  });
}

// ---- HTTP ----------------------------------------------------------------

function respondJson(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const id = identityFrom(u);

  try {
    if (u.pathname === "/version") {
      if (id.device || legacyWorker) {
        const w = id.device ? await getOrCreateWorker(id) : legacyWorker;
        if (!w) return respondJson(res, 404, { error: "unknown display" });
        w.lastSeen = Date.now();
        return w.respondVersion(res);
      }
      // no identity and no legacy display: this is the balancer's health
      // check (or an empty fleet) - healthy, nothing to serve yet
      return respondJson(res, 200, { version: 0, displays: workers.size });
    }

    if (u.pathname === "/wait") {
      const w = id.device ? await getOrCreateWorker(id) : legacyWorker;
      if (!w) {
        if (!id.device) return respondJson(res, 200, { version: 0 });
        return respondJson(res, 404, { error: "unknown display" });
      }
      return w.handleWait(u, res, req);
    }

    if (u.pathname === "/interact") {
      const w = id.device ? await getOrCreateWorker(id) : legacyWorker;
      if (!w) return respondJson(res, 404, { error: "unknown display" });
      return void w.handleInteract(u, res);
    }
  } catch (e) {
    log("request failed:", u.pathname, e.message);
    return respondJson(res, 500, { error: e.message });
  }

  res.writeHead(404);
  res.end();
});

// ---- eviction ------------------------------------------------------------

setInterval(() => {
  for (const [idStr, w] of workers) {
    if (w.evictable() && w.idleFor() > IDLE_EVICT_MS) {
      workers.delete(idStr);
      w.stop("no device contact for " + Math.round(w.idleFor() / 60000) + " min").catch(() => {});
      log("fleet:", workers.size, "worker(s)");
    }
  }
}, EVICT_SWEEP_MS);

// ---- boot ----------------------------------------------------------------

// Say out loud what this process is pointed at. A container that silently
// reaches production when it meant to reach test is the expensive kind of
// mistake.
function banner() {
  const prod = /(^|\.)api\.mangomirror\.com/.test(ENV.apiBase) || /(^|\/\/)socket\./.test(ENV.socketBase);
  log("api", ENV.apiBase);
  log("portal", ENV.portalBase);
  log("socket", ENV.socketBase);
  log("data root", DATA_ROOT);
  log("render concurrency", RENDER_CONCURRENCY, "| idle eviction", Math.round(IDLE_EVICT_MS / 60000) + "min");
  log("painted displays:", PAINTED_LIST.length ? PAINTED_LIST.join(",") : "(none - all on the original pipeline)");
  if (PAINTED_LIST.length && process.env.PORTAL_PREVIEW_DIR) {
    log("*** painted portal files come from " + process.env.PORTAL_PREVIEW_DIR + " (pre-merge) ***");
  }
  log("environment:", prod ? "*** PRODUCTION ***" : "test");
}

server.listen(PORT, "0.0.0.0", () => {
  banner();
  log("control endpoint on 0.0.0.0:" + PORT);
  startLegacyWorker().catch((e) => log("legacy worker failed to start:", e.message));
});

// A deploy overlaps old and new tasks for a minute; closing our sockets
// promptly on SIGTERM hands each display identity to the new task instead
// of making the backend referee duplicate connections.
async function shutdown(sig) {
  log(sig + ": stopping", workers.size, "worker(s)");
  const all = [...workers.values()];
  workers.clear();
  await Promise.allSettled(all.map((w) => w.stop(sig)));
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
