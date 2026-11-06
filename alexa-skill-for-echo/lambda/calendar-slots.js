// Calendar cells that scroll (a day with more events than fit: a
// `scroll` overlay with a `date`), as a fixed set of slots the screen
// keeps and refills in place.
//
// A month swipe changes which days scroll. As MmStrip instances
// (overlay-scroll.js) that changed the layout, and every swipe sent the
// Echo a whole new screen: the background slideshow and everything else
// restarted, where the Roku only changes the month (Dave, 2026-11-03).
// APL cannot add components to a screen that is up, and a Container's
// `data` is read once, but a component's bound value can be set and the
// properties drawn from it follow (checked in the APL authoring tool). So
// a page with a calendar carries SLOTS slots (more in steps of SLOTS when
// a month needs them); the layout counts the slots, not the days, and a
// new month is SetValue on each slot plus a fresh AnimateItem.
//
// A slot holds one strip with one segment and no checkboxes, which is
// what a calendar cell is; any other dated strip stays an MmStrip.
//
// The screen keeps a key of what its slots hold (root mmCalKey, reported
// with every refresh and touch), so an update refills them only when the
// cells changed - a refill restarts their scrolling.

const crypto = require("crypto");
const { motion } = require("./overlay-scroll");

const SLOTS = 8;

const r2 = (v) => Math.round(v * 100) / 100;

/** A dated strip a slot can show. */
function isSlotStrip(o) {
  return !!(o && o.type === "scroll" && o.date && o.rect && !(Array.isArray(o.boxes) && o.boxes.length) &&
    Array.isArray(o.segments) && o.segments.length === 1 && o.segments[0] && typeof o.segments[0].file === "string");
}

const hasCalendar = (page) => ((page && page.regions) || []).some((r) => r && r.kind === "calendar");

/** The page with its slot cells moved from `overlays` to `calCells`. */
function separate(page) {
  if (!page || !Array.isArray(page.overlays)) return page;
  return { ...page, overlays: page.overlays.filter((o) => !isSlotStrip(o)), calCells: page.overlays.filter(isSlotStrip) };
}
const slotStrips = (page) => (page && page.calCells) || ((page && page.overlays) || []).filter(isSlotStrip);

/** How many slots the page carries: none without a calendar, else
 * enough for this month in steps of SLOTS. Layout. */
function slotCount(page) {
  const n = slotStrips(page).length;
  if (!n && !hasCalendar(page)) return 0;
  return Math.max(SLOTS, Math.ceil(n / SLOTS) * SLOTS);
}

/** What each slot shows (dp): the window, the strip and its motion, the
 * picture; an unused slot is { on: 0 }. */
function values(page, place) {
  const s = place.len(1);
  const vals = slotStrips(page).map((o) => {
    const m = motion(o);
    const win = place.rect(o.rect);
    return {
      on: 1, l: win.x, t: win.y, w: win.w, h: win.h,
      sw: r2(m.stripW * s), sh: r2(m.stripH * s), f: r2(m.fromY * s), to: r2(m.toY * s), ms: m.ms, lp: m.loop ? 1 : 0,
      src: o.segments[0].file,
    };
  });
  const n = slotCount(page);
  while (vals.length < n) vals.push({ on: 0 });
  return vals;
}

const slotId = (pageIndex, k) => "mmCal" + pageIndex + "s" + k;

/** The page's slot instances (package layout MmCalSlot). */
function build(page, pageIndex, place) {
  return values(page, place).map((v, k) => ({ type: "MmCalSlot", id: slotId(pageIndex, k), mmId: slotId(pageIndex, k), mmV: v }));
}

/** The key of what every page's slots hold (root mmCalKey). */
function key(pages, place) {
  const all = pages.map((p) => values(p, place));
  if (!all.some((v) => v.length)) return "";
  return crypto.createHash("sha1").update(JSON.stringify(all)).digest("hex").slice(0, 10);
}

/** The scroll of a slot's strip, from the top: its own sequencer, as the
 * main one is cut short by every touch. */
const run = (id, f, to, ms, lp) => ({
  type: "AnimateItem", componentId: id + "S", sequencer: "cal" + id, duration: ms, easing: "linear", repeatCount: lp,
  value: [{ property: "transform", from: [{ translateY: f }], to: [{ translateY: to }] }],
});

/** Refill the page's slots in place (apl.js inPlaceUpdate). */
function updateCommands(page, pageIndex, place) {
  const cmds = [];
  values(page, place).forEach((v, k) => {
    const id = slotId(pageIndex, k);
    cmds.push({ type: "SetValue", componentId: id, property: "mmCs", value: v });
    // a used slot scrolls from the top again; an unused one stops
    cmds.push(v.on ? run(id, v.f, v.to, v.ms, v.lp ? 1000000 : 0) : { type: "Idle", delay: 0, sequencer: "cal" + id });
  });
  return cmds;
}

/** The package's slot layout (apl-package.js). The window takes its place
 * and size from the slot's value (mmCs) and is hidden while unused; the
 * strip starts scrolling on mount. */
function layouts() {
  return {
    MmCalSlot: {
      parameters: ["mmId", "mmV"],
      items: [{
        type: "Container",
        bind: [{ name: "mmCs", value: "${mmV}" }],
        position: "absolute", left: "${mmCs.l}", top: "${mmCs.t}", width: "${mmCs.w}", height: "${mmCs.h}",
        display: "${mmCs.on ? 'normal' : 'none'}",
        items: [{
          type: "Container", id: "${mmId}S",
          position: "absolute", left: 0, top: 0, width: "${mmCs.sw}", height: "${mmCs.sh}",
          transform: [{ translateY: "${mmCs.f}" }],
          onMount: [{
            type: "AnimateItem", when: "${mmCs.on}", sequencer: "cal${mmId}", duration: "${mmCs.ms}", easing: "linear",
            repeatCount: "${mmCs.lp ? 1000000 : 0}",
            value: [{ property: "transform", from: [{ translateY: "${mmCs.f}" }], to: [{ translateY: "${mmCs.to}" }] }],
          }],
          items: [{
            type: "Image", position: "absolute", left: 0, top: 0, width: "100%", height: "100%", scale: "fill",
            source: "${mmCs.on ? mmAB + mmCs.src : ''}",
          }],
        }],
      }],
    },
  };
}

module.exports = { SLOTS, isSlotStrip, separate, slotCount, values, build, key, updateCommands, layouts, slotId };
