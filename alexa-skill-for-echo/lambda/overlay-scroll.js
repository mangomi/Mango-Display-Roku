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

  // checkboxes ride the strip, at their strip position
  const sprites = cfg.sprites;
  const boxes = Array.isArray(cfg.boxes) ? cfg.boxes : [];
  if (sprites && sprites.empty && sprites.checked && boxes.length) {
    // the presses the screen still holds apply here as to page targets
    const { states } = applyOverrides({ targets: { items: boxes } }, ctx.overrides);
    const t = phaseExpr(m);
    const perMs = (m.toY - m.fromY) / m.ms; // canvas px the strip moves a ms
    const pad = PAD * s;
    pressable(cfg).forEach(({ box: b, index: i, span }) => {
      const id = targetId(b);
      const cx = Math.round(cfg.rect.x + b.x + b.w / 2);
      const cy = "${Math.round(" + r2(cfg.rect.y + m.fromY + b.y + b.h / 2) + " + " + perMs.toPrecision(6) + " * " + t + ")}";
      items.push({
        type: "TouchWrapper",
        id: boxId(idPrefix, i),
        position: "absolute",
        left: r2(b.x * s - pad), top: r2(b.y * s - pad), width: r2(b.w * s + pad * 2), height: r2(b.h * s + pad * 2),
        // mmTicked, never "checked" (touch.js)
        bind: [{ name: "mmTicked", value: states[i] === true }],
        item: {
          type: "Container", width: "100%", height: "100%",
          items: [{
            type: "Image", position: "absolute", left: r2(pad), top: r2(pad), width: r2(b.w * s), height: r2(b.h * s),
            source: "${mmTicked ? mmSChecked : mmSEmpty}", scale: "fill",
          }],
        },
        onPress: [{
          type: "Sequential",
          when: "${" + t + " > " + span[0] + " && " + t + " < " + span[1] + "}",
          commands: [
            // tick now, ask later
            { type: "SetValue", property: "mmTicked", value: "${!mmTicked}" },
            ...(id ? [{
              type: "SetValue", componentId: ROOT_ID, property: "overrides",
              value: "${overrides + '" + id + ":' + (mmTicked ? 1 : 0) + ':' + utcTime + ','}",
            }] : []),
            { type: "SendEvent", arguments: ["touch", "tap", String(pageIndex), String(cx), cy, id, major, minor, refreshArgs[1], "${overrides}", refreshArgs[6], refreshArgs[7], refreshArgs[8]] },
            fastCheck(refreshArgs),
            { type: "MmRestartDwell" },
          ],
        }],
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
    bind: [{ name: "mmScrollT0", value: 0 }].concat(sprites && sprites.empty && sprites.checked ? [
      { name: "mmSEmpty", value: assetBase + sprites.empty },
      { name: "mmSChecked", value: assetBase + sprites.checked },
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

module.exports = { build, motion, phaseExpr, visibleSpan, pressable, boxId };
