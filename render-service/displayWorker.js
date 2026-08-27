/*
 * One display, owned end to end.
 *
 * A DisplayWorker is everything the old single-display watcher was, as an
 * object: the display's socket to the backend (exactly one - the backend
 * closes duplicates), its render queue and debounce, its version counter
 * and long-poll waiters, its interaction session and warm pages, and its
 * working directory of rendered files published under its own R2 prefix.
 *
 * The fleet manager (fleet.js) creates one of these per display and
 * routes control-channel requests to it. Nothing in here may touch
 * module-level mutable state: two workers in one process must never see
 * each other.
 */
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");
const { InteractionSession } = require("./session");
const { RenderPool } = require("./renderPool");
const { AssetPublisher, derivePrefix, enabled: r2Enabled } = require("./assets");

const DEBOUNCE_MS = 2500;
const KEEPALIVE_MS = 60000;
const RECONNECT_MS = 10000;
const WAIT_HOLD_MS = 50000; // client uses a 55s wait; always answer first
const MIN_BUSY_MS = 3000;
const CALENDAR_HOLD_MS = 10 * 60 * 1000;
const META_PROBE_MS = 120000;
const SCHEDULE_MS = 20 * 60 * 1000;

// server messages that are not content changes
const IGNORE_TYPES = new Set(["socket_connection_success", "check_socket_status", "Exception", "error"]);

class DisplayWorker {
  /*
   * opts:
   *   deviceId, major, minor  - the display's identity
   *   outW, outH              - the device's own resolution
   *   dir                     - working directory (created if missing)
   *   env                     - { socketBase, portalBase, apiBase }
   *   gate                    - shared render semaphore { acquire(), idle() }
   *   prewarmOk()             - fleet-level policy: may this worker keep
   *                             warm pages? (memory is shared and finite)
   *   legacy                  - config came from the environment, not a
   *                             request; never evicted
   */
  constructor(opts) {
    this.deviceId = opts.deviceId;
    this.display = {
      major: opts.major,
      minor: opts.minor,
      deviceId: opts.deviceId,
      canvasW: 1920, // layout coordinate space - portal has no responsive reflow
      canvasH: 1080,
      outW: opts.outW || 1920,
      outH: opts.outH || 1080,
    };
    this.dir = opts.dir;
    this.env = opts.env;
    this.gate = opts.gate;
    this.prewarmOk = opts.prewarmOk || (() => true);
    this.legacy = !!opts.legacy;

    this.stopped = false;
    this.ws = null;
    this.keepalive = null;
    this.reconnectTimer = null;

    this.renderTimer = null;
    this.rendering = false;
    this.pendingRender = false;
    this.interacting = false;

    this.version = 1;
    this.waiters = [];
    this.busy = false;
    this.busySince = 0;

    this.session = null;
    this.pool = null;
    this.publisher = null;
    this.uploading = false;

    this.pendingSwipes = new Map();
    this.fastPayload = null;
    this.fastTimer = null;
    this.lastMetaJson = null;

    // when a device request last arrived - the fleet evicts workers whose
    // TV has gone dark, so a powered-off display stops costing renders
    this.lastSeen = Date.now();
    this.lastPublishAt = 0;
    // socket health, used to tell a duplicate-identity kick (deploy
    // overlap) from a genuine outage before triggering a catch-up render
    this.socketOpenedAt = 0;
    this.socketClosedAt = 0;
    this.lastSessionMs = 0;

    this.janitor = null;
    this.probeTimer = null;
    this.scheduleTimer = null;
    this.midnightTimer = null;
  }

  log(...args) {
    console.log(new Date().toISOString(), "[" + this.deviceId + "]", ...args);
  }

  // ---- lifecycle ---------------------------------------------------------

  async start() {
    fs.mkdirSync(this.dir, { recursive: true });
    this.publisher = new AssetPublisher(await derivePrefix(this.deviceId));
    try {
      const prev = parseInt(fs.readFileSync(this.versionFile(), "utf8").trim(), 10);
      // A SMALL counter, persisted. It must stay small: BrightScript's
      // ParseJson hands large numbers back as single-precision floats
      // (~7 significant digits), so consecutive 10-digit versions round
      // to the SAME value on the device and it goes deaf.
      if (prev > 0 && prev < 1000000) this.version = prev + 1;
    } catch (e) {}

    this.log(
      "worker start (major " + this.display.major + " minor " + this.display.minor + ")",
      this.display.outW + "x" + this.display.outH,
      this.legacy ? "legacy-env" : "on-demand",
    );
    this.log("assets", this.publisher.publicBase() || "(served locally)");

    // belt and braces: busy must never outlive an actual render. An
    // interaction counts as work in progress too: a swipe waits on the
    // backend, then the portal's own deferred repaint, well past the
    // minimum. Clearing the spinner underneath it tells the user their
    // press did nothing, seconds before it lands.
    this.janitor = setInterval(() => {
      if (
        this.busy && !this.rendering && !this.pendingRender && !this.interacting &&
        Date.now() - this.busySince > MIN_BUSY_MS + 2000
      ) {
        this.setBusy(false, "janitor: no render in progress");
      }
    }, 3000);

    // The backend does NOT push a socket event when page settings change,
    // so poll just the metadata and re-render on a difference. Jittered
    // per display so a fleet's probes do not land in one thundering herd.
    this.probeTimer = setInterval(() => this.probePageSettings(), META_PROBE_MS + (this.hash() % 30000));

    // data widgets (weather, calendar, ...) only refresh when a render
    // happens, so re-render on a cadence + at local midnight
    this.scheduleTimer = setInterval(() => this.scheduleRender("scheduled"), SCHEDULE_MS);
    this.armMidnightRender();

    this.connect();
  }

  // Tear down everything owned. Safe to call once; the worker object must
  // not be reused afterwards.
  async stop(why) {
    if (this.stopped) return;
    this.stopped = true;
    this.log("worker stop (" + why + ")");
    for (const t of [this.janitor, this.probeTimer, this.scheduleTimer]) if (t) clearInterval(t);
    for (const t of [this.renderTimer, this.fastTimer, this.midnightTimer, this.reconnectTimer]) if (t) clearTimeout(t);
    if (this.keepalive) clearInterval(this.keepalive);
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
    }
    // answer held polls so the TV re-arms rather than timing out; its next
    // request resurrects the worker if it is actually still there
    this.flushWaiters();
    if (this.session) await this.session.close("worker stopped").catch(() => {});
    if (this.pool) await this.pool.closeAll().catch(() => {});
  }

  idleFor() {
    return Date.now() - this.lastSeen;
  }

  // eviction must never catch a display mid-anything; a held long poll IS
  // a live TV, so its presence alone vetoes
  evictable() {
    return !this.legacy && !this.rendering && !this.interacting && this.waiters.length === 0;
  }

  hash() {
    let h = 0;
    for (const c of this.deviceId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h;
  }

  // ---- files -------------------------------------------------------------

  versionFile() {
    return path.join(this.dir, ".version");
  }

  overrideFile() {
    return path.join(this.dir, "calendar-override.json");
  }

  pageFile(i) {
    return path.join(this.dir, "display_p" + i + ".jpg");
  }

  manifestFor(f) {
    return f.replace(/\.jpg$/, ".manifest.json");
  }

  designerUrl(pageIndex) {
    return (
      this.env.portalBase +
      "?major=" + this.display.major +
      "&minor=" + this.display.minor +
      "&macaddress=" + this.display.deviceId +
      "&designer=true&page=" + pageIndex +
      "&r=" + Date.now()
    );
  }

  // ---- version + long-poll waiters ---------------------------------------

  // since: the version the requesting device already holds (from /wait).
  // When ours differs, the manifest rides INLINE in the reply - the
  // device would otherwise turn around and fetch display.json from R2
  // over a fresh TLS connection, a serialized 200-500ms it pays on every
  // single update. Devices that predate the inline field ignore it and
  // fetch as before; a device that fails to parse it falls back too.
  respondVersion(res, since) {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    // The device is TOLD where to fetch rather than having it compiled in:
    // the per-display prefix must not be public, and moving to a custom
    // domain later should be configuration, not a channel rebuild.
    const reply = { version: this.version, busy: this.busy, assetBase: this.publisher.publicBase() };
    if (since !== undefined && since !== this.version) {
      try {
        reply.manifest = JSON.parse(fs.readFileSync(path.join(this.dir, "display.json"), "utf8"));
      } catch (e) {} // nothing published yet: device falls back to R2
    }
    res.end(JSON.stringify(reply));
  }

  flushWaiters() {
    const flushed = this.waiters.splice(0);
    for (const w of flushed) {
      clearTimeout(w.timer);
      this.respondVersion(w.res, w.since);
    }
    if (flushed.length) this.log("notified", flushed.length, "long-poll waiter(s)");
  }

  setBusy(next, why) {
    if (this.busy === next) return;
    this.busy = next;
    if (next) this.busySince = Date.now();
    this.log("busy ->", next, "(" + why + ")");
    this.flushWaiters();
  }

  handleWait(u, res, req) {
    this.lastSeen = Date.now();
    const since = parseInt(u.searchParams.get("since") || "0", 10);
    // the client reports the busy state it currently believes, so a
    // transition it missed while loading images is corrected the instant
    // it re-arms (event-only delivery left spinners running)
    const clientBusy = u.searchParams.get("busy") === "1";
    // the device's own memory level: the crash flight-recorder. A death
    // preceded by low/critical here is the OS reclaiming memory, not a
    // code crash - they are debugged completely differently.
    const mem = u.searchParams.get("mem") || "";
    this.log(
      "/wait from device: since=" + since + " ours=" + this.version + " busy=" + clientBusy +
      (mem ? " mem=" + mem : ""),
    );
    if (mem === "low" || mem === "critical") {
      this.log("DEVICE MEMORY " + mem.toUpperCase() + " - watch for an OS kill");
    }
    // Any DIFFERENCE, not just a higher number: the device accepts a
    // version change in either direction (a restarted service comes back
    // lower), and holding whenever ours was not strictly higher left it
    // deaf to publishes that landed while it was busy fetching images.
    if (this.version !== since || this.busy !== clientBusy) return this.respondVersion(res, since);
    const w = {
      res,
      since,
      timer: setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        this.respondVersion(res, since); // timeout: answer with current so client re-arms
      }, WAIT_HOLD_MS),
    };
    this.waiters.push(w);
    req.on("close", () => {
      clearTimeout(w.timer);
      this.waiters = this.waiters.filter((x) => x !== w);
    });
  }

  // ---- live interaction --------------------------------------------------

  getSession() {
    if (!this.session) {
      this.session = new InteractionSession({
        designerUrl: (i) => this.designerUrl(i),
        canvasW: this.display.canvasW,
        canvasH: this.display.canvasH,
        outW: this.display.outW,
        outH: this.display.outH,
        pageFile: (i) => this.pageFile(i),
        apiBase: this.env.apiBase,
        stateDir: this.dir,
      });
    }
    return this.session;
  }

  getPool() {
    if (!this.pool) {
      this.pool = new RenderPool({
        designerUrl: (i) => this.designerUrl(i),
        pageFile: (i) => this.pageFile(i),
        canvasW: this.display.canvasW,
        canvasH: this.display.canvasH,
        outW: this.display.outW,
        outH: this.display.outH,
        apiBase: this.env.apiBase,
        stateDir: this.dir,
      });
    }
    return this.pool;
  }

  // A scrolled calendar lives only in the page that was told about it, so
  // every render has to be told again. Held briefly - the scroll is meant
  // to be a look-ahead, not a new permanent position.
  rememberCalendar(cal) {
    let all = {};
    try {
      const prev = JSON.parse(fs.readFileSync(this.overrideFile(), "utf8"));
      if (prev && Date.now() - prev.at < CALENDAR_HOLD_MS) all = prev.widgets || {};
    } catch (e) {}
    Object.assign(all, cal);
    try {
      fs.writeFileSync(this.overrideFile(), JSON.stringify({ at: Date.now(), holdMs: CALENDAR_HOLD_MS, widgets: all }));
    } catch (e) {}
  }

  // One waiter per widget, and a waiter only ever cleans up AFTER ITSELF.
  // Both halves matter now that the device unlocks as soon as a swipe's
  // pixels land: back-to-back swipes on the same calendar are routine, so
  // an earlier waiter can still be armed when the next one registers. If
  // the old timer were left running it would delete the NEW entry, and
  // that swipe's payload would then miss pendingSwipes entirely - never
  // remembered as the scrolled range (so the next render snaps the
  // calendar back) and never handed to the waiter, which would sit until
  // its own deadline with the spinner up.
  waitForCalendarPayload(widgetId, ms) {
    const prev = this.pendingSwipes.get(widgetId);
    if (prev) {
      clearTimeout(prev.timer);
      this.pendingSwipes.delete(widgetId);
      prev.resolve(null); // never orphan the earlier waiter
    }
    return new Promise((resolve) => {
      const entry = { resolve, timer: null };
      entry.timer = setTimeout(() => {
        // only if this record is still the live one
        if (this.pendingSwipes.get(widgetId) === entry) this.pendingSwipes.delete(widgetId);
        resolve(null);
      }, ms);
      this.pendingSwipes.set(widgetId, entry);
    });
  }

  // A swipe that resolved without needing its payload (the page repainted
  // itself) must not leave a 12s zombie behind to trip the next one.
  cancelCalendarWait(widgetId) {
    const e = this.pendingSwipes.get(String(widgetId));
    if (!e) return;
    clearTimeout(e.timer);
    this.pendingSwipes.delete(String(widgetId));
    e.resolve(null);
  }

  async handleInteract(u, res) {
    this.lastSeen = Date.now();
    this.killProbeForInteraction();
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
        const how = await this.getSession().open(pageIndex);
        this.log("session " + how + " for page", pageIndex);
        return reply(200, { ok: true, session: how });
      } catch (e) {
        this.log("session warm failed:", e.message);
        return reply(500, { ok: false, error: e.message });
      }
    }

    try {
      const id = u.searchParams.get("id") || null;
      this.log("interact:", type, "at", Math.round(x) + "," + Math.round(y), "page", pageIndex, id ? "id " + id : "");
      // A tap needs no re-render: the device already drew the tick, and the
      // backend's own push re-renders through the normal path. A swipe
      // changes what the widget SHOWS - dates the device has never seen -
      // so this is the one gesture that has to go back through a capture.
      const swipe = type === "swipeup" || type === "swipedown";
      const waitPayload = swipe && id ? this.waitForCalendarPayload(String(id), 12000) : null;
      if (swipe) {
        this.interacting = true;
        this.setBusy(true, type);
      }
      // the payload promise doubles as the interrupt for the session's
      // self-repaint wait: socket-path widgets answer in ~150ms, and
      // waiting out the full repaint window with the answer in hand was
      // 6 dead seconds on every Weeks-calendar swipe
      const r = await this.getSession().interact({ type, x, y, id, page: pageIndex, interrupt: waitPayload });
      if (swipe) {
        // If the swiped page repainted itself, it IS the answer - capture
        // it now rather than waiting for a push that may never come.
        if (r && r.handled && r.changed) {
          this.log("swiped page updated itself - capturing it directly");
          // this swipe never needs its payload; retire the waiter now so it
          // cannot outlive the gesture and delete the NEXT swipe's entry
          if (id) this.cancelCalendarWait(id);
          await this.getSession().recapture();
          await this.publishFromDisk("interaction");
        } else if (r && r.handled && waitPayload) {
          const payload = await waitPayload;
          if (!payload) {
            // Some widgets get no push at all - the List calendar is one:
            // the portal fetches the new range straight into the page it
            // is on and the backend never announces it. That page is right
            // there, already showing the new dates, so capture IT rather
            // than leaving the screen stale.
            if (r.changed) {
              this.log("no push for this widget - capturing the page we swiped");
              await this.getSession().recapture();
              await this.publishFromDisk("interaction");
            } else {
              this.log("no calendar payload and no visible change - nothing to publish");
            }
          } else {
            // Capture the page we ALREADY have open - the one this swipe
            // was dispatched into. It is a fully loaded portal showing
            // this display; closing it and booting a replacement purely
            // to take the screenshot cost ~2.8s, and worse, it serialized
            // the portal's own ~2s repaint BEHIND that boot instead of
            // letting it run from the moment we dispatched. Same pixels,
            // several seconds sooner.
            //
            // Safety: applyCalendar with preapplied:false watches the
            // TARGETED widget's own rendered text and will not return
            // until it changes (or the wait times out), so the capture
            // cannot outrun the repaint - which is the bug this path
            // shipped the last time it was attempted.
            let applied = false;
            try {
              applied = await this.getSession().applyCalendar(payload, { preapplied: false });
            } catch (e) {
              this.log("live page would not take the payload:", e.message);
            }
            if (!applied) {
              // Fall back to the old behaviour rather than publish
              // nothing: a fresh page with the range applied at load.
              // Slower, always correct, now only paid when the live page
              // refuses.
              this.log("falling back to a fresh page for capture");
              await this.getSession().close("fresh page for capture");
              await this.getSession().open(pageIndex);
              applied = await this.getSession().applyCalendar(payload, { preapplied: true });
            }
            if (applied) {
              await this.getSession().recapture();
              await this.publishFromDisk("interaction");
            }
          }
        }
        this.interacting = false;
        this.setBusy(false, "swipe done");
        return reply(200, r);
      }
      return reply(200, r);
    } catch (e) {
      this.interacting = false;
      this.setBusy(false, "swipe failed");
      this.log("interact failed:", e.message);
      return reply(500, { ok: false, error: e.message });
    }
  }

  // ---- fast path: apply pushed data to warm pages ------------------------

  knownPageCount() {
    try {
      const prev = JSON.parse(this.lastMetaJson);
      if (prev && prev.pageCount > 0) return prev.pageCount;
    } catch (e) {}
    try {
      const pub = JSON.parse(fs.readFileSync(path.join(this.dir, "display.json"), "utf8"));
      if (pub && pub.pages && pub.pages.length) return pub.pages.length;
    } catch (e) {}
    return 1;
  }

  scheduleFast(data) {
    if (!this.fastPayload) this.fastPayload = {};
    for (const k of Object.keys(data)) this.fastPayload[k] = Object.assign(this.fastPayload[k] || {}, data[k]);
    if (this.fastTimer) clearTimeout(this.fastTimer);
    this.fastTimer = setTimeout(() => this.runFast(), 700);
  }

  async runFast() {
    this.fastTimer = null;
    const payload = this.fastPayload;
    this.fastPayload = null;
    if (!payload || this.stopped) return;
    if (this.rendering || this.interacting) return void this.scheduleRender("data update");
    this.rendering = true;
    this.killProbeForInteraction(); // never queue real work behind a probe
    const release = await this.gate.acquire();
    const t0 = Date.now();
    let failed = null;
    let released = false;
    try {
      for (let i = 0; i < this.knownPageCount(); i++) {
        if (!(await this.getPool().applyTo(i, payload))) throw new Error("page " + i + " would not take the update");
        await this.getPool().capture(i);
      }
      // The gate exists to serialize CHROMIUM, not network I/O. publishFromDisk
      // awaits the R2 upload (and its retry backoff), so holding the single
      // fleet slot across it makes one display's slow upload delay every other
      // display's render. this.rendering stays true, so re-entrancy is still
      // covered. Announce-after-upload ordering is untouched.
      release();
      released = true;
      await this.publishFromDisk("data update");
      this.log("fast update in " + (Date.now() - t0) + "ms (" + Object.keys(payload).join(",") + ")");
    } catch (e) {
      failed = e.message;
    }
    if (!released) release();
    this.rendering = false;
    if (failed) {
      this.log("fast path fell back to a full render:", failed);
      this.doRender("data update");
    }
  }

  // ---- rendering ---------------------------------------------------------

  renderPage(pageIndex) {
    return new Promise((resolve) => {
      execFile(
        process.execPath,
        [
          path.join(__dirname, "render.js"),
          this.designerUrl(pageIndex),
          this.pageFile(pageIndex),
          String(this.display.canvasW),
          String(this.display.canvasH),
          String(this.display.outW),
          String(this.display.outH),
        ],
        {
          timeout: 120000,
          env: { ...process.env, MANGO_API_BASE: this.env.apiBase, MANGO_STATE_DIR: this.dir },
        },
        (err, stdout, stderr) => {
          if (err) {
            this.log("page", pageIndex, "render FAILED:", err.message, (stderr || "").slice(0, 200));
            resolve(false);
          } else {
            this.log("page", pageIndex, "done:", stdout.trim().split("\n").pop());
            resolve(true);
          }
        },
      );
    });
  }

  scheduleRender(reason) {
    if (this.stopped) return;
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      this.doRender(reason);
    }, DEBOUNCE_MS);
  }

  // renders page 0, learns the page list from its manifest, renders the
  // rest, then publishes display.json (the Roku's single source of truth)
  async doRender(reason) {
    if (this.rendering) {
      this.pendingRender = true;
      return;
    }
    this.rendering = true;
    const AUTO = ["startup", "scheduled", "midnight", "data update"];
    // tell the TV to spin now - including while this display queues behind
    // another display's render on the shared gate
    if (!AUTO.includes(reason)) this.setBusy(true, reason);
    // A best-effort settings probe must never make a user's edit wait: it
    // holds a gate slot for its whole run, and only /interact killed it, so
    // a layout edit could sit spinning behind one.
    this.killProbeForInteraction();
    const release = await this.gate.acquire();
    let released = false;
    // the fleet may have evicted this worker while it sat in the queue
    if (this.stopped) {
      release();
      this.rendering = false;
      return;
    }
    this.log("rendering (" + reason + ")...");
    try {
      // Deliberately SEQUENTIAL. Rendering the pages concurrently was
      // tried and is not safe: two designer sessions for the same display
      // interfere, and page 0 came back without its ready signal, captured
      // half-loaded, and published a one-page manifest.
      if (!(await this.renderPage(0))) throw new Error("page 0 failed");
      const man0 = JSON.parse(fs.readFileSync(this.manifestFor(this.pageFile(0)), "utf8"));
      const meta = man0.pageMeta || { pageCount: 1, pages: [] };
      this.lastMetaJson = JSON.stringify(man0.pageMeta || null);
      for (let i = 1; i < meta.pageCount; i++) await this.renderPage(i);
      // free the fleet's single Chromium slot before the network leg (see
      // runFast); this.rendering still guards re-entrancy
      release();
      released = true;
      await this.publishFromDisk(reason);
      // keep the warm pages ready for the next data push - but only while
      // fleet policy allows it (warm Chromium pages are the memory cost)
      if (this.prewarmOk()) {
        this.getPool()
          .prewarm(meta.pageCount || 1)
          .catch(() => {});
      }
    } catch (e) {
      this.log("render FAILED:", e.message);
    }
    if (!released) release();
    this.rendering = false;
    if (this.pendingRender) {
      this.pendingRender = false;
      this.doRender("queued change");
    } else if (this.busy) {
      const held = Date.now() - this.busySince;
      const clear = () => {
        // a new render may have started while this was pending
        if (!this.rendering && !this.pendingRender) this.setBusy(false, "render published");
      };
      if (held >= MIN_BUSY_MS) clear();
      else setTimeout(clear, MIN_BUSY_MS - held);
    }
  }

  // Compose display.json from whatever manifests are on disk and publish.
  // Used after a full render and after a single page is re-captured by an
  // interaction, so both paths produce the same payload.
  publishFromDisk(reason) {
    const man0 = JSON.parse(fs.readFileSync(this.manifestFor(this.pageFile(0)), "utf8"));
    const meta = man0.pageMeta || { pageCount: 1, pages: [] };
    const pages = [];
    for (let i = 0; i < meta.pageCount; i++) {
      let m = null;
      try {
        m = JSON.parse(fs.readFileSync(this.manifestFor(this.pageFile(i)), "utf8"));
      } catch (e) {
        continue; // page never rendered: leave it out of this cycle
      }
      const mp = meta.pages[i] || {};
      pages.push({
        // layered pages render as transparent PNG, not JPEG
        image: m.imageFile || path.basename(this.pageFile(i)),
        // devices key their image caches on this: unchanged pixels keep
        // an unchanged URL and are never re-fetched or re-decoded
        imageHash: m.imageHash || null,
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
    //
    // UNLESS the interaction changed the native layers themselves:
    // scrolling a calendar off the forecast window removes its
    // cell-weather overlays, and an image-only update left last month's
    // rain falling over the new month's image (Dave, 2026-08-27). When
    // any page's overlay set differs from what was last published, this
    // update must be a full one - the GIF-restart flicker is the honest
    // cost of layers that genuinely changed.
    let imageOnly = reason === "interaction";
    if (imageOnly) {
      try {
        const prev = JSON.parse(fs.readFileSync(path.join(this.dir, "display.json"), "utf8"));
        const key = (o) => JSON.stringify(o || []);
        pages.forEach((p, i) => {
          const old = (prev.pages || [])[i];
          if (imageOnly && (!old || key(old.overlays) !== key(p.overlays))) {
            imageOnly = false;
            this.log("interaction changed page " + i + " overlays - publishing full manifest");
          }
        });
      } catch (e) {
        /* no previous manifest to compare against: publish full */
        imageOnly = false;
      }
    }
    const effects = man0.effects || []; // display-wide, not per page
    const gestures = meta.gestures || { pageSwipe: false, calendarScroll: false };
    fs.writeFileSync(
      path.join(this.dir, "display.json"),
      JSON.stringify(
        {
          schema: man0.schema || 1,
          canvas: { width: this.display.canvasW, height: this.display.canvasH },
          updateReason,
          imageOnly,
          effects,
          gestures,
          pages,
        },
        null,
        1,
      ),
    );
    // The version number is the ANNOUNCEMENT, and a device answers it by
    // fetching display.json from R2. Raising it before the upload lands
    // makes the device race us and re-fetch the PREVIOUS manifest: it then
    // holds the new version number with the OLD image identity, sees a uri
    // it already has, and never repaints. New pixels under an old name is
    // invisible - which is exactly what a swipe looked like. The exposure
    // was measured at ~380ms per publish, and a swipe's notification lands
    // inside it every time.
    const announce = () => {
      this.version = this.version + 1;
      this.lastPublishAt = Date.now();
      try {
        fs.writeFileSync(this.versionFile(), String(this.version));
      } catch (e) {}
      this.log("display.json:", pages.length, "page(s); version ->", this.version);
      this.flushWaiters();
    };
    // announce on failure too: a device left waiting is worse than one
    // that re-fetches something slightly stale. The promise is returned
    // so callers that manage the busy flag can hold it until the
    // announcement: clearing busy first cost the TV an extra /wait
    // round trip (busy=false reply, re-arm, then the version reply).
    if (r2Enabled()) return this.pushToR2(reason).then(announce, announce);
    announce();
    return Promise.resolve();
  }

  // Everything a device fetches: the manifest, the page images, and the
  // sprite sheets the overlays and effects name. Gathered from disk rather
  // than from the manifest so a file we forgot to reference still ships -
  // a missing sprite is a blank patch on someone's wall.
  publishableFiles() {
    const out = ["display.json"];
    for (const f of fs.readdirSync(this.dir)) {
      if (/^display_p\d+\.(png|jpe?g)$/.test(f)) out.push(f);
      else if (/^overlay_.*\.(png|json)$/.test(f)) out.push(f);
      else if (/^ui_check_.*\.png$/.test(f)) out.push(f);
      else if (/^effect_.*\.png$/.test(f)) out.push(f);
    }
    return out;
  }

  // Uploads run after the version is already published, so a slow or
  // failed upload cannot hold up the render loop. A device that polls in
  // the gap re-fetches on the next version anyway.
  // Serialized, never skipped: the caller now waits on this before it
  // announces a new version, so returning early while another upload is
  // in flight would announce content that is not on R2 yet - the very
  // race this is here to close. Concurrent publishes queue instead.
  pushToR2(reason) {
    if (!r2Enabled()) return Promise.resolve();
    this.uploadChain = (this.uploadChain || Promise.resolve())
      .catch(() => {})
      .then(() => this.uploadOnce(reason));
    return this.uploadChain;
  }

  async uploadOnce(reason) {
    try {
      const t0 = Date.now();
      const r = await this.publisher.publish(this.dir, this.publishableFiles());
      if (r.sent || r.removed || (r.failed && r.failed.length)) {
        this.log(
          "r2:", r.sent, "file(s),", Math.round(r.bytes / 1024) + "KB in " + (Date.now() - t0) + "ms",
          r.removed ? "- " + r.removed + " stale removed" : "",
          r.failed && r.failed.length ? "- " + r.failed.length + " failed, retried next render" : "",
          "(" + reason + ")",
        );
      }
    } catch (e) {
      this.log("r2 upload failed:", e.message);
    }
  }

  // ---- page-settings probe -----------------------------------------------

  probePageSettings() {
    // A probe is a full portal boot (~10s of Chromium on a shared 1-vCPU
    // box). It used to check gate.idle() only at START and then run
    // ungated - so a render or a swipe landing mid-probe silently fought
    // it for CPU, which is where the "sometimes the swipe takes 20s"
    // variance came from. Now it HOLDS a gate slot (renders queue briefly
    // behind it, never overlap it) and is killed outright the moment a
    // gesture arrives - a probe is best-effort background work and a
    // person holding a remote always outranks it.
    if (this.stopped || this.rendering || !this.gate.idle()) return;
    const release = this.gate.tryAcquire();
    if (!release) return; // something real is running; probe next cycle
    const child = execFile(
      process.execPath,
      [path.join(__dirname, "render.js"), this.designerUrl(0), "--meta"],
      // Capped well under the old 60s: this is the worst case a real
      // render can be stuck behind if it arrives just after the probe
      // takes the slot (edits and swipes kill it outright, but a probe
      // that hangs must not be able to sit on the fleet's only slot).
      // A probe that cannot finish in 20s has nothing useful to say.
      { timeout: 20000, env: { ...process.env, MANGO_STATE_DIR: this.dir } },
      (err, stdout) => {
        this.probeChild = null;
        release();
        if (err || this.rendering || this.stopped) return;
        const line = (stdout || "").split("\n").find((l) => l.startsWith("META:"));
        if (!line) return;
        const metaJson = line.slice(5).trim();
        if (metaJson === "null") return;
        if (this.lastMetaJson !== null && metaJson !== this.lastMetaJson) {
          this.log("page settings changed (probe)");
          this.scheduleRender("page settings changed");
        }
      },
    );
    this.probeChild = child;
  }

  // a live gesture outranks background maintenance: free the CPU now
  killProbeForInteraction() {
    if (this.probeChild) {
      this.log("killing settings probe - gesture takes priority");
      try {
        this.probeChild.kill();
      } catch (e) {}
      this.probeChild = null;
    }
  }

  armMidnightRender() {
    if (this.stopped) return;
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    this.midnightTimer = setTimeout(() => {
      this.scheduleRender("midnight");
      this.armMidnightRender();
    }, next.getTime() - now.getTime());
  }

  // ---- the display's socket ----------------------------------------------

  connect() {
    if (this.stopped) return;
    const url = this.env.socketBase + this.display.major + "/" + this.display.minor + "/" + this.display.deviceId;
    this.log("connecting", url);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on("open", () => {
      this.socketOpenedAt = Date.now();
      this.log("socket open");
      // Render on (re)connect to cover pushes missed while genuinely
      // offline. A DUPLICATE KICK is not that: during a deploy the old
      // and new task both hold this display's identity, the backend
      // hangs up on one every ~10s, and each cycle used to trigger a full
      // render. That storm republished full manifests, which makes every
      // TV rebuild its overlays and re-download every sprite sheet - it
      // is what got us rate-limited by R2 and killed the GIFs.
      //
      // So render only when this is a real gap: the first connect of this
      // worker, or an outage long enough to have missed something. A
      // short cycle is a fight over the identity, and the 20-min schedule
      // plus the meta probe cover anything a skipped render would catch.
      const downMs = this.socketClosedAt ? Date.now() - this.socketClosedAt : 0;
      const flapping = this.lastSessionMs > 0 && this.lastSessionMs < 30000;
      if (this.socketClosedAt && (flapping || downMs < 60000)) {
        this.log(
          "(reconnect render skipped - " +
            (flapping ? "identity contested, last session " + Math.round(this.lastSessionMs / 1000) + "s" : "offline only " + Math.round(downMs / 1000) + "s") +
            ")",
        );
      } else if (Date.now() - this.lastPublishAt > 60000) {
        this.scheduleRender("startup");
      } else {
        this.log("(reconnect render skipped - published " + Math.round((Date.now() - this.lastPublishAt) / 1000) + "s ago)");
      }
      this.keepalive = setInterval(() => {
        try {
          ws.send(JSON.stringify({ type: "check_socket_status" }));
        } catch (e) {}
      }, KEEPALIVE_MS);
    });

    ws.on("message", (buf) => this.onSocketMessage(buf));

    ws.on("close", (code) => {
      if (this.keepalive) clearInterval(this.keepalive);
      this.keepalive = null;
      // remembered so the next open() can tell a duplicate kick (short
      // session, immediate re-close) from a real outage
      this.lastSessionMs = this.socketOpenedAt ? Date.now() - this.socketOpenedAt : 0;
      this.socketClosedAt = Date.now();
      this.socketOpenedAt = 0;
      if (this.stopped) return;
      this.log(
        "socket closed (" + code + ") after " + Math.round(this.lastSessionMs / 1000) + "s, reconnecting in",
        RECONNECT_MS / 1000,
        "s",
      );
      this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_MS);
    });

    ws.on("error", (e) => {
      this.log("socket error:", e.message);
      ws.close();
    });
  }

  onSocketMessage(buf) {
    const raw = buf.toString();
    let type = "unknown";
    let msg = null;
    try {
      msg = JSON.parse(raw);
      type = msg.type || "unknown";
    } catch (e) {}
    if (IGNORE_TYPES.has(type)) {
      this.log("(ignored:", type + ")");
      return;
    }
    // This connection is the display's only socket - the render page runs
    // in preview mode, which never opens one - so anything the backend
    // pushes here has to become a re-render, not just a layout signal.
    // a swipe waiting on this widget owns the payload: hand it over and
    // skip the render, which would re-fetch the default range
    if (this.pendingSwipes.size && msg && typeof msg.data === "string" && msg.data.includes("refreshCalenderData")) {
      try {
        const cal = JSON.parse(msg.data).refreshCalenderData || {};
        const hit = Object.keys(cal).find((k) => this.pendingSwipes.has(String(k)));
        if (hit) {
          const p = this.pendingSwipes.get(String(hit));
          this.pendingSwipes.delete(String(hit));
          clearTimeout(p.timer);
          // the range is logged because step size varies by widget type:
          // a Weeks calendar moves a fortnight per swipe, a List one a
          // single day, which often shows the very same events
          this.log(
            "calendar payload for widget", hit,
            "-> range starts", (cal[hit] && cal[hit].initial_date) || "?",
            "(applying to the live page, no re-render)",
          );
          // Remember it. Otherwise the very next render re-fetches the
          // default range and silently undoes the scroll, seconds after
          // the user made it.
          this.rememberCalendar(cal);
          p.resolve(cal);
          return;
        }
      } catch (e) {}
    }
    const keys = msg && typeof msg === "object" ? Object.keys(msg).filter((k) => k !== "type") : [];
    this.log("change push:", type, keys.length ? "keys=" + keys.join(",") : "", "| " + raw.slice(0, 220));
    // data-only pushes go through the warm pages instead of a cold render
    if (msg && typeof msg.data === "string") {
      try {
        const inner = JSON.parse(msg.data);
        const innerKeys = Object.keys(inner || {});
        if (this.getPool().canHandle(innerKeys)) {
          this.scheduleFast(inner);
          return;
        }
      } catch (e) {}
    }
    // MM_SOCKET_DUMP=1 keeps the full bodies for inspection - payload
    // shapes are how we learn what the backend actually sends a display
    if (process.env.MM_SOCKET_DUMP) {
      try {
        fs.appendFileSync(path.join(this.dir, "socket-dump.jsonl"), raw + "\n");
      } catch (e) {}
    }
    this.scheduleRender(type);
  }
}

module.exports = { DisplayWorker };
