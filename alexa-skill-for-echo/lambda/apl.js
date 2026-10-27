// The skill's screens as APL documents.
//
// Pairing mirrors tvos PairingView.swift / MainScene.xml's pairingGroup:
// logo, heading, code, setup line in a centered column, laid out in the
// 1920-wide design space and converted to this screen's size. The copy
// stays activation-only, as on Roku and tvOS - no signup steering.
//
// A skill cannot run between requests, so every screen carries its own
// heartbeat (heartbeat() below): a loop started on mount that waits, sends
// an APL UserEvent back to the skill (index.js), and repeats. The skill
// answers with the next screen or nothing. The loop doubles as the
// stay-awake: its waits hold `screenLock`, which stops the screen's
// inactivity timer for as long as they run (APL base command properties).
//
// Each event carries the state the skill needs to answer it (which screen,
// version shown, major/minor), because Alexa closes the SESSION ~30s after
// a response even while the screen stays up - the skill must not depend on
// session attributes surviving.

const env = require("./env");
const touch = require("./touch");
const overlays = require("./overlays");
const pagesMod = require("./pages");
const effects = require("./effects");
const scroll = require("./overlay-scroll");
const { spinner, SIZE_PX: SPINNER_PX } = require("./spinner");
const crypto = require("crypto");

// A new render whose LAYOUT matches the screen's (same widgets, places,
// formats, background, checkboxes) updates the screen in place instead of
// replacing it: a whole new document made the Echo rebuild everything and
// reload every image, which blinked the full screen on each calendar
// swipe (Dave, 2026-10-27). The Roku avoids it with A/B slots; here the
// page image cross-fades (pageImages) and checkbox states are set in place.
const FADE_MS = 200;
const PAGE_ID = "mmPage";
const PREV_ID = "mmPagePrev";

const APL_VERSION = "2023.2";
const PAIR_TICK_MS = 5000;     // the TVs' pairing poll cadence
// How long a backend change (calendar edit, layout) may take to show. The
// TVs are told at once over a held /wait; the Echo has to ask.
const DISPLAY_TICK_MS = 10000;
// Asked of the device as well; advisory only, devices may cap it
const IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** Viewport size in dp from the request (falls back to Echo Show 15). */
function viewportDp(requestEnvelope) {
  const vp = (requestEnvelope.context && requestEnvelope.context.Viewport) || {};
  const dpi = vp.dpi || 160;
  const pw = vp.currentPixelWidth || vp.pixelWidth || 1920;
  const ph = vp.currentPixelHeight || vp.pixelHeight || 1080;
  return { w: Math.round((pw * 160) / dpi), h: Math.round((ph * 160) / dpi), pw, ph };
}

/** Maps canvas px to viewport dp: one uniform scale, letterboxed and
 * centered - the same stage-scale safety net as MainScene.applyCanvas. */
function placement(canvas, vp) {
  const s = Math.min(vp.w / canvas.width, vp.h / canvas.height);
  const ox = (vp.w - canvas.width * s) / 2;
  const oy = (vp.h - canvas.height * s) / 2;
  return {
    scale: s, ox, oy,
    len: (v) => v * s,
    rect: (r) => ({ x: ox + r.x * s, y: oy + r.y * s, w: r.w * s, h: r.h * s }),
  };
}

/** The wait-send-repeat loop. On its own named sequencer so it runs in
 * normal mode (tick handlers run in fast mode, where SendEvent is
 * ignored) and a touch on the main sequencer cannot cancel it. ~1M
 * repeats at 5-10s is months - in practice a new screen replaces it. */
function heartbeat(ms, args) {
  return [{
    type: "Sequential",
    sequencer: "heartbeat",
    screenLock: true,
    repeatCount: 1000000,
    commands: [
      { type: "Idle", delay: ms, screenLock: true },
      { type: "SendEvent", arguments: args },
    ],
  }];
}

/** `args` is what the heartbeat sends; a rotation (Echo Show 15) sends
 * "rotate" + the same, so the skill redraws for the new viewport.
 * `overrides` seeds the root's pending-press variable (touch.js); the
 * heartbeat runs from the root container so its events can carry it.
 * opts: extraBinds (root variables), commands (named APL commands),
 * onMount (more root mount commands, after the heartbeat). */
function doc(items, tickMs, args, overrides = "", busy = false, opts = {}) {
  const d = {
    type: "APL",
    version: APL_VERSION,
    theme: "dark",
    settings: { idleTimeout: IDLE_TIMEOUT_MS },
    onConfigChange: [{ type: "SendEvent", sequencer: "rotate", arguments: ["rotate"].concat(args) }],
    // A Frame draws ONE child; extra items are silently dropped (on the
    // Echo only the first layer - the background color - showed). The
    // layers go in a Container, which stacks any number.
    mainTemplate: {
      items: [{
        type: "Frame", width: "100vw", height: "100vh", backgroundColor: "black",
        items: [{
          type: "Container", id: touch.ROOT_ID, width: "100%", height: "100%",
          // mmBusy: the render service's busy flag as this screen shows it
          // (spinner.js); mmSwiping: the calendar id a swipe is waiting on
          bind: [{ name: "overrides", value: overrides }, { name: "mmBusy", value: busy }, { name: "mmSwiping", value: "" }]
            .concat(opts.extraBinds || []),
          onMount: heartbeat(tickMs, args).concat(opts.onMount || []),
          items,
        }],
      }],
    },
  };
  if (opts.commands) d.commands = opts.commands;
  return d;
}

function directive(token, document) {
  return { type: "Alexa.Presentation.APL.RenderDocument", token, document };
}

/** Pairing / "Connected" screen. `connected` = claimed, first page not
 * here yet; `paired` = { major, minor } when connected. */
function pairingScreen(vp, code, connected, paired) {
  const k = vp.w / 1920;
  const col = [];
  if (process.env.LOGO_URL) {
    col.push({ type: "Image", source: process.env.LOGO_URL, width: 560 * k, height: 136 * k, scale: "best-fit", paddingBottom: 70 * k });
  } else {
    col.push({ type: "Text", text: "Mango Display", color: "#F7931E", fontSize: 96 * k, fontWeight: "bold", textAlign: "center", paddingBottom: 70 * k });
  }
  col.push({ type: "Text", text: connected ? "Connected" : "Display Device Code", color: "white", fontSize: 40 * k, fontWeight: "bold", textAlign: "center", paddingBottom: 36 * k });
  col.push({ type: "Text", text: connected ? "Loading your display..." : code, color: "white", fontSize: 72 * k, textAlign: "center", paddingBottom: 90 * k });
  if (!connected) {
    col.push({ type: "Text", text: "Setup at " + env.setupHost + " using any browser", color: "#CCCCCC", fontSize: 28 * k, textAlign: "center" });
  }
  const items = [{ type: "Container", width: "100%", alignItems: "center", paddingTop: 230 * k, items: col }];
  // below the text, not over it (Roku busyAt at 78% of the screen height)
  if (connected) items.push(spinner(vp.w / 2, vp.h * 0.78, SPINNER_PX * k));
  const args = connected ? ["loading", "", paired.major, paired.minor] : ["pair"];
  return directive("pairing", doc(items, PAIR_TICK_MS, args));
}

/** Everything the display screen is built from: per page its image URL,
 * and the layout fingerprint - everything drawn EXCEPT the page pixels and
 * the checkbox ticks. */
function displayView(vp, display) {
  const { manifest, assetBase } = display;
  const pages = manifest.pages || [];
  const canvas = manifest.canvas || { width: 1920, height: 1080 };
  const place = placement(canvas, vp);
  // the hash busts the Echo's image cache only when the pixels changed
  const urls = pages.map((p) => (p && p.image ? assetBase + p.image + (p.imageHash ? "?h=" + p.imageHash : "") : ""));
  // The clock's `sample` text and `textRect` (the measured width of that
  // text) change every minute with the time itself; the Echo draws from
  // the fixed `rect`, so they are not layout - counting them turned every
  // update across a minute boundary into a full blinking redraw.
  // Checkbox ticks are contents too (set in place), including the boxes
  // riding scroll strips.
  const stable = (k, v) => (k === "sample" || k === "textRect" || k === "checked" ? undefined : v);
  const layout = crypto.createHash("sha1").update(JSON.stringify({
    vp: [vp.w, vp.h], canvas, gestures: manifest.gestures || null, assetBase, effects: manifest.effects || [],
    night: manifest.night === true,
    pages: pages.map((page) => {
      const t = page && page.targets;
      return {
        image: page && page.image, overlays: (page && page.overlays) || [], regions: (page && page.regions) || [],
        dwell: pagesMod.dwellMs(page), auto: !!(page && page.autoRotate), transition: page && page.transition,
        sprites: (t && t.sprites) || null,
        targets: ((t && t.items) || []).map((it) => [touch.targetId(it), it.rect, it.kind]),
      };
    }),
  }, stable)).digest("hex").slice(0, 12);
  return { manifest, assetBase, pages, canvas, place, urls, layout };
}

/** One page's image as two stacked layers: mmPagePrev<i> (on top, normally
 * transparent) holds the OLD picture while mmPage<i> loads the new one,
 * then fades out - never an empty frame. The chain: prev loads the old URL
 * -> its onLoad hands the page the new URL (mmNext) -> the page's onLoad
 * fades prev. inPlaceUpdate also sets the page directly after a delay, so
 * a device that never fires onLoad still updates (only less smoothly). */
function pageImages(view, i) {
  const { place, canvas, urls } = view;
  const box = {
    type: "Image", position: "absolute",
    left: place.ox, top: place.oy, width: canvas.width * place.scale, height: canvas.height * place.scale,
    scale: "fill",
  };
  return [
    { ...box, id: PAGE_ID + i, source: urls[i],
      onLoad: [{ type: "AnimateItem", componentId: PREV_ID + i, duration: FADE_MS, value: [{ property: "opacity", to: 0 }] }] },
    { ...box, id: PREV_ID + i, source: "", opacity: 0, bind: [{ name: "mmNext", value: "" }],
      onLoad: [{ type: "SetValue", componentId: PAGE_ID + i, property: "source", value: "${mmNext}" }] },
  ];
}

/** Every page as its own layer (pages.js turns between them on the Echo),
 * each: under-overlays, the page image, over-overlays, its touch layer.
 * Display-wide effects fly above all pages, the busy spinner above that.
 * `overrides` are presses the screen sent back that a render may not
 * reflect yet (touch.js); `current` is the page the screen was on. */
function displayScreen(vp, display, paired, overrides, busy, current) {
  const view = displayView(vp, display);
  const { manifest, assetBase, pages, place, canvas } = view;
  const cur = Number.isInteger(Number(current)) && Number(current) >= 0 && Number(current) < pages.length ? Number(current) : 0;
  // what the screen shows, so the skill can tell what changed: version,
  // presses, busy, layout fingerprint, page images, page on screen (all
  // bound on the root, so an in-place update keeps them current)
  const refreshArgs = ["refresh", "${mmVer}", paired.major, paired.minor, "${overrides}", "${mmBusy ? 1 : 0}",
    "${mmLayout}", "${mmPageUrls}", "${mmCur}"];
  let pending = overrides;
  const items = [pagesMod.swipeCatcher(vp)];
  pages.forEach((page, i) => {
    const ov = overlays.pageOverlays(page, {
      place, canvas, assetBase, vp, pageIndex: i, refreshArgs, major: paired.major, minor: paired.minor,
      states: touch.applyOverrides(page, pending).states, overrides: pending,
    }, i);
    const held = touch.applyOverrides(page, pending);
    const layerItems = [...ov.under];
    if (page && page.image) layerItems.push(...pageImages(view, i));
    layerItems.push(...ov.over);
    layerItems.push(...touch.touchComponents({
      page, pageIndex: i, place, assetBase, states: held.states, gestures: manifest.gestures,
      refreshArgs, major: paired.major, minor: paired.minor,
    }));
    items.push(pagesMod.layer(i, cur, vp, layerItems));
  });
  const held = allHeld(pages, overrides);
  items.push(...effects.displayEffects(manifest.effects || [], { place, canvas, assetBase, vp }));
  // busy spinner on top of everything, centred on the screen; a swipe
  // shows the calendar's own instead (touch.js), never both
  items.push(spinner(vp.w / 2, vp.h / 2, place.len(SPINNER_PX), "${mmBusy && mmSwiping == '' ? 1 : 0}"));
  return directive("display", doc(items, DISPLAY_TICK_MS, refreshArgs, held, busy === true, {
    extraBinds: [
      { name: "mmVer", value: String(display.version) },
      { name: "mmLayout", value: view.layout },
      { name: "mmPageUrls", value: view.urls.join("|") },
    ].concat(pagesMod.rootBinds(pages, cur, manifest.gestures)),
    commands: pagesMod.commandDefinitions(vp.w, vp.h),
    onMount: [{ type: "MmRotate" }],
  }));
}

/** Every checkbox a page carries: its own targets and the boxes riding
 * its scroll strips (overlay-scroll.js). */
function strips(page) {
  return ((page && page.overlays) || []).map((o, oi) => ({ o, oi })).filter(({ o }) => o && o.type === "scroll");
}
function allTargets(page) {
  const items = ((page && page.targets && page.targets.items) || []).slice();
  for (const { o } of strips(page)) items.push(...(Array.isArray(o.boxes) ? o.boxes : []));
  return { targets: { items } };
}

/** The pending presses still to hold across every page. */
function allHeld(pages, overrides) {
  const keep = new Set();
  for (const page of pages) {
    const h = touch.applyOverrides(allTargets(page), overrides).overrides;
    for (const part of h.split(",")) if (part) keep.add(part);
  }
  return keep.size ? [...keep].join(",") + "," : "";
}

/** The new render as an update to the screen already up, or null when the
 * layout differs (then a full displayScreen is needed). `shown` is what
 * the screen reported: { layout, url } (url: the page URLs, "|"-joined). */
function inPlaceUpdate(vp, display, paired, overrides, busy, shown) {
  const view = displayView(vp, display);
  if (!shown || !shown.layout || shown.layout !== view.layout) return null;
  const root = (property, value) => ({ type: "SetValue", componentId: touch.ROOT_ID, property, value });
  const cmds = [
    root("mmVer", String(display.version)),
    root("overrides", allHeld(view.pages, overrides)),
    root("mmBusy", busy === true),
    root("mmSwiping", ""), // a swipe's result has arrived
  ];
  const shownUrls = String(shown.url || "").split("|");
  view.pages.forEach((page, p) => {
    const held = touch.applyOverrides(page, overrides);
    const items = (page && page.targets && page.targets.items) || [];
    items.forEach((it, i) => {
      const id = touch.targetId(it);
      if (id) cmds.push({ type: "SetValue", componentId: touch.boxId(p, id), property: "mmTicked", value: held.states[i] === true });
    });
    for (const { o, oi } of strips(page)) {
      const states = touch.applyOverrides({ targets: { items: o.boxes } }, overrides).states;
      for (const { index } of scroll.pressable(o)) {
        cmds.push({ type: "SetValue", componentId: scroll.boxId("p" + p + "o" + oi, index), property: "mmTicked", value: states[index] === true });
      }
    }
    const url = view.urls[p];
    if (url && url !== shownUrls[p]) {
      cmds.push(
        { type: "SetValue", componentId: PREV_ID + p, property: "mmNext", value: url },
        { type: "SetValue", componentId: PREV_ID + p, property: "opacity", value: 1 },
        { type: "SetValue", componentId: PREV_ID + p, property: "source", value: shownUrls[p] || url },
        // fallback if onLoad never fires: switch and clear after a moment
        { type: "Sequential", sequencer: "pageswap" + p, commands: [
          { type: "Idle", delay: 1500 },
          { type: "SetValue", componentId: PAGE_ID + p, property: "source", value: url },
          { type: "Idle", delay: 1500 },
          { type: "SetValue", componentId: PREV_ID + p, property: "opacity", value: 0 },
        ] },
      );
    }
  });
  cmds.push(root("mmPageUrls", view.urls.join("|")));
  return { type: "Alexa.Presentation.APL.ExecuteCommands", token: "display", commands: cmds };
}

/** Turn the busy spinner on the display screen on or off without a
 * redraw (ExecuteCommands against the screen's "display" token); on
 * carries the Roku's 75s watchdog. */
function busyCommands(on) {
  const set = (v) => ({ type: "SetValue", componentId: touch.ROOT_ID, property: "mmBusy", value: v });
  const cmds = [set(on)];
  if (on) cmds.push({ type: "Sequential", sequencer: "busywatch", commands: [{ type: "Idle", delay: require("./spinner").WATCHDOG_MS }, set(false)] });
  return { type: "Alexa.Presentation.APL.ExecuteCommands", token: "display", commands: cmds };
}

module.exports = { viewportDp, placement, pairingScreen, displayScreen, busyCommands, inPlaceUpdate, displayView };
