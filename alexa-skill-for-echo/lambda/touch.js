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

const { spinner, SIZE_PX: SPINNER_PX } = require("./spinner");

const ROOT_ID = "mmRoot";
const FAST_MS = 1500;
const FAST_REPEATS = 10;
const OVERRIDE_HOLD_MS = 30000; // a press the portal never confirms is dropped
const SWIPE_MIN_DP = 40;
const SWIPE_GAP_MS = 1200;
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

/** After a touch: quick refresh checks, carrying the presses. Restarting
 * it (a second touch) replaces the running one on its sequencer. */
function fastCheck(refreshArgs) {
  return {
    type: "Sequential",
    sequencer: "fastcheck",
    repeatCount: FAST_REPEATS - 1,
    commands: [
      { type: "Idle", delay: FAST_MS },
      { type: "SendEvent", arguments: refreshArgs },
    ],
  };
}

/** APL components for the page's checkboxes and calendar areas. */
function touchComponents(ctx) {
  const { page, pageIndex, place, assetBase, states, gestures, refreshArgs, major, minor } = ctx;
  const out = []; // checkboxes, drawn above...
  const under = []; // ...the calendar areas, so a box always wins a press
  const t = page && page.targets;
  const sprites = t && t.sprites;
  if (t && Array.isArray(t.items) && sprites && sprites.empty && sprites.checked) {
    t.items.forEach((it, i) => {
      if (!it.rect) return;
      const id = targetId(it);
      const box = place.rect(it.rect);
      const pad = place.len(PAD);
      const cx = Math.round(it.rect.x + it.rect.w / 2);
      const cy = Math.round(it.rect.y + it.rect.h / 2);
      out.push({
        type: "TouchWrapper",
        position: "absolute",
        left: box.x - pad, top: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2,
        bind: [
          // NOT "checked": that is a built-in state property of every APL
          // component, and SetValue changed it instead of this variable -
          // the box never flipped on the Echo (2026-10-27)
          { name: "mmTicked", value: states[i] === true },
          { name: "mmEmpty", value: assetBase + sprites.empty },
          { name: "mmChecked", value: assetBase + sprites.checked },
        ],
        item: {
          type: "Container", width: "100%", height: "100%",
          items: [{
            type: "Image", position: "absolute", left: pad, top: pad, width: box.w, height: box.h,
            source: "${mmTicked ? mmChecked : mmEmpty}", scale: "fill",
          }],
        },
        onPress: [
          // tick now, ask later
          { type: "SetValue", property: "mmTicked", value: "${!mmTicked}" },
          ...(id ? [{
            type: "SetValue", componentId: ROOT_ID, property: "overrides",
            value: "${overrides + '" + id + ":' + (mmTicked ? 1 : 0) + ':' + utcTime + ','}",
          }] : []),
          { type: "SendEvent", arguments: ["touch", "tap", String(pageIndex), String(cx), String(cy), id, major, minor] },
          fastCheck(refreshArgs),
        ],
      });
    });
  }
  const regions = Array.isArray(page && page.regions) ? page.regions : [];
  if (gestures && gestures.calendarScroll === true) {
    for (const reg of regions) {
      if (reg.kind !== "calendar" || !reg.rect) continue;
      const r = place.rect(reg.rect);
      const cx = Math.round(reg.rect.x + reg.rect.w / 2);
      const cy = Math.round(reg.rect.y + reg.rect.h / 2);
      // busy: the Roku spinner centred on the calendar from the swipe
      // until the redraw replaces the screen (InteractionLayer busyAt) - a
      // swipe has no instant local effect, and without it the screen
      // looked frozen (Dave 2026-10-27). mmSwiping also keeps the
      // screen-centre busy spinner off meanwhile.
      const regId = String(reg.id == null ? "" : reg.id).replace(/[^0-9A-Za-z_-]/g, "");
      const setSwiping = (v) => ({ type: "SetValue", componentId: ROOT_ID, property: "mmSwiping", value: v });
      const send = (kind) => [
        setSwiping(regId),
        { type: "Sequential", sequencer: "busyhide", commands: [{ type: "Idle", delay: BUSY_MAX_MS }, setSwiping("")] },
        { type: "SendEvent", arguments: ["touch", kind, String(pageIndex), String(cx), String(cy), regId, major, minor] },
        fastCheck(refreshArgs),
      ];
      // onDown/onUp run in FAST mode, where SendEvent is ignored - a first
      // version sent from onUp and no swipe ever reached the skill. So
      // onUp only records the direction; onPress (normal mode, runs right
      // after onUp when the finger lifts inside the area) sends it.
      under.push({
        type: "TouchWrapper",
        position: "absolute", left: r.x, top: r.y, width: r.w, height: r.h,
        // mmLastSent: one finger swipe reached the skill 2-3 times within a
        // second on the Echo Show 15 (2026-10-27), each moving the calendar;
        // a second swipe inside SWIPE_GAP_MS is dropped
        bind: [{ name: "mmDownY", value: 0 }, { name: "mmSwipe", value: "" }, { name: "mmLastSent", value: 0 }],
        item: {
          type: "Container", width: "100%", height: "100%",
          items: [spinner(r.w / 2, r.h / 2, place.len(SPINNER_PX), "${mmSwiping == '" + regId + "' ? 1 : 0}")],
        },
        onDown: [
          { type: "SetValue", property: "mmDownY", value: "${event.component.y}" },
          { type: "SetValue", property: "mmSwipe", value: "" },
        ],
        // finger moves UP -> swipeup (the portal's own gesture names)
        onUp: [
          { type: "SetValue", property: "mmSwipe", when: "${mmDownY - event.component.y > " + SWIPE_MIN_DP + "}", value: "swipeup" },
          { type: "SetValue", property: "mmSwipe", when: "${event.component.y - mmDownY > " + SWIPE_MIN_DP + "}", value: "swipedown" },
        ],
        onPress: [
          {
            type: "Sequential",
            when: "${mmSwipe != '' && utcTime - mmLastSent > " + SWIPE_GAP_MS + "}",
            commands: [
              { type: "SetValue", property: "mmLastSent", value: "${utcTime}" },
              { type: "Sequential", when: "${mmSwipe == 'swipeup'}", commands: send("swipeup") },
              { type: "Sequential", when: "${mmSwipe == 'swipedown'}", commands: send("swipedown") },
            ],
          },
          { type: "SetValue", property: "mmSwipe", value: "" },
        ],
      });
    }
  }
  return under.concat(out);
}

module.exports = { ROOT_ID, touchComponents, applyOverrides, parseOverrides, targetId };
