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
// The strip, its motion and its boxes' behaviour are the package's
// MmStrip / MmSBox / MmSTick layouts (apl-package.js); a screen carries
// one MmStrip instance per strip with its numbers, its segments as rows
// [file, top dp, height dp] and its boxes as rows (BOX_ROW below), so a
// box costs ~40 bytes of the screen (Dave's 113 boxes: ~120 bytes each
// as layout instances, 2026-10-28; 245 KB written out in full).
//
// Not ported: the Roku holds the strip while its pointer rests on a box,
// so a moving box can be aimed at. A finger needs no aiming - the box
// under it is pressed - and fast-mode touch handlers cannot stop an
// animation anyway.

const { ROOT_ID, applyOverrides, targetId } = require("./touch");

// a strip box as the screen sends it (the MmStrip instance's mmBoxes):
// [index in cfg.boxes, task id, visible from ms, to ms, centre x, centre y
// (canvas px, strip at its start), ticked 0/1, width dp or -1, height dp
// or -1, list or -9] - -1/-9: the strip's usual one

const DEFAULT_MS = 10000;
const MIN_MS = 100;
const PAD = 16; // canvas px of finger room around a box (touch.js)

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

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
const r1 = (v) => Math.round(v * 10) / 10;

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
  const { place, idPrefix, pageIndex } = ctx;
  const s = place.len(1);
  const win = place.rect(cfg.rect);

  // the strip: segments stacked top to bottom, drawn scaled to their
  // canvas size (the PNGs are at output scale); the asset base is the
  // screen's mmAB
  const segs = [];
  let top = 0;
  for (const seg of m.segments) {
    segs.push([seg.file, r2(top * s), r2(seg.h * s)]);
    top += seg.h;
  }

  // checkboxes ride the strip, at their strip position, as BOX_ROW rows;
  // a box's own size or list travel only when they differ from the
  // strip's usual ones
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
  const out = {
    type: "MmStrip", position: "absolute", left: win.x, top: win.y, width: win.w, height: win.h,
    mmId: "mm" + idPrefix, mmSw: r2(m.stripW * s), mmSh: r2(m.stripH * s), mmFrom: r2(m.fromY * s), mmTo: r2(m.toY * s),
    mmMs: m.ms, mmLp: m.loop, mmSegs: segs,
  };
  if (hasBoxes) {
    // the presses the screen still holds apply here as to page targets
    const { states } = applyOverrides({ targets: { items: boxes } }, ctx.overrides);
    Object.assign(out, {
      mmBoxes: shown.map(({ box: b, index: i, span }, k) => [
        i, targetId(b) || "", span[0], span[1],
        // the box centre on the canvas: x fixed, y at the strip's start
        r1(cfg.rect.x + b.x + b.w / 2), r1(cfg.rect.y + m.fromY + b.y + b.h / 2),
        states[i] === true ? 1 : 0, b.w !== bw ? r2(b.w * s) : -1, b.h !== bh ? r2(b.h * s) : -1, lists[k] !== bl ? lists[k] : -9,
      ]),
      // the box art, the page, the finger room, canvas -> dp (place), and
      // where a box's centre sits in the strip
      mmE: sprites.empty, mmC: sprites.checked,
      mmPer: Number(((m.toY - m.fromY) / m.ms).toPrecision(6)), // canvas px a ms
      mmPg: String(pageIndex), mmPad: r2(PAD * s),
      mmS: place.scale, mmOx: r2(place.ox), mmOy: r2(place.oy), mmRx: r2(cfg.rect.x), mmRy: r2(cfg.rect.y + m.fromY),
      // the usual box size (dp) and list, for boxes that do not say
      mmBw: r2(bw * s), mmBh: r2(bh * s), mmBl: bl,
    });
  }
  return [out];
}


/** How far into its motion the strip is now, ms, from inside an MmSBox
 * (reads the strip's binds): phaseExpr with the numbers bound. */
const PHASE = "(mmSLp ? (elapsedTime - mmScrollT0) % mmSMs : Math.min(mmSMs, elapsedTime - mmScrollT0))";
/** The box centre's canvas y now. */
const CY = "Math.round(mmY + mmSPer * " + PHASE + ")";

/** The package's strip layouts (apl-package.js).
 *
 * MmStrip: the window (the instance's place, clipping the strip to the
 * cell: the Roku's clippingRect; see overlay-gif.js on APL clipping) and
 * the strip in it, which moves by one looping linear AnimateItem started
 * on mount on its own sequencer (the main one is cut short by every
 * touch). The strip binds what its boxes read (mmS*).
 *
 * MmSBox: the strip checkbox. A press is touch.js's checkbox press,
 * ignored while the row is outside the window (mmA..mmZ, visibleSpan);
 * the tap's y is where the box is NOW. */
function layouts() {
  const size = [{ name: "mmT0", default: false }, { name: "mmW", default: -1 }, { name: "mmH", default: -1 }];
  const dflt = (name, d) => ({ name, default: d });
  const all = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" };
  return {
    MmStrip: {
      parameters: ["mmId", "mmSw", "mmSh", "mmFrom", "mmTo", "mmMs", "mmLp", "mmSegs",
        dflt("mmBoxes", []), dflt("mmE", ""), dflt("mmC", ""), dflt("mmPer", 0), dflt("mmPg", "0"),
        dflt("mmPad", 0), dflt("mmS", 1), dflt("mmOx", 0), dflt("mmOy", 0), dflt("mmRx", 0), dflt("mmRy", 0),
        dflt("mmBw", 0), dflt("mmBh", 0), dflt("mmBl", -1)],
      items: [{
        type: "Container",
        items: [{
          type: "Container",
          position: "absolute", left: 0, top: 0, width: "${mmSw}", height: "${mmSh}",
          transform: [{ translateY: "${mmFrom}" }],
          bind: [
            { name: "mmScrollT0", value: 0 },
            { name: "mmSEmpty", value: "${mmAB + mmE}" }, { name: "mmSChecked", value: "${mmAB + mmC}" },
            { name: "mmSMs", value: "${mmMs}" }, { name: "mmSLp", value: "${mmLp}" }, { name: "mmSPer", value: "${mmPer}" },
            { name: "mmSPg", value: "${mmPg}" }, { name: "mmSPad", value: "${mmPad}" },
            { name: "mmSS", value: "${mmS}" }, { name: "mmSOx", value: "${mmOx}" }, { name: "mmSOy", value: "${mmOy}" },
            { name: "mmSRx", value: "${mmRx}" }, { name: "mmSRy", value: "${mmRy}" },
            { name: "mmSBw", value: "${mmBw}" }, { name: "mmSBh", value: "${mmBh}" }, { name: "mmSL", value: "${mmBl}" },
          ],
          // no componentId: each acts on the strip, whose handler runs it
          onMount: [{
            type: "Sequential",
            sequencer: "scroll${mmId}",
            commands: [
              // when the motion started, for a press's position
              { type: "SetValue", property: "mmScrollT0", value: "${elapsedTime}" },
              {
                type: "AnimateItem", duration: "${mmMs}", easing: "linear", repeatCount: "${mmLp ? 1000000 : 0}",
                value: [{ property: "transform", from: [{ translateY: "${mmFrom}" }], to: [{ translateY: "${mmTo}" }] }],
              },
            ],
          }],
          items: [
            { type: "Container", ...all, data: "${mmSegs}", items: [{
              type: "Image", position: "absolute", left: 0, top: "${data[1]}", width: "${mmSw}", height: "${data[2]}",
              source: "${mmAB + data[0]}", scale: "fill",
            }] },
            // one box per row (BOX_ROW)
            { type: "Container", ...all, data: "${mmBoxes}", items: [
              { type: "MmSBox", id: "${mmId}Box${data[0]}", mmTid: "${data[1]}", mmA: "${data[2]}", mmZ: "${data[3]}",
                mmX: "${data[4]}", mmY: "${data[5]}", mmT0: "${data[6] == 1}", mmW: "${data[7]}", mmH: "${data[8]}", mmL: "${data[9]}" },
            ] },
          ],
        }],
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
            // the celebration, as for a page box (the screen's
            // MmAfterTick, apl.js), at where the box is now (dp)
            {
              type: "MmAfterTick", mmL: "${mmLi}", mmTicked: "${mmTicked}", mmBx: "${mmSOx + mmSS * mmX}",
              mmBy: "${mmSOy + mmSS * (mmY + mmSPer * " + PHASE + ")}",
            },
            {
              type: "SetValue", componentId: ROOT_ID, property: "overrides", when: "${mmTid != ''}",
              value: "${overrides + mmTid + ':' + (mmTicked ? 1 : 0) + ':' + utcTime + ','}",
            },
            { type: "MmTell", mmK: "tap", mmP: "${mmSPg}", mmX: "${Math.round(mmX)}", mmY: "${" + CY + "}", mmT: "${mmTid}" },
            { type: "MmFastCheck" },
            { type: "MmRestartDwell" },
          ],
        }],
      }],
    },
  };
}

module.exports = { build, motion, phaseExpr, visibleSpan, pressable, boxId, layouts, PHASE };
