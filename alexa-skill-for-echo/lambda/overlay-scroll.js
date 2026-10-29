// `scroll` overlay: natively scrolled widget content (calendar cells,
// lists). Port of ScrollOverlay.brs / ScrollOverlayView.swift: the render
// service photographs the cell's content ONCE as a tall transparent strip
// (in <= 2048px segments) and the device does the motion - a linear,
// repeating translation from fromY to toY over durationMs inside the
// clipped window `rect`. (MANIFEST.md "scroll".)
//
// On the Echo the motion is one AnimateItem on the strip's transform,
// started on mount and looping, on its own sequencer: commands on the
// main sequencer are cut short by the next touch, which would freeze the
// strip at its end position.
//
// Checkboxes that live inside the content (`boxes`, strip coordinates)
// ride the strip as TouchWrappers inside it, so they travel with their
// rows and are pressed where they are seen. A press is touch.js's
// checkbox press: tick at once, hold the tick in the root's `overrides`,
// send /interact type=tap with the task's payload id, fast checks, and
// restart the page's dwell. The tap's x/y (only a fallback for the
// portal when the id does not resolve) is the box centre on the canvas
// NOW: the strip offset is worked out from the time since the strip
// started (mmScrollT0) the way tvOS's currentY does, since APL cannot
// read an animation's live value. The same sum ignores a press on a row
// scrolled outside the window (the Roku's itemVisible).
//
// Not ported: the Roku holds the strip while its pointer rests on a box,
// so a moving box can be aimed at. A finger needs no aiming - the box
// under it is pressed - and fast-mode touch handlers cannot stop an
// animation anyway.

const { ROOT_ID, applyOverrides, targetId } = require("./touch");

const DEFAULT_MS = 10000;
const MIN_MS = 100;
const PAD = 16; // canvas px of finger room around a box (touch.js)
// touch.js's fast checks: every 1.5s for 15s after a touch
const FAST_MS = 1500;
const FAST_REPEATS = 10;

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** touch.js fastCheck (not exported there): quick refresh checks on the
 * shared sequencer, so a second touch replaces the running one. */
function fastCheck(refreshArgs) {
  return {
    type: "Sequential",
    sequencer: "fastcheck",
    repeatCount: FAST_REPEATS - 1,
    commands: [{ type: "Idle", delay: FAST_MS }, { type: "SendEvent", arguments: refreshArgs }],
  };
}

/** The strip's motion as numbers, defaults as on the Roku. */
function motion(cfg) {
  const segments = (Array.isArray(cfg.segments) ? cfg.segments : [])
    .filter((s) => s && typeof s.file === "string" && typeof s.h === "number");
  const stripH = num(cfg.stripH, segments.reduce((a, s) => a + s.h, 0));
  return {
    segments,
    stripW: num(cfg.stripW, cfg.rect.w),
    stripH,
    fromY: num(cfg.fromY, 0),
    toY: num(cfg.toY, -stripH),
    ms: Math.max(MIN_MS, num(cfg.durationMs, DEFAULT_MS)),
    loop: cfg.loop !== false,
  };
}

const r2 = (v) => Math.round(v * 100) / 100;

/** APL expression for how far into its motion the strip is now, ms: the
 * strip's translation is then fromY + (toY - fromY) * t / ms. */
function phaseExpr(m) {
  const run = "(elapsedTime - mmScrollT0)";
  return m.loop ? "(" + run + " % " + m.ms + ")" : "Math.min(" + m.ms + ", " + run + ")";
}

/** The stretch of the motion, in ms, during which a box (strip coords)
 * is inside the window: [from, to], or null when it never is. The
 * motion is linear, so it is one interval. */
function visibleSpan(m, b, windowH) {
  const d = m.toY - m.fromY;
  // inside while lo < d * t / ms < hi
  const lo = -(m.fromY + b.y + b.h);
  const hi = windowH - m.fromY - b.y;
  if (d === 0) return lo < 0 && hi > 0 ? [0, m.ms] : null;
  const [a, z] = d < 0 ? [hi, lo] : [lo, hi];
  const from = Math.max(0, (a * m.ms) / d);
  const to = Math.min(m.ms, (z * m.ms) / d);
  return from < to ? [Math.floor(from), Math.ceil(to)] : null;
}

/** APL components for one `scroll` overlay. */
/** The strip's checkboxes that can be pressed - drawn with a rect and
 * passing through the window - with their index in cfg.boxes (component
 * ids use it: boxId). apl.js uses this to set their ticks in place. */
function pressable(cfg) {
  if (!cfg || !cfg.rect || !Array.isArray(cfg.boxes) || !cfg.sprites || !cfg.sprites.empty || !cfg.sprites.checked) return [];
  const m = motion(cfg);
  if (!m.segments.length) return [];
  const out = [];
  cfg.boxes.forEach((b, i) => {
    if (!b || [b.x, b.y, b.w, b.h].some((v) => typeof v !== "number")) return;
    // a row outside the window is not there to be pressed
    const span = visibleSpan(m, b, cfg.rect.h);
    if (span) out.push({ box: b, index: i, span });
  });
  return out;
}

/** Component id of strip checkbox `index` in the overlay with `idPrefix`. */
function boxId(idPrefix, index) {
  return "mm" + idPrefix + "Box" + index;
}

function build(cfg, ctx) {
  if (!cfg || !cfg.rect) return [];
  const m = motion(cfg);
  if (!m.segments.length) return [];
  const { place, assetBase, idPrefix, pageIndex, refreshArgs, major, minor } = ctx;
  const s = place.len(1);
  const win = place.rect(cfg.rect);
  const stripId = "mm" + idPrefix + "Strip";

  // the strip: segments stacked top to bottom, drawn scaled to their
  // canvas size (the PNGs are at output scale)
  const items = [];
  let top = 0;
  for (const seg of m.segments) {
    items.push({
      type: "Image", position: "absolute", left: 0, top: top * s, width: m.stripW * s, height: seg.h * s,
      source: assetBase + seg.file, scale: "fill",
    });
    top += seg.h;
  }

  // checkboxes ride the strip, at their strip position. Each is an
  // instance of the MmSBox layout (layouts() below) carrying only its
  // identity, its centre on the canvas and when it is in the window; the
  // rest (its box in dp, its list) the layout works out from the strip's
  // binds, and a box's own size or list travel only when they differ from
  // the strip's. Dave's chores + to-do strips carry 113 boxes: written out
  // in full they made a 245 KB screen the Echo never took, and at ~220
  // bytes a box the screen still went over the cap as tasks were added
  // (2026-10-28). Now ~120 bytes a box.
  const sprites = cfg.sprites;
  const boxes = Array.isArray(cfg.boxes) ? cfg.boxes : [];
  const hasBoxes = !!(sprites && sprites.empty && sprites.checked && boxes.length);
  const usual = (vals) => {
    const n = new Map();
    vals.forEach((v) => n.set(v, (n.get(v) || 0) + 1));
    return [...n.entries()].sort((x, y) => y[1] - x[1])[0][0];
  };
  const shown = hasBoxes ? pressable(cfg) : [];
  const lists = shown.map(({ box: b }) => (ctx.listIndex ? ctx.listIndex(b) : -1));
  const bw = shown.length ? usual(shown.map(({ box: b }) => b.w)) : 0;
  const bh = shown.length ? usual(shown.map(({ box: b }) => b.h)) : 0;
  const bl = shown.length ? usual(lists) : -1;
  if (hasBoxes) {
    // the presses the screen still holds apply here as to page targets
    const { states } = applyOverrides({ targets: { items: boxes } }, ctx.overrides);
    shown.forEach(({ box: b, index: i, span }, k) => {
      // a screen over the size cap (apl.js LITE): the tick is drawn, at
      // about half the bytes, but cannot be pressed while it scrolls
      const where = {
        ...(states[i] === true ? { mmT0: true } : {}),
        // the box centre on the canvas: x fixed, y at the strip's start
        mmX: r2(cfg.rect.x + b.x + b.w / 2), mmY: r2(cfg.rect.y + m.fromY + b.y + b.h / 2),
        ...(b.w !== bw ? { mmW: r2(b.w * s) } : {}),
        ...(b.h !== bh ? { mmH: r2(b.h * s) } : {}),
      };
      // a screen over the size cap (apl.js LITE): the tick is drawn, in
      // fewer bytes, but cannot be pressed while it scrolls
      if (ctx.lite >= 1) return items.push({ type: "MmSTick", ...where });
      items.push({
        type: "MmSBox", id: boxId(idPrefix, i), mmTid: targetId(b) || "", mmA: span[0], mmZ: span[1], ...where,
        ...(lists[k] !== bl ? { mmL: lists[k] } : {}),
      });
    });
  }

  const from = [{ translateY: m.fromY * s }];
  const strip = {
    type: "Container",
    id: stripId,
    position: "absolute", left: 0, top: 0, width: m.stripW * s, height: m.stripH * s,
    transform: from,
    // the box art once for all of the strip's boxes
    // and what its MmSBox boxes read: the motion (for where a box is
    // now), the page, the padding, canvas -> dp for the celebration
    bind: [{ name: "mmScrollT0", value: 0 }].concat(hasBoxes ? [
      { name: "mmSEmpty", value: assetBase + sprites.empty },
      { name: "mmSChecked", value: assetBase + sprites.checked },
      { name: "mmSMs", value: m.ms }, { name: "mmSLp", value: m.loop },
      { name: "mmSPer", value: Number(((m.toY - m.fromY) / m.ms).toPrecision(6)) }, // canvas px a ms
      { name: "mmSPg", value: String(pageIndex) }, { name: "mmSPad", value: r2(PAD * s) },
      // canvas -> dp (place), and where a box's centre sits in the strip
      { name: "mmSS", value: place.scale }, { name: "mmSOx", value: r2(place.ox) }, { name: "mmSOy", value: r2(place.oy) },
      { name: "mmSRx", value: r2(cfg.rect.x) }, { name: "mmSRy", value: r2(cfg.rect.y + m.fromY) },
      // the usual box size (dp) and list, for boxes that do not say
      { name: "mmSBw", value: r2(bw * s) }, { name: "mmSBh", value: r2(bh * s) }, { name: "mmSL", value: bl },
    ] : []),
    onMount: [{
      type: "Sequential",
      sequencer: "scroll" + idPrefix,
      commands: [
        // when the motion started, for the press position above
        { type: "SetValue", componentId: stripId, property: "mmScrollT0", value: "${elapsedTime}" },
        {
          type: "AnimateItem", componentId: stripId, duration: m.ms, easing: "linear",
          repeatCount: m.loop ? 1000000 : 0,
          value: [{ property: "transform", from, to: [{ translateY: m.toY * s }] }],
        },
      ],
    }],
    items,
  };
  // the window clips the strip to the cell (the Roku's clippingRect; see
  // overlay-gif.js on APL clipping)
  return [{
    type: "Container",
    position: "absolute", left: win.x, top: win.y, width: win.w, height: win.h,
    items: [strip],
  }];
}


/** How far into its motion the strip is now, ms, from inside an MmSBox
 * (reads the strip's binds): phaseExpr with the numbers bound. */
const PHASE = "(mmSLp ? (elapsedTime - mmScrollT0) % mmSMs : Math.min(mmSMs, elapsedTime - mmScrollT0))";
/** The box centre's canvas y now. */
const CY = "Math.round(mmY + mmSPer * " + PHASE + ")";

/** The strip checkbox, defined once in the document (apl.js). A press is
 * touch.js's checkbox press; ignored while the row is outside the window
 * (mmA..mmZ, visibleSpan); the tap's y is where the box is NOW. */
function layouts(refreshArgs, major, minor, celebrate) {
  const size = [{ name: "mmT0", default: false }, { name: "mmW", default: -1 }, { name: "mmH", default: -1 }];
  return {
    // the not-pressable tick of a screen over the size cap
    MmSTick: {
      parameters: ["mmX", "mmY"].concat(size),
      items: [{
        type: "Image",
        bind: [{ name: "mmBw", value: "${mmW < 0 ? mmSBw : mmW}" }, { name: "mmBh", value: "${mmH < 0 ? mmSBh : mmH}" }],
        position: "absolute",
        left: "${(mmX - mmSRx) * mmSS - mmBw / 2}", top: "${(mmY - mmSRy) * mmSS - mmBh / 2}", width: "${mmBw}", height: "${mmBh}",
        source: "${mmT0 ? mmSChecked : mmSEmpty}", scale: "fill",
      }],
    },
    MmSBox: {
      parameters: ["mmTid", "mmA", "mmZ", "mmX", "mmY"].concat(size, [{ name: "mmL", default: -9 }]),
      items: [{
        type: "TouchWrapper",
        // mmTicked, never "checked" (touch.js); mmBw/mmBh the box in dp,
        // mmLi its list - the strip's unless the box says
        bind: [
          { name: "mmTicked", value: "${mmT0}" },
          { name: "mmBw", value: "${mmW < 0 ? mmSBw : mmW}" },
          { name: "mmBh", value: "${mmH < 0 ? mmSBh : mmH}" },
          { name: "mmLi", value: "${mmL == -9 ? mmSL : mmL}" },
        ],
        // the box and a finger's room around it, at its strip position
        position: "absolute",
        left: "${(mmX - mmSRx) * mmSS - mmBw / 2 - mmSPad}", top: "${(mmY - mmSRy) * mmSS - mmBh / 2 - mmSPad}",
        width: "${mmBw + 2 * mmSPad}", height: "${mmBh + 2 * mmSPad}",
        item: {
          type: "Container", width: "100%", height: "100%",
          items: [{
            type: "Image", position: "absolute", left: "${mmSPad}", top: "${mmSPad}", width: "${mmBw}", height: "${mmBh}",
            source: "${mmTicked ? mmSChecked : mmSEmpty}", scale: "fill",
          }],
        },
        onPress: [{
          type: "Sequential",
          when: "${" + PHASE + " > mmA && " + PHASE + " < mmZ}",
          commands: [
            // tick now, ask later
            { type: "SetValue", property: "mmTicked", value: "${!mmTicked}" },
            // the celebration, as for a page box: the document's
            // MmStripDone (apl.js), at where the box is now (dp)
            ...(celebrate ? [{
              type: "MmStripDone", mmL: "${mmLi}", mmTicked: "${mmTicked}", mmBx: "${mmSOx + mmSS * mmX}",
              mmBy: "${mmSOy + mmSS * (mmY + mmSPer * " + PHASE + ")}",
            }] : []),
            {
              type: "SetValue", componentId: ROOT_ID, property: "overrides", when: "${mmTid != ''}",
              value: "${overrides + mmTid + ':' + (mmTicked ? 1 : 0) + ':' + utcTime + ','}",
            },
            { type: "SendEvent", arguments: ["touch", "tap", "${mmSPg}", "${Math.round(mmX)}", "${" + CY + "}", "${mmTid}", major, minor,
              refreshArgs[1], "${overrides}", refreshArgs[6], refreshArgs[7], refreshArgs[8], refreshArgs[10]] },
            fastCheck(refreshArgs),
            { type: "MmRestartDwell" },
          ],
        }],
      }],
    },
  };
}

module.exports = { build, motion, phaseExpr, visibleSpan, pressable, boxId, layouts, PHASE };
