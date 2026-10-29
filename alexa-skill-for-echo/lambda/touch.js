// Touch: the Echo's version of InteractionLayer.brs. The Roku steers a
// pointer and presses OK; the Echo is touched where the thing is. What
// responds is the same set the Roku acts on (MANIFEST.md targets/regions):
//
//   checkboxes (page `targets`) - the render blanks them out of the still,
//     so the device draws them. A press ticks the box AT ONCE and sends
//     /interact type=tap at the box centre with the task's payload id.
//     The tick is held until a render agrees (`overrides`, below).
//   calendar swipe areas (page `regions`, kind "calendar") - a vertical
//     drag sends swipeup / swipedown, when the user allows calendar
//     scrolling (manifest `gestures.calendarScroll`).
//
// A press elsewhere does nothing, as on the Roku. After any touch the
// screen checks for the result every 1.5s for 15s (the `fastcheck`
// sequencer) instead of waiting for the 10s heartbeat.
//
// overrides: the Roku keeps a press-time state per task id and draws it
// over any render that still shows the old state, until a render agrees
// (resolveChecked). Here the skill keeps no state, so the screen carries
// it: "id:1:utcMs,id:0:utcMs," in a variable bound on the root container,
// sent back with every refresh; the skill re-applies entries the manifest
// does not reflect yet (applyOverrides) and drops agreed or stale ones.

const { spinnerRef, SIZE_PX: SPINNER_PX } = require("./spinner");

// a vertical drag: more up/down than sideways
const VERTICAL = "Math.abs(event.component.y - mmDownY) >= Math.abs(event.component.x - mmDownX)";

const ROOT_ID = "mmRoot";
const FAST_MS = 1500;
const FAST_REPEATS = 10;
const OVERRIDE_HOLD_MS = 180000; // a press the portal never confirms is dropped (InteractionLayer: 180s)
const SWIPE_MIN_DP = 40;
// one swipe in flight (InteractionLayer swipeLock): the next is taken
// once the swipe's render lands (apl.inPlaceUpdate on an imageOnly
// manifest clears mmSwipeAt) or after this - a second swipe sent while
// the first renders made the portal recompute from the same start
const SWIPE_LOCK_MS = 8000;
const BUSY_MAX_MS = 15000; // = the fast checks; a redraw that never comes must not leave it up
const PAD = 16; // canvas px of extra finger room around a checkbox (Roku highlight: 10)

/** Parse "id:1:t,id:0:t," -> Map id -> { checked, t }; keeps each id's latest. */
function parseOverrides(s) {
  const m = new Map();
  for (const part of String(s || "").split(",")) {
    const [id, c, t] = part.split(":");
    if (!id || (c !== "0" && c !== "1")) continue;
    const ts = Number(t) || 0;
    const prev = m.get(id);
    if (!prev || ts >= prev.t) m.set(id, { checked: c === "1", t: ts });
  }
  return m;
}

/** The component id of a task's checkbox, so an update can set it in place. */
function boxId(pageIndex, id) {
  return "mmBox" + pageIndex + "_" + id;
}

function targetId(item) {
  const id = item && item.payload && item.payload.id;
  return id == null ? "" : String(id).replace(/[^0-9A-Za-z_-]/g, "");
}

/** Checked state per target after applying still-pending presses; returns
 * the overrides string that should live on the new screen. */
function applyOverrides(page, overridesStr, now = Date.now()) {
  const pending = parseOverrides(overridesStr);
  const items = (page && page.targets && page.targets.items) || [];
  const states = items.map((it) => it.checked === true);
  const keep = [];
  for (const [id, o] of pending) {
    if (now - o.t > OVERRIDE_HOLD_MS) continue;
    const i = items.findIndex((it) => targetId(it) === id);
    if (i < 0) continue; // the task left the page (a completed chore): nothing to hold
    if (states[i] === o.checked) continue; // the render agrees: done
    states[i] = o.checked;
    keep.push(id + ":" + (o.checked ? 1 : 0) + ":" + o.t);
  }
  return { states, overrides: keep.length ? keep.join(",") + "," : "" };
}

/** The commands a screen defines for itself (apl.js), so the package's
 * layouts can talk to the skill without knowing the screen:
 *   MmTell(mmK, mmP, mmX, mmY, mmT)  /interact: kind, page, canvas x/y,
 *                                    target id, plus what the screen shows
 *   MmRefresh                        one refresh, as the heartbeat sends */
function screenCommands(refreshArgs, major, minor) {
  return {
    MmTell: {
      parameters: ["mmK", "mmP", "mmX", "mmY", "mmT"],
      commands: [{ type: "SendEvent", arguments: ["touch", "${mmK}", "${mmP}", "${mmX}", "${mmY}", "${mmT}", major, minor,
        refreshArgs[1], "${overrides}", refreshArgs[6], refreshArgs[7], refreshArgs[8], refreshArgs[10]] }],
    },
    MmRefresh: { parameters: [], commands: [{ type: "SendEvent", arguments: refreshArgs }] },
  };
}

/** The package's (apl-package.js): MmFastCheck, after a touch: quick
 * refresh checks, carrying the presses. Restarting it (a second touch)
 * replaces the running one on its sequencer. */
function commandDefinitions() {
  return {
    MmFastCheck: {
      parameters: [],
      commands: [{
        type: "Sequential",
        sequencer: "fastcheck",
        repeatCount: FAST_REPEATS - 1,
        commands: [{ type: "Idle", delay: FAST_MS }, { type: "MmRefresh" }],
      }],
    },
  };
}

/** APL components for the page's checkboxes and calendar areas. */
function touchComponents(ctx) {
  const { page, pageIndex, place, assetBase, states, gestures, refreshArgs, major, minor, listIndex } = ctx;
  const out = []; // checkboxes, drawn above...
  const under = []; // ...the calendar areas, so a box always wins a press
  const t = page && page.targets;
  const sprites = t && t.sprites;
  if (t && Array.isArray(t.items) && sprites && sprites.empty && sprites.checked) {
    // each box is an instance of the MmBox layout (layouts() below): only
    // its place and identity travel per box (~250 bytes instead of ~1.3 KB
    // - 16 boxes alone were 20 KB of a 70 KB screen); the sprite URLs are
    // bound once on this page's box layer
    const boxes = [];
    t.items.forEach((it, i) => {
      if (!it.rect) return;
      const id = targetId(it);
      const box = place.rect(it.rect);
      const pad = place.len(PAD);
      boxes.push({
        type: "MmBox",
        ...(id ? { id: boxId(pageIndex, id) } : {}),
        position: "absolute",
        left: r2(box.x - pad), top: r2(box.y - pad), width: r2(box.w + pad * 2), height: r2(box.h + pad * 2),
        mmT0: states[i] === true, mmTid: id, mmPg: String(pageIndex),
        mmCx: String(Math.round(it.rect.x + it.rect.w / 2)), mmCy: String(Math.round(it.rect.y + it.rect.h / 2)),
        mmW: r2(box.w), mmH: r2(box.h), mmPad: r2(pad),
        // its list (celebrations.lists) and its centre in dp, for the burst
        mmL: listIndex ? listIndex(it) : -1, mmBx: r2(box.x + box.w / 2), mmBy: r2(box.y + box.h / 2),
      });
    });
    out.push({
      type: "Container", position: "absolute", left: 0, top: 0, width: "100%", height: "100%",
      bind: [{ name: "mmBoxE", value: assetBase + sprites.empty }, { name: "mmBoxC", value: assetBase + sprites.checked }],
      items: boxes,
    });
  }
  // calendar areas draw only their spinner here; the swipe itself is
  // read by the page layer (calendarGestures below)
  for (const c of calendars(ctx)) {
    under.push({
      type: "Container", position: "absolute", left: c.r.x, top: c.r.y, width: c.r.w, height: c.r.h,
      items: [spinnerRef(c.r.w / 2, c.r.h / 2, place.len(SPINNER_PX), "${mmSwiping == '" + c.regId + "' ? 1 : 0}")],
    });
  }
  return under.concat(out);
}

/** The page's calendar areas (dp rect, region id, canvas centre), when the
 * user allows calendar scrolling. */
function calendars(ctx) {
  const { page, place, gestures } = ctx;
  if (!(gestures && gestures.calendarScroll === true)) return [];
  const regions = Array.isArray(page && page.regions) ? page.regions : [];
  return regions.filter((reg) => reg.kind === "calendar" && reg.rect).map((reg) => ({
    r: place.rect(reg.rect),
    regId: String(reg.id == null ? "" : reg.id).replace(/[^0-9A-Za-z_-]/g, ""),
    cx: Math.round(reg.rect.x + reg.rect.w / 2),
    cy: Math.round(reg.rect.y + reg.rect.h / 2),
  }));
}

/** Calendar swipes, read by the page layer (pages.layer) - not by a
 * TouchWrapper of their own. On the Echo only one wrapper gets a drag:
 * with the page layer a wrapper (for page swipes) the calendar's own
 * wrapper inside it never heard a swipe again (2026-10-28). So the page
 * layer sees every drag and sorts it: sideways anywhere -> page turn
 * (pages.js); up/down starting on a calendar -> that calendar's
 * swipeup/swipedown. Returns the extra binds and handlers, or null. */
function calendarGestures(ctx) {
  const { pageIndex } = ctx;
  const cals = calendars(ctx);
  if (!cals.length) return null;
  const setSwiping = (v) => ({ type: "SetValue", componentId: ROOT_ID, property: "mmSwiping", value: v });
  // busy: the Roku spinner centred on the calendar from the swipe until
  // the redraw replaces it (InteractionLayer busyAt) - a swipe has no
  // instant local effect, and without it the screen looked frozen (Dave
  // 2026-10-27). mmSwiping also keeps the screen-centre spinner off.
  const send = (c, kind) => [
    setSwiping(c.regId),
    { type: "Sequential", sequencer: "busyhide", commands: [{ type: "Idle", delay: BUSY_MAX_MS }, setSwiping("")] },
    { type: "MmTell", mmK: kind, mmP: String(pageIndex), mmX: String(c.cx), mmY: String(c.cy), mmT: c.regId },
    { type: "MmFastCheck" },
    { type: "MmRestartDwell" },
  ];
  const inside = (c) => "mmDownX >= " + c.r.x + " && mmDownX < " + (c.r.x + c.r.w) +
    " && mmDownY >= " + c.r.y + " && mmDownY < " + (c.r.y + c.r.h);
  const up = "mmDownY - event.component.y > " + SWIPE_MIN_DP;
  const down = "event.component.y - mmDownY > " + SWIPE_MIN_DP;
  return {
    // the lock (root mmSwipeAt, SWIPE_LOCK_MS) also stops one finger
    // swipe reaching the skill 2-3 times, as it did on the Echo Show 15
    binds: [{ name: "mmSwipe", value: "" }, { name: "mmReg", value: -1 }],
    onDown: [{ type: "SetValue", property: "mmSwipe", value: "" }, { type: "SetValue", property: "mmReg", value: -1 }],
    // onUp runs in FAST mode, where SendEvent is ignored (a first version
    // sent from onUp and no swipe reached the skill): it only records;
    // onPress (normal mode, right after the finger lifts) sends.
    // Finger moves UP -> swipeup (the portal's own gesture names).
    onUp: cals.flatMap((c, i) => [
      { type: "SetValue", property: "mmReg", when: "${" + VERTICAL + " && " + inside(c) + "}", value: i },
      { type: "SetValue", property: "mmSwipe", when: "${" + VERTICAL + " && " + inside(c) + " && " + up + "}", value: "swipeup" },
      { type: "SetValue", property: "mmSwipe", when: "${" + VERTICAL + " && " + inside(c) + " && " + down + "}", value: "swipedown" },
    ]),
    onPress: [
      {
        type: "Sequential",
        when: "${mmSwipe != '' && (mmSwipeAt == 0 || utcTime - mmSwipeAt > " + SWIPE_LOCK_MS + ")}",
        commands: [{ type: "SetValue", componentId: ROOT_ID, property: "mmSwipeAt", value: "${utcTime}" }].concat(cals.flatMap((c, i) => [
          { type: "Sequential", when: "${mmReg == " + i + " && mmSwipe == 'swipeup'}", commands: send(c, "swipeup") },
          { type: "Sequential", when: "${mmReg == " + i + " && mmSwipe == 'swipedown'}", commands: send(c, "swipedown") },
        ])),
      },
      { type: "SetValue", property: "mmSwipe", value: "" },
    ],
  };
}

const r2 = (v) => Math.round(v * 100) / 100;

/** The checkbox, defined once in the package (apl-package.js): a press
 * ticks the box at once, runs the screen's MmAfterTick (its celebration,
 * apl.js), records the press for the root's held `overrides`, tells the
 * portal (the screen's MmTell), checks for the result quickly and
 * restarts the page's dwell.
 * Instances carry mmT0 (ticked at build), mmTid (task id), mmPg/mmCx/mmCy
 * (page, canvas centre for /interact), mmW/mmH/mmPad (the drawn box) and
 * mmL/mmBx/mmBy (its list number and dp centre, for the celebration).
 * The sprite URLs come from mmBoxE/mmBoxC bound on the page's box layer. */
function layouts() {
  return {
    MmBox: {
      parameters: ["mmT0", "mmTid", "mmPg", "mmCx", "mmCy", "mmW", "mmH", "mmPad", "mmL", "mmBx", "mmBy"],
      items: [{
        type: "TouchWrapper",
        // NOT "checked": that is a built-in state property of every APL
        // component, and SetValue changed it instead of this variable -
        // the box never flipped on the Echo (2026-10-27)
        bind: [{ name: "mmTicked", value: "${mmT0}" }],
        item: {
          type: "Container", width: "100%", height: "100%",
          items: [{
            type: "Image", position: "absolute", left: "${mmPad}", top: "${mmPad}", width: "${mmW}", height: "${mmH}",
            source: "${mmTicked ? mmBoxC : mmBoxE}", scale: "fill",
          }],
        },
        onPress: [
          // tick now, ask later
          { type: "SetValue", property: "mmTicked", value: "${!mmTicked}" },
          // the celebration, when hosted art switches it on (apl.js)
          { type: "MmAfterTick", mmL: "${mmL}", mmBx: "${mmBx}", mmBy: "${mmBy}", mmTicked: "${mmTicked}" },
          {
            type: "SetValue", componentId: ROOT_ID, property: "overrides", when: "${mmTid != ''}",
            value: "${overrides + mmTid + ':' + (mmTicked ? 1 : 0) + ':' + utcTime + ','}",
          },
          { type: "MmTell", mmK: "tap", mmP: "${mmPg}", mmX: "${mmCx}", mmY: "${mmCy}", mmT: "${mmTid}" },
          { type: "MmFastCheck" },
          // a page being worked on is not turned away (pages.js)
          { type: "MmRestartDwell" },
        ],
      }],
    },
  };
}

module.exports = {
  ROOT_ID, touchComponents, calendarGestures, applyOverrides, parseOverrides, targetId, boxId, layouts, screenCommands, commandDefinitions,
};
