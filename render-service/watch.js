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
const fs = require("fs");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");
const { InteractionSession } = require("./session");
const { RenderPool } = require("./renderPool");

// ---- display config (prototype: hardcoded to the "Roku Express" display)
const ENV = {
  socketBase: "wss://testsocket.mangomirror.com/connection/",
  portalBase: "https://testportal.mangodisplay.com/",
  apiBase: "https://testapi.mangomirror.com/v1.0.5/",
};
const DISPLAY = {
  major: 1,
  minor: 2336,
  deviceId: "RK569557324",
  page: 0,
  canvasW: 1920, // layout coordinate space - portal has no responsive reflow
  canvasH: 1080,
  outW: 1280, // device's native resolution (from roDeviceInfo / mirror record)
  outH: 720,
};
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
// A SMALL counter, persisted. It must stay small: BrightScript's ParseJson
// hands large numbers back as single-precision floats, which hold about 7
// significant digits, so a 10-digit epoch second like 1786311809 arrives on
// the device as 1786311808. The device could then never hold the real
// value - consecutive versions rounded to the SAME float, it saw no change,
// and it sat polling every 250ms forever while its screen only refreshed on
// its 60s fallback. That was the whole "swipes do not change the dates" bug.
const VERSION_FILE = path.join(__dirname, ".version");
let version = 1;
try {
  const prev = parseInt(fs.readFileSync(VERSION_FILE, "utf8").trim(), 10);
  // anything from the old epoch-based scheme is discarded, not resumed
  if (prev > 0 && prev < 1000000) version = prev + 1;
} catch (e) {}
let waiters = [];


// `busy` is true while a USER EDIT is rendering, so the TV can show a
// spinner during the wait (background refreshes stay silent)
let busy = false;
let busySince = 0;
// keep the TV's spinner up long enough to be perceived, even if the
// render finishes almost immediately
const MIN_BUSY_MS = 3000;

function setBusy(next, why) {
  if (busy === next) return;
  busy = next;
  if (next) busySince = Date.now();
  log("busy ->", next, "(" + why + ")");
  flushWaiters();
}

// belt and braces: busy must never outlive an actual render. Anything
// that leaves it set (a throw on an unexpected path, a killed child)
// gets cleaned up here rather than spinning on the TV forever.
// An interaction counts as work in progress too: a swipe waits on the
// backend, then on the portal's own deferred repaint, and only then
// captures - well past this threshold. Clearing the spinner underneath it
// tells the user their press did nothing, seconds before it lands.
setInterval(() => {
  if (busy && !rendering && !pendingRender && !interacting && Date.now() - busySince > MIN_BUSY_MS + 2000) {
    setBusy(false, "janitor: no render in progress");
  }
}, 3000);

function respondVersion(res) {
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ version, busy }));
}

function flushWaiters() {
  const flushed = waiters.splice(0);
  for (const w of flushed) {
    clearTimeout(w.timer);
    respondVersion(w.res);
  }
  if (flushed.length) log("notified", flushed.length, "long-poll waiter(s)");
}

// ---- live interaction --------------------------------------------------
// The TV signals when a user starts pressing keys (so the portal session
// can warm up while they aim), then sends the gesture itself. The portal
// handles it exactly as on a touch TV; we re-capture and publish.
// built lazily: designerUrl/pageFile are defined further down
let session = null;
function getSession() {
  if (!session) {
    session = new InteractionSession({
      designerUrl,
      canvasW: DISPLAY.canvasW,
      canvasH: DISPLAY.canvasH,
      outW: DISPLAY.outW,
      outH: DISPLAY.outH,
      pageFile,
      apiBase: ENV.apiBase,
    });
  }
  return session;
}

// A calendar swipe's answer comes back on THIS socket, not to the page
// that asked for it: the render page runs in preview mode, which never
// opens a socket. So a swipe registers here, and the matching push is
// handed to it instead of triggering a normal re-render - a fresh render
// would re-fetch the default range and silently undo the scroll.
let interacting = false;
const pendingSwipes = new Map();

// A scrolled calendar lives only in the page that was told about it, so
// every render has to be told again. Held briefly - the scroll is meant
// to be a look-ahead, not a new permanent position.
const CALENDAR_HOLD_MS = 10 * 60 * 1000;
const OVERRIDE_FILE = path.join(__dirname, "calendar-override.json");
function rememberCalendar(cal) {
  let all = {};
  try {
    const prev = JSON.parse(fs.readFileSync(OVERRIDE_FILE, "utf8"));
    if (prev && Date.now() - prev.at < CALENDAR_HOLD_MS) all = prev.widgets || {};
  } catch (e) {}
  Object.assign(all, cal);
  try {
    fs.writeFileSync(OVERRIDE_FILE, JSON.stringify({ at: Date.now(), holdMs: CALENDAR_HOLD_MS, widgets: all }));
  } catch (e) {}
}
function waitForCalendarPayload(widgetId, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingSwipes.delete(widgetId);
      resolve(null);
    }, ms);
    pendingSwipes.set(widgetId, { resolve, timer });
  });
}

// ---- fast path: apply pushed data to warm pages ------------------------
// A push that only carries widget DATA (a new calendar event, refreshed
// weather, a new quote) does not need the portal booted again. The warm
// pages take the payload through the portal's own handlers - exactly what
// a real display does with the same message - and are captured straight
// away. Anything we do not fully understand falls back to a cold render.
let pool = null;
function getPool() {
  if (!pool) {
    pool = new RenderPool({
      designerUrl,
      pageFile,
      canvasW: DISPLAY.canvasW,
      canvasH: DISPLAY.canvasH,
      outW: DISPLAY.outW,
      outH: DISPLAY.outH,
      apiBase: ENV.apiBase,
    });
  }
  return pool;
}

function knownPageCount() {
  try {
    const prev = JSON.parse(lastMetaJson);
    if (prev && prev.pageCount > 0) return prev.pageCount;
  } catch (e) {}
  try {
    const pub = JSON.parse(fs.readFileSync(path.join(__dirname, "display.json"), "utf8"));
    if (pub && pub.pages && pub.pages.length) return pub.pages.length;
  } catch (e) {}
  return 1;
}

let fastPayload = null;
let fastTimer = null;
function scheduleFast(data) {
  if (!fastPayload) fastPayload = {};
  for (const k of Object.keys(data)) fastPayload[k] = Object.assign(fastPayload[k] || {}, data[k]);
  if (fastTimer) clearTimeout(fastTimer);
  fastTimer = setTimeout(runFast, 700);
}

async function runFast() {
  fastTimer = null;
  const payload = fastPayload;
  fastPayload = null;
  if (!payload) return;
  if (rendering || interacting) return void scheduleRender("data update");
  rendering = true;
  const t0 = Date.now();
  let failed = null;
  try {
    for (let i = 0; i < knownPageCount(); i++) {
      if (!(await getPool().applyTo(i, payload))) throw new Error("page " + i + " would not take the update");
      await getPool().capture(i);
    }
    publishFromDisk("data update");
    log("fast update in " + (Date.now() - t0) + "ms (" + Object.keys(payload).join(",") + ")");
  } catch (e) {
    failed = e.message;
  }
  rendering = false;
  if (failed) {
    log("fast path fell back to a full render:", failed);
    doRender("data update");
  }
}

async function handleInteract(u, res) {
  const type = u.searchParams.get("type") || "tap";
  const pageIndex = parseInt(u.searchParams.get("page") || "0", 10);
  const x = parseFloat(u.searchParams.get("x") || "0");
  const y = parseFloat(u.searchParams.get("y") || "0");
  const reply = (code, body) => {
    res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };

  if (type === "warm") {
    try {
      const how = await getSession().open(pageIndex);
      log("session " + how + " for page", pageIndex);
      return reply(200, { ok: true, session: how });
    } catch (e) {
      log("session warm failed:", e.message);
      return reply(500, { ok: false, error: e.message });
    }
  }

  try {
    const id = u.searchParams.get("id") || null;
    log("interact:", type, "at", Math.round(x) + "," + Math.round(y), "page", pageIndex, id ? "id " + id : "");
    // A tap needs no re-render: the device already drew the tick, and the
    // backend's own push re-renders through the normal path. A swipe
    // changes what the widget SHOWS - dates the device has never seen -
    // so this is the one gesture that has to go back through a capture.
    const swipe = type === "swipeup" || type === "swipedown";
    const waitPayload = swipe && id ? waitForCalendarPayload(String(id), 12000) : null;
    if (swipe) {
      interacting = true;
      setBusy(true, type);
    }
    const r = await getSession().interact({ type, x, y, id, page: pageIndex });
    if (swipe) {
      if (r && r.handled && waitPayload) {
        const payload = await waitPayload;
        if (!payload) {
          log("no calendar payload arrived within 12s - screen left as it was");
        } else {
          await getSession().close("fresh page for capture");
          await getSession().open(pageIndex);
          if (await getSession().applyCalendar(payload)) {
            await getSession().recapture();
            publishFromDisk("interaction");
          }
        }
      }
      interacting = false;
      setBusy(false, "swipe done");
      return reply(200, r);
    }
    return reply(200, r);
  } catch (e) {
    interacting = false;
    setBusy(false, "swipe failed");
    log("interact failed:", e.message);
    return reply(500, { ok: false, error: e.message });
  }
}

http
  .createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    if (u.pathname === "/version") return respondVersion(res);
    if (u.pathname === "/interact") return void handleInteract(u, res);
    if (u.pathname === "/wait") {
      const since = parseInt(u.searchParams.get("since") || "0", 10);
      // the client also reports the busy state it currently believes, so a
      // transition it missed while loading images is corrected the instant
      // it re-arms (event-only delivery left spinners running)
      const clientBusy = u.searchParams.get("busy") === "1";
      // Any DIFFERENCE, not just a higher number. The device accepts a
      // version change in either direction (a restarted service can come
      // back lower), so holding the connection whenever ours is not
      // strictly higher left it deaf: a publish that landed while it was
      // busy fetching images was never re-offered, and it sat on stale
      // content until something else happened to publish.
      // A client can hold a HIGHER version than ours - it saw one from a
      // previous instance of this service, and we resumed from a stale
      // .version file. Left alone that never converges: every poll
      // differs, we answer immediately, the device will not go backwards,
      // and it re-polls a few hundred ms later forever while its content
      // only ever refreshes on its own 60s fallback. Adopt anything ahead
      // of us so the next publish is unambiguously newer.
      log("/wait from device: since=" + since + " ours=" + version + " busy=" + clientBusy);
      // Deliberately NOT adopting a client's number any more. Those hacks
      // existed to paper over the float-rounding bug and now only drag us
      // back into the range where it happens. The device accepts any
      // change, so a small counter always wins.
      if (version !== since || busy !== clientBusy) return respondVersion(res);
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

function designerUrl(pageIndex) {
  return (
    ENV.portalBase +
    "?major=" + DISPLAY.major +
    "&minor=" + DISPLAY.minor +
    "&macaddress=" + DISPLAY.deviceId +
    "&designer=true&page=" + pageIndex +
    "&r=" + Date.now()
  );
}

const pageFile = (i) => path.join(__dirname, "display_p" + i + ".jpg");
const manifestFor = (f) => f.replace(/\.jpg$/, ".manifest.json");

function renderPage(pageIndex) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [
        path.join(__dirname, "render.js"),
        designerUrl(pageIndex),
        pageFile(pageIndex),
        String(DISPLAY.canvasW),
        String(DISPLAY.canvasH),
        String(DISPLAY.outW),
        String(DISPLAY.outH),
      ],
      { timeout: 120000, env: { ...process.env, MANGO_API_BASE: ENV.apiBase } },
      (err, stdout, stderr) => {
        if (err) {
          log("page", pageIndex, "render FAILED:", err.message, (stderr || "").slice(0, 200));
          resolve(false);
        } else {
          log("page", pageIndex, "done:", stdout.trim().split("\n").pop());
          resolve(true);
        }
      },
    );
  });
}

// renders page 0, learns the page list from its manifest, renders the
// rest, then publishes display.json (the Roku's single source of truth)
async function doRender(reason) {
  if (rendering) {
    pendingRender = true;
    return;
  }
  rendering = true;
  log("rendering (" + reason + ")...");
  const AUTO = ["startup", "scheduled", "midnight", "data update"];
  // tell the TV to spin now, not when the render lands
  if (!AUTO.includes(reason)) setBusy(true, reason);
  try {
    // Deliberately SEQUENTIAL. Rendering the pages concurrently was
    // tried and is not safe: two designer sessions for the same display
    // interfere, and page 0 came back without its ready signal, captured
    // half-loaded, and published a one-page manifest. The win is small
    // next to warming the page anyway.
    if (!(await renderPage(0))) throw new Error("page 0 failed");
    const man0 = JSON.parse(fs.readFileSync(manifestFor(pageFile(0)), "utf8"));
    const meta = man0.pageMeta || { pageCount: 1, pages: [] };
    lastMetaJson = JSON.stringify(man0.pageMeta || null);
    for (let i = 1; i < meta.pageCount; i++) await renderPage(i);
    publishFromDisk(reason);
    // keep the warm pages ready for the next data push
    getPool()
      .prewarm(meta.pageCount || 1)
      .catch(() => {});
  } catch (e) {
    log("render FAILED:", e.message);
  }
  rendering = false;
  if (pendingRender) {
    pendingRender = false;
    doRender("queued change");
  } else if (busy) {
    const held = Date.now() - busySince;
    const clear = () => {
      // a new render may have started while this was pending
      if (!rendering && !pendingRender) setBusy(false, "render published");
    };
    if (held >= MIN_BUSY_MS) clear();
    else setTimeout(clear, MIN_BUSY_MS - held);
  }
}

// Compose display.json from whatever manifests are on disk and publish.
// Used after a full render and after a single page is re-captured by an
// interaction, so both paths produce the same payload.
function publishFromDisk(reason) {
  const man0 = JSON.parse(fs.readFileSync(manifestFor(pageFile(0)), "utf8"));
  const meta = man0.pageMeta || { pageCount: 1, pages: [] };
  const pages = [];
  for (let i = 0; i < meta.pageCount; i++) {
    let m = null;
    try {
      m = JSON.parse(fs.readFileSync(manifestFor(pageFile(i)), "utf8"));
    } catch (e) {
      continue; // page never rendered: leave it out of this cycle
    }
    const mp = meta.pages[i] || {};
    pages.push({
      // layered pages render as transparent PNG, not JPEG
      image: m.imageFile || path.basename(pageFile(i)),
      delaySeconds: mp.delaySeconds || 60,
      transition: mp.transition || "fade",
      autoRotate: mp.autoRotate === true,
      overlays: m.overlays || [],
      targets: m.targets || null,
      regions: m.regions || null,
    });
  }
  // the TV spins its indicator only for user-driven updates, staying
  // silent for background refreshes (startup, 20-min data, midnight)
  const AUTO_REASONS = ["startup", "scheduled", "midnight", "data update"];
  const updateReason = AUTO_REASONS.includes(reason) ? "auto" : "edit";
  // A calendar swipe changes what one widget SHOWS and nothing else. Say
  // so, and the device swaps just the page image instead of rebuilding
  // every native layer - which restarts each GIF from frame one and
  // blanks them while their sheets reload.
  const imageOnly = reason === "interaction";
  // visual overlays are display-wide, not per page
  const effects = man0.effects || [];
  // remote gestures the user enabled, display-wide like effects
  const gestures = meta.gestures || { pageSwipe: false, calendarScroll: false };
  fs.writeFileSync(
    path.join(__dirname, "display.json"),
    JSON.stringify(
      { canvas: { width: DISPLAY.canvasW, height: DISPLAY.canvasH }, updateReason, imageOnly, effects, gestures, pages },
      null,
      1,
    ),
  );
  version = version + 1;
  try {
    fs.writeFileSync(VERSION_FILE, String(version));
  } catch (e) {}
  log("display.json:", pages.length, "page(s); version ->", version);
  flushWaiters();
}

function scheduleRender(reason) {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderTimer = null;
    doRender(reason);
  }, DEBOUNCE_MS);
}

// ---- page-settings probe -----------------------------------------------
// The backend does NOT push a socket event when page settings (transition,
// delay, page add/remove) change, so poll just the metadata every 2 min
// and re-render when it differs from what was last rendered. TODO(backend):
// emit a display push on page-setting saves, then this probe can go.
const META_PROBE_MS = 120000;
let lastMetaJson = null;

function probePageSettings() {
  if (rendering) return;
  execFile(
    process.execPath,
    [path.join(__dirname, "render.js"), designerUrl(0), "--meta"],
    { timeout: 60000 },
    (err, stdout) => {
      if (err || rendering) return;
      const line = (stdout || "").split("\n").find((l) => l.startsWith("META:"));
      if (!line) return;
      const metaJson = line.slice(5).trim();
      if (metaJson === "null") return;
      if (lastMetaJson !== null && metaJson !== lastMetaJson) {
        log("page settings changed (probe)");
        scheduleRender("page settings changed");
      }
    },
  );
}
setInterval(probePageSettings, META_PROBE_MS);

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
    const raw = buf.toString();
    let type = "unknown";
    let msg = null;
    try {
      msg = JSON.parse(raw);
      type = msg.type || "unknown";
    } catch (e) {}
    if (IGNORE_TYPES.has(type)) {
      log("(ignored:", type + ")");
      return;
    }
    // This connection is the display's only socket - the render page runs
    // in preview mode, which never opens one - so anything the backend
    // pushes here (a new calendar event, a widget's data changing on its
    // own) has to become a re-render, not just a layout signal. Log the
    // shape of every push so a type we don't yet handle is visible rather
    // than silently folded into a generic refresh.
    // a swipe waiting on this widget owns the payload: hand it over and
    // skip the render, which would re-fetch the default range
    if (pendingSwipes.size && msg && typeof msg.data === "string" && msg.data.includes("refreshCalenderData")) {
      try {
        const cal = JSON.parse(msg.data).refreshCalenderData || {};
        const hit = Object.keys(cal).find((k) => pendingSwipes.has(String(k)));
        if (hit) {
          const p = pendingSwipes.get(String(hit));
          pendingSwipes.delete(String(hit));
          clearTimeout(p.timer);
          log("calendar payload for widget", hit, "-> applying to the live page (no re-render)");
          // Remember it. Otherwise the very next render - a scheduled one,
          // or any of the weather/quote pushes that land every minute or
          // two - re-fetches the default range and silently undoes the
          // scroll, seconds after the user made it.
          rememberCalendar(cal);
          p.resolve(cal);
          return;
        }
      } catch (e) {}
    }
    const keys = msg && typeof msg === "object" ? Object.keys(msg).filter((k) => k !== "type") : [];
    log("change push:", type, keys.length ? "keys=" + keys.join(",") : "", "| " + raw.slice(0, 220));
    // data-only pushes go through the warm pages instead of a cold render
    if (msg && typeof msg.data === "string") {
      try {
        const inner = JSON.parse(msg.data);
        const innerKeys = Object.keys(inner || {});
        if (getPool().canHandle(innerKeys)) {
          scheduleFast(inner);
          return;
        }
      } catch (e) {}
    }
    // MM_SOCKET_DUMP=1 keeps the full bodies for inspection - payload
    // shapes are how we learn what the backend actually sends a display
    if (process.env.MM_SOCKET_DUMP) {
      try {
        fs.appendFileSync(path.join(__dirname, "socket-dump.jsonl"), raw + "\n");
      } catch (e) {}
    }
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
