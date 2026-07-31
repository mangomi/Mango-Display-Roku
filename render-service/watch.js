/*
 * Phase 3 prototype: re-render on display changes.
 *
 * Subscribes to the display's socket channel exactly like a real TV does
 * (the backend pushes refreshLayout/refreshWidget/... on every write that
 * affects the display), debounces the burst, and re-runs render.js.
 *
 *   node watch.js
 */
const { execFile } = require("child_process");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

// ---- display config (prototype: hardcoded to the "Roku Express" display)
const ENV = {
  socketBase: "wss://testsocket.mangomirror.com/connection/",
  portalBase: "https://testportal.mangodisplay.com/",
};
const DISPLAY = {
  major: 1,
  minor: 2336,
  deviceId: "RK127621134",
  page: 0,
  canvasW: 1920, // layout coordinate space - portal has no responsive reflow
  canvasH: 1080,
  outW: 1280, // device's native resolution (from roDeviceInfo / mirror record)
  outH: 720,
};
const OUT_FILE = path.join(__dirname, "display.jpg");
const DEBOUNCE_MS = 2500;
const KEEPALIVE_MS = 60000;
const RECONNECT_MS = 10000;

// server messages that are not content changes
const IGNORE_TYPES = new Set(["socket_connection_success", "check_socket_status", "Exception", "error"]);

let renderTimer = null;
let rendering = false;
let pendingRender = false;

// ---- render version + long-poll waiters --------------------------------
// The Roku long-polls GET /wait?since=N and is answered the moment a newer
// render exists, so pickup is ~instant instead of a blind polling interval.
const VERSION_PORT = 8091;
const WAIT_HOLD_MS = 50000; // client uses a 55s wait; always answer first
// epoch-seeded so versions stay monotonic across watcher restarts - a
// client holding last-seen version N must always see new renders as > N
let version = Math.floor(Date.now() / 1000);
let waiters = [];

function respondVersion(res) {
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ version }));
}

function flushWaiters() {
  const flushed = waiters.splice(0);
  for (const w of flushed) {
    clearTimeout(w.timer);
    respondVersion(w.res);
  }
  if (flushed.length) log("notified", flushed.length, "long-poll waiter(s)");
}

http
  .createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    if (u.pathname === "/version") return respondVersion(res);
    if (u.pathname === "/wait") {
      const since = parseInt(u.searchParams.get("since") || "0", 10);
      if (version > since) return respondVersion(res);
      const w = {
        res,
        timer: setTimeout(() => {
          waiters = waiters.filter((x) => x !== w);
          respondVersion(res); // timeout: answer with current so client re-arms
        }, WAIT_HOLD_MS),
      };
      waiters.push(w);
      req.on("close", () => {
        clearTimeout(w.timer);
        waiters = waiters.filter((x) => x !== w);
      });
      return;
    }
    res.writeHead(404);
    res.end();
  })
  .listen(VERSION_PORT, "0.0.0.0", () => log("version server on 0.0.0.0:" + VERSION_PORT));

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function designerUrl() {
  return (
    ENV.portalBase +
    "?major=" + DISPLAY.major +
    "&minor=" + DISPLAY.minor +
    "&macaddress=" + DISPLAY.deviceId +
    "&designer=true&page=" + DISPLAY.page +
    "&r=" + Date.now()
  );
}

function doRender(reason) {
  if (rendering) {
    pendingRender = true;
    return;
  }
  rendering = true;
  log("rendering (" + reason + ")...");
  execFile(
    process.execPath,
    [
      path.join(__dirname, "render.js"),
      designerUrl(),
      OUT_FILE,
      String(DISPLAY.canvasW),
      String(DISPLAY.canvasH),
      String(DISPLAY.outW),
      String(DISPLAY.outH),
    ],
    { timeout: 60000 },
    (err, stdout, stderr) => {
      rendering = false;
      if (err) log("render FAILED:", err.message, stderr.slice(0, 300));
      else {
        log("render done:", stdout.trim().split("\n").pop());
        version = Math.max(version + 1, Math.floor(Date.now() / 1000));
        log("version ->", version);
        flushWaiters();
      }
      if (pendingRender) {
        pendingRender = false;
        doRender("queued change");
      }
    },
  );
}

function scheduleRender(reason) {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderTimer = null;
    doRender(reason);
  }, DEBOUNCE_MS);
}

// ---- scheduled renders (see NATIVE_WIDGETS.md freshness model) ---------
// data widgets (weather, calendar, ...) only refresh when a render happens,
// so re-render on a cadence + at local midnight for the date rollover
const SCHEDULE_MS = 20 * 60 * 1000;
setInterval(() => scheduleRender("scheduled"), SCHEDULE_MS);

function armMidnightRender() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  setTimeout(() => {
    scheduleRender("midnight");
    armMidnightRender();
  }, next.getTime() - now.getTime());
}
armMidnightRender();

function connect() {
  const url = ENV.socketBase + DISPLAY.major + "/" + DISPLAY.minor + "/" + DISPLAY.deviceId;
  log("connecting", url);
  const ws = new WebSocket(url);
  let keepalive = null;

  ws.on("open", () => {
    log("socket open");
    // always render once on (re)connect: covers service restarts (stale
    // clock/date on disk) and any pushes missed while offline
    scheduleRender("startup");
    keepalive = setInterval(() => {
      try {
        ws.send(JSON.stringify({ type: "check_socket_status" }));
      } catch (e) {}
    }, KEEPALIVE_MS);
  });

  ws.on("message", (buf) => {
    let type = "unknown";
    try {
      type = JSON.parse(buf.toString()).type || "unknown";
    } catch (e) {}
    if (IGNORE_TYPES.has(type)) {
      log("(ignored:", type + ")");
      return;
    }
    log("change push:", type);
    scheduleRender(type);
  });

  ws.on("close", (code) => {
    log("socket closed (" + code + "), reconnecting in", RECONNECT_MS / 1000, "s");
    if (keepalive) clearInterval(keepalive);
    setTimeout(connect, RECONNECT_MS);
  });

  ws.on("error", (e) => {
    log("socket error:", e.message);
    ws.close();
  });
}

connect();
