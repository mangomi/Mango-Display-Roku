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
 * Deployed by the Jenkins job Roku-Staging-Service: any push to
 * test-release-auto-deploy syntax-checks this service, packages it
 * (server files only - the TV clients in this repo are never included),
 * builds the arm64 image on CodeBuild and rolls the ECS service. See
 * OPS_RUNBOOK.md section 7.
 *
 * A worker is only created for a display the backend recognises
 * (GET mirrors/deviceId/{code} -> isActive): this endpoint is on the open
 * internet, and booting Chromium for every scanner that guesses a
 * parameter would be an expensive way to say 404.
 *
 * One worker owns one display outright - its socket (the backend closes
 * duplicate connections for the same identity, so exactly one owner is a
 * hard rule), its renders, its files, its asset prefix. Across tasks the
 * same rule is kept by the ownership layer (ownership.js): a display is
 * leased to one task, every other task forwards to it, and ECS may run
 * as many tasks as the load needs. With OWNERSHIP=off this is the old
 * single-task mode - never run two of those behind one balancer.
 */
const http = require("http");
const https = require("https");
const path = require("path");
const { DisplayWorker } = require("./displayWorker");
const { PaintedWorker } = require("./paintedWorker");
const { SimWorker } = require("./simWorker");
const { OwnershipManager, backendFromEnv } = require("./ownership");
const { UsageSampler } = require("./usage");

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

const IS_PROD_API = /(^|\.)api\.mangomirror\.com/.test(ENV.apiBase) || /(^|\/\/)socket\./.test(ENV.socketBase);

/* Synthetic displays, TEST ONLY: with SIM_DISPLAYS=1, device ids that
 * start with "SIM" skip the backend check and open the "claude test"
 * display's layout in designer mode, which takes no socket, so hundreds
 * of copies coexist and load the fleet like real displays would. The
 * switch lives in the one shared image, inert unless set; two guards
 * (Dave, 2026-09-07): the service REFUSES TO START if it is set while the
 * API base is production, and the banner names it on every boot. */
const SIM_ENABLED = process.env.SIM_DISPLAYS === "1";
const SIM_ID_RE = /^SIM[A-Za-z0-9_-]{1,29}$/;
const SIM_RECORD = {
  major: parseInt(env("SIM_MAJOR", "1"), 10),
  minor: parseInt(env("SIM_MINOR", "1715"), 10),
  w: 1280,
  h: 720,
  orientation: 0,
  synthetic: true,
};
if (SIM_ENABLED && IS_PROD_API) {
  console.error("SIM_DISPLAYS=1 with a PRODUCTION api base (" + ENV.apiBase + ") - refusing to start");
  process.exit(1);
}
const isSim = (deviceId) => SIM_ENABLED && SIM_ID_RE.test(deviceId);

/* One display, one owner, across however many tasks ECS runs: see
 * ownership.js. Off (the default) keeps the single-task behaviour. */
let ownership = null;
const usage = new UsageSampler(log);

/* A process-wide failure in one display's worker must not take every
 * other display down with it: log it against the display where it can
 * be told, and keep serving. Node would otherwise exit on an unhandled
 * rejection (one display's bug restarting the whole fleet). */
process.on("unhandledRejection", (reason) => {
  const msg = reason && reason.stack ? reason.stack.split("\n").slice(0, 4).join(" | ") : String(reason);
  log("UNHANDLED REJECTION (contained):", msg);
});
process.on("uncaughtException", (err) => {
  log("UNCAUGHT EXCEPTION (contained):", err && err.stack ? err.stack.split("\n").slice(0, 4).join(" | ") : String(err));
});

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
/* Last good backend record per display. No display is pinned by env vars
 * any more, so every worker is built from this call - which makes the API
 * being briefly unreachable able to take a working display down. It must
 * not: an unreachable API is not a verdict, so we answer from the last
 * record we were given and let the next poll try again. */
const lastKnownDisplay = new Map();

async function validateDisplay(deviceId) {
  if (isSim(deviceId)) return { ...SIM_RECORD };
  const r = await httpGetJson(ENV.apiBase + "mirrors/deviceId/" + encodeURIComponent(deviceId));
  if (!r) {
    const cached = lastKnownDisplay.get(deviceId);
    if (cached) {
      log("api unreachable - using last known record for", deviceId);
      return cached;
    }
    return { unreachable: true };
  }
  if (!r.json || !r.json.object) return null;
  const o = r.json.object;
  if (!truthy(o.isActive)) return null;
  const rec = {
    major: parseInt(o.major, 10),
    minor: parseInt(o.minor, 10),
    w: parseInt(o.deviceWidth, 10) || 0,
    h: parseInt(o.deviceHeight, 10) || 0,
    /* 0 landscape, 1 mounted 90° clockwise, 2 counter-clockwise - the
     * portal's own mapping of mirrorOrientation (parentController.js) */
    orientation: parseInt(o.mirrorOrientation, 10) || 0,
  };
  lastKnownDisplay.set(deviceId, rec);
  return rec;
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
  const Worker = cfg.synthetic ? SimWorker : isPainted(cfg.deviceId) ? PaintedWorker : DisplayWorker;
  const worker = new Worker({
    deviceId: cfg.deviceId,
    major: cfg.major,
    minor: cfg.minor,
    outW: cfg.outW,
    outH: cfg.outH,
    orientation: cfg.orientation || 0,
    dir: path.join(DATA_ROOT, cfg.deviceId),
    env: ENV,
    gate,
    prewarmOk: () => workers.size <= PREWARM_MAX_WORKERS,
    legacy: cfg.legacy,
  });
  await worker.start();
  workers.set(cfg.deviceId, worker);
  log("fleet:", workers.size, "worker(s)", cfg.synthetic ? "| " + cfg.deviceId + " is SYNTHETIC (designer portal)" : isPainted(cfg.deviceId) ? "| " + cfg.deviceId + " is PAINTED (live portal)" : "");
  return worker;
}

// Existing worker, or create one for a display the backend vouches for.
// Concurrent requests for the same display (a TV re-arms /wait while its
// /interact is in flight) must land on ONE worker - two would mean two
// sockets fighting over the identity.
async function getOrCreateWorker(id) {
  const existing = workers.get(id.device);
  if (existing && existing.stopped) {
    /* a worker that unpaired itself (display reset) is done; the next
     * poll gets a fresh look at the backend record */
    workers.delete(id.device);
    if (ownership) ownership.release(id.device).catch(() => {});
  } else if (existing) {
    existing.lastSeen = Date.now();
    return existing;
  }
  if (!DEVICE_ID_RE.test(id.device)) return null;
  const until = rejected.get(id.device);
  if (until && Date.now() < until) return null;
  if (creating.has(id.device)) return creating.get(id.device);

  const p = (async () => {
    const known = await validateDisplay(id.device);
    /* unreachable is not "unknown": hold no grudge, the device polls again */
    if (known && known.unreachable) {
      log("api unreachable - deferring", id.device, "to its next poll");
      return null;
    }
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
      orientation: known.orientation || 0,
      legacy: false,
      synthetic: known.synthetic === true,
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
  /* Retired 2026-09-02: every fielded channel sends identity, so a display
   * now reports its own resolution and the backend record breaks ties.
   * Pinning one here forced a fleet-wide DISPLAY_OUT_W/H on it instead -
   * which had the Roku rendering 1280x720 for an fhd graphics plane while
   * the Apple TV, on the identity path, was already native 1920x1080. The
   * block stays as an emergency re-pin; setting the env vars brings it
   * back. */
  log("DISPLAY_DEVICE_ID is set: pinning", deviceId, "at", env("DISPLAY_OUT_W", "1920") + "x" + env("DISPLAY_OUT_H", "1080"),
      "- this overrides what the display reports about itself");
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

function respondJson(res, code, body, extraHeaders) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store", ...(extraHeaders || {}) });
  res.end(JSON.stringify(body));
}

/* "try again in a moment, probably somewhere else": the channel treats a
 * non-200 as a failed wait and re-polls in ~5s, and the balancer may
 * land that poll on another task */
function respondRetry(res, why) {
  respondJson(res, 503, { error: why, retry: true }, { "Retry-After": "5" });
}

const FORWARDED_HEADER = "x-mm-forwarded-by";
const FORWARD_TIMEOUT_MS = 60000; /* a /wait is held up to 50s by the owner */
/* Task-to-task connections are pooled. Node 20's default agent keeps
 * sockets alive too, but with the SERVER's 5s idle close (below) a
 * reused socket died under the request - "socket hang up" on 1 in ~50
 * forwarded long-polls in phase 1. Explicit agent, explicit retry. */
const forwardAgent = new http.Agent({ keepAlive: true, maxSockets: 1024, timeout: FORWARD_TIMEOUT_MS + 5000 });

/* Hand a device's request to the task that owns its display, byte for
 * byte, and relay the reply. The device never learns there was a hop. */
function forwardTo(addr, req, res, attempt = 1) {
  return new Promise((resolve) => {
    const [host, port] = addr.split(":");
    let gotResponse = false;
    const up = http.request(
      {
        host,
        port: parseInt(port, 10) || PORT,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, host: addr, [FORWARDED_HEADER]: me.taskId },
        timeout: FORWARD_TIMEOUT_MS,
        agent: attempt === 1 ? forwardAgent : false,
      },
      (upRes) => {
        gotResponse = true;
        /* hop-by-hop headers stay on their hop */
        const h = { ...upRes.headers };
        delete h.connection;
        delete h["keep-alive"];
        delete h["transfer-encoding"];
        res.writeHead(upRes.statusCode, h);
        upRes.pipe(res);
        upRes.on("end", resolve);
      },
    );
    up.on("timeout", () => up.destroy(new Error("forward timeout")));
    up.on("error", (e) => {
      /* a pooled socket the owner had just closed: nothing was sent to
       * the device yet, so try once more on a fresh connection */
      if (!gotResponse && attempt === 1 && /socket hang up|ECONNRESET|EPIPE/.test(e.message)) {
        return resolve(forwardTo(addr, req, res, 2));
      }
      log("forward to " + addr + " failed for " + req.url.slice(0, 60) + ": " + e.message + (attempt > 1 ? " (retry)" : ""));
      if (!res.headersSent) respondRetry(res, "owner unreachable: " + e.message);
      else res.end();
      resolve();
    });
    /* the device hung up (re-armed, or went away): drop the hop too.
     * On the RESPONSE, not the request: a GET's request stream ends and
     * closes at once, which tore every forward down before the owner
     * could answer (phase 0, 2026-09-07) */
    res.on("close", () => {
      if (!res.writableFinished) up.destroy();
    });
    req.pipe(up);
  });
}

/* Decide who serves this display: us, another task (forward), or nobody
 * yet (claim). Returns { own: true } | { forward: addr } | { retry: why }. */
async function route(id, req) {
  if (!ownership) return { own: true };
  const device = id.device;
  if (ownership.owns(device)) return { own: true };
  const hop = req.headers[FORWARDED_HEADER];
  let row;
  try {
    row = await ownership.lookup(device);
  } catch (e) {
    /* the table is unreachable: keep serving what we own (handled above),
     * take nothing new - the device retries in 5s */
    return { retry: "ownership store unreachable" };
  }
  if (row && row.taskId === me.taskId) {
    /* our row from a previous life of this task id - adopt it */
    ownership.owned.set(device, { claimedAt: row.claimedAt });
    return { own: true };
  }
  if (row) {
    if (hop) return { retry: "stale owner row during hand-over" }; /* never bounce a hop twice */
    return { forward: row.taskAddr };
  }
  if (hop) return { retry: "forwarded to a task that does not own the display" };
  const refusal = usage.refusal();
  if (refusal) {
    log("refusing " + device + " - " + refusal);
    return { retry: "task full (" + refusal + ")" };
  }
  let won;
  try {
    won = await ownership.claim(device);
  } catch (e) {
    return { retry: "ownership store unreachable" };
  }
  if (won) {
    log("claimed " + device + " (" + ownership.count() + " owned)");
    return { own: true };
  }
  const other = await ownership.lookup(device).catch(() => null);
  if (other && other.taskId !== me.taskId) return { forward: other.taskAddr };
  return { retry: "claim lost the race" };
}

/* the wedged-service check the balancer cannot see: displays are polling
 * but nothing has published for a long time, or the ownership store has
 * been failing */
const HEALTH_STALE_MS = parseInt(env("HEALTH_STALE_MS", String(15 * 60 * 1000)), 10);
function healthReport() {
  const now = Date.now();
  let watched = 0;
  let lastPublish = 0;
  let wanting = 0; /* watched displays that asked for a capture and have not published since */
  let unhealthy = 0;
  let portals = 0;
  for (const w of workers.values()) {
    const seen = now - (w.lastSeen || 0) < 120000;
    if (seen) watched++;
    if (w.lastPublishAt > lastPublish) lastPublish = w.lastPublishAt;
    if (seen && w.lastCaptureRequestAt && w.lastCaptureRequestAt > (w.lastPublishAt || 0) && now - w.lastCaptureRequestAt > HEALTH_STALE_MS) wanting++;
    if (w.unhealthy) unhealthy++;
    if (w.portal) portals++;
  }
  const own = ownership ? ownership.health() : null;
  const storeDown = !!(own && own.lastError && own.lastOkAgoMs > 120000);
  const wedged = watched > 0 && wanting === watched;
  return {
    ok: !storeDown && !wedged,
    task: me,
    workers: workers.size,
    watched,
    portals,
    unhealthyWorkers: unhealthy,
    lastPublishAgoMs: lastPublish ? now - lastPublish : null,
    wanting,
    usage: usage.snapshot(),
    ownership: own,
    reasons: [storeDown ? "ownership store failing" : null, wedged ? "watched displays not publishing" : null].filter(Boolean),
  };
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const id = identityFrom(u);

  try {
    if (u.pathname === "/healthz") {
      const h = healthReport();
      return respondJson(res, h.ok ? 200 : 503, h);
    }

    if (id.device && (u.pathname === "/version" || u.pathname === "/wait" || u.pathname === "/interact")) {
      if (!DEVICE_ID_RE.test(id.device)) return respondJson(res, 404, { error: "unknown display" });
      const r = await route(id, req);
      if (r.retry) return respondRetry(res, r.retry);
      if (r.forward) return forwardTo(r.forward, req, res);
      /* who answered, for the simulator's one-owner check (forwarded
       * replies carry the owner's, since headers are relayed) */
      res.setHeader("x-mm-owner", me.taskId);
    }

    if (u.pathname === "/version") {
      if (id.device || legacyWorker) {
        const w = id.device ? await getOrCreateWorker(id) : legacyWorker;
        if (!w) {
          if (ownership && id.device) ownership.release(id.device).catch(() => {});
          return respondJson(res, 404, { error: "unknown display" });
        }
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
        if (ownership) ownership.release(id.device).catch(() => {});
        return respondJson(res, 404, { error: "unknown display" });
      }
      return w.handleWait(u, res, req);
    }

    if (u.pathname === "/interact") {
      const w = id.device ? await getOrCreateWorker(id) : legacyWorker;
      if (!w) {
        if (ownership && id.device) ownership.release(id.device).catch(() => {});
        return respondJson(res, 404, { error: "unknown display" });
      }
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
      if (ownership) ownership.release(idStr).catch(() => {});
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
  log("ownership:", ownership ? (process.env.OWNERSHIP + (process.env.OWNERSHIP_TABLE ? " table " + process.env.OWNERSHIP_TABLE : "")) : "off (single task)", "| task", me.taskId, "at", me.taskAddr);
  if (SIM_ENABLED) log("*** SIM_DISPLAYS=1: synthetic SIM* displays accepted (test only; major " + SIM_RECORD.major + " minor " + SIM_RECORD.minor + ") ***");
  if (PAINTED_LIST.length && process.env.PORTAL_PREVIEW_DIR) {
    log("*** painted portal files come from " + process.env.PORTAL_PREVIEW_DIR + " (pre-merge) ***");
  }
  log("environment:", prod ? "*** PRODUCTION ***" : "test");
}

/* Who we are, for the ownership rows: the ECS task id and the private
 * address other tasks can reach us on. Elsewhere, TASK_ID / TASK_ADDR or
 * a random id on 127.0.0.1 (phase 0: three processes on one laptop). */
const me = { taskId: env("TASK_ID", ""), taskAddr: env("TASK_ADDR", "") };
async function resolveIdentity() {
  const base = process.env.ECS_CONTAINER_METADATA_URI_V4;
  if (base && (!me.taskId || !me.taskAddr)) {
    const task = await new Promise((resolve) => {
      const r = http.get(base + "/task", { timeout: 3000 }, (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(b));
          } catch (e) {
            resolve(null);
          }
        });
      });
      r.on("timeout", () => r.destroy());
      r.on("error", () => resolve(null));
    });
    if (task) {
      if (!me.taskId && task.TaskARN) me.taskId = task.TaskARN.split("/").pop();
      if (!me.taskAddr) {
        const c = (task.Containers || []).find((x) => x.Networks && x.Networks.length);
        const ip = c && c.Networks[0].IPv4Addresses && c.Networks[0].IPv4Addresses[0];
        if (ip) me.taskAddr = ip + ":" + PORT;
      }
    }
  }
  if (!me.taskId) me.taskId = "local-" + Math.random().toString(36).slice(2, 8);
  if (!me.taskAddr) me.taskAddr = "127.0.0.1:" + PORT;
}

/* OwnedDisplays, per task and for the service: dashboards and alarms
 * only - scaling runs on ECS's own memory/CPU (Dave, 2026-09-06) */
const METRICS = process.env.METRICS === "1" || !!process.env.ECS_CONTAINER_METADATA_URI_V4;
const METRIC_NAMESPACE = env("METRIC_NAMESPACE", "MangoDisplay/Roku");
let cloudwatch = null;
async function publishMetrics() {
  if (!METRICS) return;
  try {
    if (!cloudwatch) {
      const { CloudWatchClient, PutMetricDataCommand } = require("@aws-sdk/client-cloudwatch");
      cloudwatch = { client: new CloudWatchClient({}), PutMetricDataCommand };
    }
    const service = env("SERVICE_NAME", "roku-render-" + (IS_PROD_API ? "prod" : "test"));
    const owned = ownership ? ownership.count() : workers.size;
    const snap = usage.snapshot();
    const h = healthReport();
    const dims = (withTask) => [{ Name: "Service", Value: service }, ...(withTask ? [{ Name: "TaskId", Value: me.taskId }] : [])];
    const data = [];
    for (const withTask of [true, false]) {
      data.push({ MetricName: "OwnedDisplays", Dimensions: dims(withTask), Value: owned, Unit: "Count" });
      data.push({ MetricName: "WatchedDisplays", Dimensions: dims(withTask), Value: h.watched, Unit: "Count" });
      data.push({ MetricName: "OpenPortals", Dimensions: dims(withTask), Value: h.portals, Unit: "Count" });
      data.push({ MetricName: "Refusing", Dimensions: dims(withTask), Value: snap.refusing ? 1 : 0, Unit: "Count" });
      data.push({ MetricName: "UnhealthyWorkers", Dimensions: dims(withTask), Value: h.unhealthyWorkers, Unit: "Count" });
    }
    await cloudwatch.client.send(new cloudwatch.PutMetricDataCommand({ Namespace: METRIC_NAMESPACE, MetricData: data }));
  } catch (e) {
    log("metrics: publish failed:", e.message);
  }
}

/* The balancer reuses connections to us and closes idle ones after its
 * own 120s idle timeout. Node's default is to close idle keep-alive
 * sockets after 5s, so the balancer regularly sent a request down a
 * socket we were closing: HTTPCode_ELB_502 at 5-30/min under load
 * (phase 1, 2026-09-07). Outlive the balancer's idle timeout, and keep
 * headersTimeout above keepAliveTimeout as Node requires. */
server.keepAliveTimeout = 125000;
server.headersTimeout = 130000;
server.requestTimeout = 300000;

server.listen(PORT, "0.0.0.0", async () => {
  await resolveIdentity();
  await usage.init().catch((e) => log("usage sampler failed to init:", e.message));
  try {
    const backend = backendFromEnv(log);
    if (backend) {
      ownership = new OwnershipManager(backend, me, {
        log,
        /* another task holds a display we thought was ours: stop serving
         * it here, the owner has the socket now */
        onLost: (deviceId) => {
          const w = workers.get(deviceId);
          if (w) {
            workers.delete(deviceId);
            w.stop("ownership lost").catch(() => {});
          }
        },
      });
      ownership.start();
    }
  } catch (e) {
    log("ownership setup failed:", e.message, "- refusing to start");
    process.exit(1);
  }
  banner();
  log("control endpoint on 0.0.0.0:" + PORT);
  startLegacyWorker().catch((e) => log("legacy worker failed to start:", e.message));
  setInterval(() => publishMetrics(), 60000).unref();
  publishMetrics();
});

// A deploy overlaps old and new tasks for a minute; closing our sockets
// promptly on SIGTERM hands each display identity to the new task instead
// of making the backend referee duplicate connections.
async function shutdown(sig) {
  log(sig + ": stopping", workers.size, "worker(s)");
  const all = [...workers.values()];
  workers.clear();
  /* rows first: the moment they are gone another task can claim these
   * displays, so a deploy or a Spot reclaim hands over in one poll, not
   * one lease */
  if (ownership) {
    ownership.stop();
    await ownership.releaseAll().catch(() => {});
    log("ownership: released every row");
  }
  await Promise.allSettled(all.map((w) => w.stop(sig)));
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
