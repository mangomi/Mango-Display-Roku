// Display-wide effects (manifest `effects`): the Echo's version of the
// Roku's effectRegistry (MainScene.brs) and the tvOS port (Effects.swift).
// See effects.js for the builder contract. Exports type -> build(cfg, ctx),
// and the APL layouts the builders' components are instances of.
//
//   balloons/snow/leaves/hearts  ParticleEffect: sprites crossing the
//                 canvas edge to edge with a sine sway, fading in, growing
//                 (balloons) or spinning (leaves)
//   spritesheet   GifOverlay: an animated strip at a fixed rect (string lights)
//   spritemover   SpriteMover: Santa / the witch / walking spiders bouncing
//                 off the canvas edges, facing their direction
//   popup         PopupEffect: one character at a time pops in somewhere,
//                 stays a few seconds, pops out (elves, scary, fireworks)
//   dropper       DropperEffect: spiders going down and up on threads
//
// The Roku re-randomizes every particle trip in script; the Echo runs no
// code, so all randomness is drawn HERE when the document is built, from a
// generator seeded with the effect's own config: the same manifest gives
// the same document (the skill compares documents to update in place). A
// particle then repeats its path every trip - with a dozen on different
// speeds and sways that does not read.
//
// Everything runs on the Echo as AnimateItem loops started on mount
// (normal mode), each on its own named sequencer so a touch on the main
// sequencer cannot cut it short. Most of them animate a BOUND VALUE (an
// AnimateItem target, APL docs) - a particle's progress along its path,
// its sway, a sheet's position in its cycle - and the component's
// transform is an expression of it. So the per-particle numbers live in
// the component, the commands are the same for all of them, and they are
// written once, as layouts (layouts() below, the document's `layouts`):
// an instance carries only its numbers (~250 bytes; a snowfall of 16 was
// 15 KB written out in full, on a screen capped near 120 KB).
//
// Sprite sheets (Amazon: do not rely on animated GIFs) show one cell
// through a frame-sized Container, which clips the sheet (Roku
// clippingRect; a parent clipping its children is renderer behaviour, not
// a documented promise - hardware check, as for overlay-gif.js). The cell
// is floor(cycle position x frames), so the sheet steps cell to cell.
//
// Effects travel against the canvas (MainScene applyEffects hands them
// canvasW/H), mapped to dp with ctx.place, so they line up with the page.

const LOOP = 1000000;
// Particle caps. The Roku shows up to 30 snowflakes; an Echo Show 5/8 has
// far less to give than a Show 15 (hardware check). Small screens: under
// ~1.2M dp2 (Show 15 is 1920x1080 dp, Show 8/10 1280x800, Show 5 960x480).
const MAX_PARTICLES = 16;
const MAX_PARTICLES_SMALL = 10;
const MAX_DROPPERS = 8;
const MAX_DROPPERS_SMALL = 5;
const SMALL_DP2 = 1200000;
const POP_OUT_MS = 400; // PopupEffect onDwellDone
// easeOutBack: the Roku pops 0 -> 1.5 -> 0.8 -> 1 in three keyframes; one
// AnimateItem overshooting less is a third of the commands
const POP_EASE = "cubic-bezier(0.34, 1.56, 0.64, 1)";

// ---- helpers ---------------------------------------------------------

/** Deterministic random numbers in [0, 1) from a string (FNV-1a seeding
 * mulberry32). */
function rng(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
// dp to 0.1, ms to 1, fractions to 0.001 - keeps the document small
const r1 = (v) => Math.round(v * 10) / 10;
const ms = (v) => Math.max(1, Math.round(v));
const r3 = (v) => Math.round(v * 1000) / 1000;

/** A random value in a [lo, hi] config range (ParticleEffect pick). */
function pick(rand, range, lo, hi) {
  if (Array.isArray(range) && range.length === 2) [lo, hi] = range;
  return lo + rand() * (hi - lo);
}

/** Generated sprites are bare file names next to the page images. */
function assetUrl(name, ctx) {
  const s = String(name || "");
  return /^https?:/i.test(s) ? s : ctx.assetBase + s;
}

const small = (vp) => vp.w * vp.h < SMALL_DP2;

/** Every loop has its own sequencer, named after this module. */
const seq = (id) => "effects-" + id;

// AnimateItem eases linearly unless told otherwise
const animate = (dur, easing, from, to, more) => ({
  type: "AnimateItem", duration: ms(dur), ...(easing === "linear" ? {} : { easing }),
  value: [{ property: "transform", from, to }], ...more,
});
/** AnimateItem on a bound value (the layouts' mmFxP, mmFxS, mmFxF); no
 * `from` animates from where it is. */
const animateValue = (property, dur, from, to, more) => ({
  type: "AnimateItem", duration: dur, value: [{ property, ...(from === undefined ? {} : { from }), to }], ...more,
});

// ---- layouts ---------------------------------------------------------

// the cell a sheet shows: its cycle position mmFxF (0..1) in frames
const FRAME = "Math.min(Math.floor(mmFxF * mmN), mmN - 1)";

/** The document's layouts for these components (merge into the doc's
 * opts.layouts next to touch.layouts()). */
function layouts() {
  return {
    // A frame window onto a sprite sheet of mmCols x mmRows cells of
    // mmW x mmH dp. With mmSeq it plays for good from mount, on sequencer
    // effects-<mmSeq>; without, a command plays it (popups, celebrations):
    // AnimateItem mmFxF 0 -> 1 over a cycle on this component.
    MmFxSheet: {
      parameters: ["mmSrc", "mmW", "mmH", "mmCols", "mmRows", "mmN", "mmMs", { name: "mmSeq", default: "" }],
      items: [{
        type: "Container",
        bind: [{ name: "mmFxF", value: 0 }],
        onMount: [animateValue("mmFxF", "${mmN * mmMs}", 0, 1,
          { when: "${mmSeq != '' && mmN > 1}", sequencer: "effects-${mmSeq}", repeatCount: LOOP })],
        items: [{
          type: "Image", position: "absolute", left: 0, top: 0, width: "${mmCols * mmW}", height: "${mmRows * mmH}",
          source: "${mmSrc}", scale: "fill",
          transform: [
            { translateX: "${-(" + FRAME + " % mmCols) * mmW}" },
            { translateY: "${-Math.floor(" + FRAME + " / mmCols) * mmH}" },
          ],
        }],
      }],
    },
    // One particle: progress mmFxP (0..1) along a trip of mmTr dp
    // (negative: upwards) every mmDur ms, sway mmFxS (-1..1) times mmAmp
    // dp (half a sway every mmSw ms), turning mmSpin degrees and growing
    // by mmGrow a trip, fading in over its first mmFade. Waits mmDel ms
    // first, or (mmP0 > 0) starts partway along. The sprite is
    // mmFxSrc[mmS], bound once on the effect.
    MmFxParticle: {
      parameters: ["mmS", "mmTr", "mmAmp", "mmDur", "mmSw", "mmSeq",
        { name: "mmSpin", default: 0 }, { name: "mmGrow", default: 0 }, { name: "mmP0", default: 0 },
        { name: "mmDel", default: 0 }, { name: "mmFade", default: 0 }],
      items: [{
        type: "Image",
        source: "${mmFxSrc[mmS]}",
        bind: [{ name: "mmFxP", value: "${mmP0}" }, { name: "mmFxS", value: -1 }],
        opacity: "${mmFade > 0 ? Math.min(1, mmFxP / mmFade) : 1}",
        transform: [
          { translateX: "${mmFxS * mmAmp}" }, { translateY: "${mmFxP * mmTr}" },
          { rotate: "${mmFxP * mmSpin}" }, { scale: "${1 + mmFxP * mmGrow}" },
        ],
        onMount: [
          animateValue("mmFxS", "${mmSw}", -1, 1, { easing: "ease-in-out", repeatCount: LOOP, repeatMode: "reverse", sequencer: "effects-${mmSeq}s" }),
          {
            type: "Sequential", sequencer: "effects-${mmSeq}",
            commands: [
              { type: "Idle", delay: "${mmDel}" },
              animateValue("mmFxP", "${mmDur * (1 - mmP0)}", undefined, 1, { when: "${mmP0 > 0}" }),
              animateValue("mmFxP", "${mmDur}", 0, 1, { repeatCount: LOOP }),
            ],
          },
        ],
      }],
    },
    // One dropping spider: the lane sways (mmFxS times mmAmp dp, half a
    // sway every mmSw ms); in it the rider - the thread from far above
    // down to the spider's head, and the spider - goes mmD dp down and
    // back up (mmFxP, mmDur ms a way), from mmP0 of the way down. The lane
    // clips the thread at its top. Sheet parameters as MmFxSheet.
    MmFxDrop: {
      parameters: ["mmD", "mmAmp", "mmSw", "mmDur", "mmP0", "mmSeq", "mmColor", "mmTw",
        "mmSrc", "mmW", "mmH", "mmCols", "mmRows", "mmN", "mmMs"],
      items: [{
        type: "Container",
        bind: [{ name: "mmFxS", value: -1 }, { name: "mmFxP", value: "${mmP0}" }],
        transform: [{ translateX: "${mmFxS * mmAmp}" }],
        onMount: [
          animateValue("mmFxS", "${mmSw}", -1, 1, { easing: "ease-in-out", repeatCount: LOOP, repeatMode: "reverse", sequencer: "effects-${mmSeq}s" }),
          {
            type: "Sequential", sequencer: "effects-${mmSeq}",
            commands: [
              animateValue("mmFxP", "${mmDur * (1 - mmP0)}", undefined, 1),
              animateValue("mmFxP", "${mmDur}", 1, 0, { repeatCount: LOOP, repeatMode: "reverse" }),
            ],
          },
        ],
        items: [{
          type: "Container", position: "absolute", left: 0, top: "${-mmD}", width: "${mmW}", height: "${mmD + mmH}",
          transform: [{ translateY: "${mmFxP * mmD}" }],
          items: [
            { type: "Frame", position: "absolute", left: "${mmW / 2 - 1}", top: 0, width: "${mmTw}", height: "${mmD + 1}", backgroundColor: "${mmColor}" },
            {
              type: "MmFxSheet", position: "absolute", left: 0, top: "${mmD}", width: "${mmW}", height: "${mmH}",
              mmSrc: "${mmSrc}", mmW: "${mmW}", mmH: "${mmH}", mmCols: "${mmCols}", mmRows: "${mmRows}",
              mmN: "${mmN}", mmMs: "${mmMs}", mmSeq: "${mmSeq + 'f'}",
            },
          ],
        }],
      }],
    },
  };
}

// ---- sprite sheets ---------------------------------------------------

/** Frame geometry of a sheet config (GifOverlay/SpriteMover fields). */
function sheetMeta(c, minMs, defMs) {
  const frameCount = Math.max(1, Math.floor(num(c.frameCount, 1)));
  const cols = Math.max(1, Math.floor(num(c.cols, 1)));
  return {
    frameCount, cols,
    rows: Math.max(1, Math.floor(num(c.rows, Math.ceil(frameCount / cols)))),
    frameW: num(c.frameW, 0), frameH: num(c.frameH, 0),
    frameMs: Math.round(Math.max(minMs, num(c.frameMs, defMs))),
  };
}

/** The MmFxSheet parameters of a sheet shown at w x h dp a cell. */
const sheetParams = (url, m, w, h) => ({
  mmSrc: url, mmW: r1(w), mmH: r1(h), mmCols: m.cols, mmRows: m.rows, mmN: m.frameCount, mmMs: m.frameMs,
});

/** An MmFxSheet instance: frame window `id` at (left, top) dp. `loop`:
 * plays for good from mount (on sequencer effects-<id>). */
function sheetWindow(id, url, m, w, h, left, top, loop, more) {
  return {
    type: "MmFxSheet", id, position: "absolute", left: r1(left), top: r1(top), width: r1(w), height: r1(h),
    ...sheetParams(url, m, w, h), ...(loop ? { mmSeq: id } : {}), ...more,
  };
}

/** Plays the sheet in window `id` from its first cell, `plays` times. */
const playSheet = (id, m, plays) =>
  animateValue("mmFxF", m.frameCount * m.frameMs, 0, 1, { componentId: id, ...(plays > 1 ? { repeatCount: plays - 1 } : {}) });

/** The canvas area: its dp origin, its px size, px -> dp. */
function canvasBox(ctx) {
  const { place, canvas } = ctx;
  return { ox: place.ox, oy: place.oy, cw: canvas.width, ch: canvas.height, len: place.len };
}

/** A Container over the canvas holding an effect's parts. */
function canvasLayer(ctx, items, more) {
  const { ox, oy, cw, ch, len } = canvasBox(ctx);
  return { type: "Container", position: "absolute", left: r1(ox), top: r1(oy), width: r1(len(cw)), height: r1(len(ch)), ...more, items };
}

// ---- balloons / snow / leaves / hearts (ParticleEffect) ---------------

/** Each particle (MmFxParticle) crosses the canvas from just off one edge
 * to just off the other (fading in over fadeInPx, growing, spinning),
 * swaying sideways (ease-in-out back and forth - the Roku's sine), and
 * starts over. The first four start partway along so the screen is never
 * empty; the rest join one per spawnEverySeconds, as the Roku's spawn
 * timer adds them. The sprite URLs are bound once, on a screen-sized
 * layer. */
function particles(cfg, ctx) {
  const sprites = (Array.isArray(cfg.sprites) ? cfg.sprites : [])
    .map((s) => (typeof s === "string" ? { url: s, aspect: 1.3 } : s && s.url ? { url: s.url, aspect: num(s.aspect, 1.3) } : null))
    .filter(Boolean);
  if (!sprites.length) return [];
  const rand = rng(ctx.idPrefix + JSON.stringify(cfg));
  const { ox, oy, cw, ch, len } = canvasBox(ctx);
  const count = Math.min(Math.max(0, Math.floor(num(cfg.maxCount, 12))), small(ctx.vp) ? MAX_PARTICLES_SMALL : MAX_PARTICLES);
  const everyMs = num(cfg.spawnEverySeconds, 1.6) * 1000;
  const growth = num(cfg.growthFactor, 1.25);
  const fadeInPx = num(cfg.fadeInPx, 100);
  const down = cfg.direction === "down";
  const items = [];
  for (let i = 0; i < count; i++) {
    const s = Math.floor(rand() * sprites.length);
    const size = pick(rand, cfg.sizeRange, 30, 70);
    const speed = Math.max(1, pick(rand, cfg.speedRange, 12, 42));
    const amp = len(pick(rand, cfg.driftAmplitudeRange, 20, 60));
    const period = pick(rand, cfg.driftPeriodRange, 4.2, 12.6);
    const spin = cfg.spinTurnsRange ? pick(rand, cfg.spinTurnsRange, -1, 1) * 360 : 0;
    const startX = rand() * cw;
    const seeded = i < 4;
    const progress = seeded ? rand() * 0.7 : 0;
    const swayRight = rand() < 0.5;

    // canvas px: width drives the size, height follows the art
    const hPx = size * sprites[s].aspect;
    const travelPx = ch + hPx * 2;
    const H = len(hPx);
    items.push({
      type: "MmFxParticle", position: "absolute",
      // the start: just above the canvas (falling) or just below (rising)
      left: r1(ox + len(startX)), top: r1(down ? oy - H : oy + len(ch + hPx)), width: r1(len(size)), height: r1(H),
      mmS: s, mmTr: r1(down ? len(travelPx) : -len(travelPx)),
      mmAmp: r1(swayRight ? amp : -amp), mmDur: ms(Math.max(4, travelPx / speed) * 1000), mmSw: ms(period * 500),
      mmSeq: ctx.idPrefix + "p" + i,
      ...(spin ? { mmSpin: Math.round(spin) } : {}),
      ...(growth !== 1 ? { mmGrow: r3(growth - 1) } : {}),
      ...(seeded ? { mmP0: r3(Math.max(0.001, progress)) } : { mmDel: ms((i - 3) * everyMs) }),
      ...(fadeInPx > 0 ? { mmFade: r3(Math.min(0.4, fadeInPx / travelPx)) } : {}),
    });
  }
  return [{
    type: "Container", position: "absolute", left: 0, top: 0, width: ctx.vp.w, height: ctx.vp.h,
    bind: [{ name: "mmFxSrc", value: sprites.map((sp) => assetUrl(sp.url, ctx)) }],
    items,
  }];
}

// ---- spritesheet (GifOverlay) ----------------------------------------

/** A strip animating in place at its rect, frame by frame. */
function spritesheet(cfg, ctx) {
  if (!cfg.stripFile || !cfg.rect) return [];
  const m = sheetMeta(cfg, 33, 100);
  const r = ctx.place.rect({ x: cfg.rect.x, y: cfg.rect.y, w: m.frameW || cfg.rect.w, h: m.frameH || cfg.rect.h });
  return [sheetWindow(ctx.idPrefix + "g", assetUrl(cfg.stripFile, ctx), m, r.w, r.h, r.x, r.y, true)];
}

// ---- spritemover (SpriteMover) ---------------------------------------

/** Bounces between the canvas edges at fixed speeds. Horizontal and
 * vertical bounces are independent (each leg runs to the next wall and
 * turns the axis that hit it - the Roku's nextLeg), so a lane carries x
 * and a mover inside it carries y, each its own back-and-forth loop. The
 * loops set mmFxDx/mmFxDy as they turn and the sprite faces by them: the
 * mirrored sheet going left (flipOnTurn), the spiders' 90-degree turn
 * (rotateOnTurn, tvOS SpriteMoverView's angle), the witch's bats swapping
 * sides. The mover is sized to hold all of that, so nothing is clipped. */
function spritemover(cfg, ctx) {
  if (!cfg.stripFile) return [];
  const m = sheetMeta(cfg, 40, 90);
  if (!(m.frameW > 0 && m.frameH > 0)) return [];
  const { ox, oy, cw, ch, len } = canvasBox(ctx);
  const id = ctx.idPrefix + "m";
  const fw = m.frameW;
  const fh = m.frameH;
  const maxX = Math.max(0, cw - fw);
  const maxY = Math.max(0, ch - fh);
  const x0 = Math.min(maxX, Math.max(0, num(cfg.startX, 0)));
  const y0 = Math.min(maxY, Math.max(0, num(cfg.startY, 50)));
  const dirX = num(cfg.startDirX, 1) < 0 ? -1 : 1;
  const dirY = num(cfg.startDirY, 1) < 0 ? -1 : 1;
  const flip = cfg.flipOnTurn === true;
  const turn = cfg.rotateOnTurn === true;

  // the box around everything that rides along, relative to the
  // sprite's top-left (canvas px)
  const comp = cfg.companion && cfg.companion.stripFile ? cfg.companion : null;
  const cm = comp ? sheetMeta(comp, 40, 90) : null;
  const offX = comp ? num(comp.offsetX, 0) : 0;
  const offY = comp ? num(comp.offsetY, 0) : 0;
  let [bx0, by0, bx1, by1] = [0, 0, fw, fh];
  if (comp) {
    bx0 = Math.min(bx0, offX, fw - offX - cm.frameW);
    bx1 = Math.max(bx1, offX + cm.frameW, fw - offX);
    by0 = Math.min(by0, offY);
    by1 = Math.max(by1, offY + cm.frameH);
  }
  if (turn) {
    const d = Math.max(fw, fh) / 2;
    [bx0, by0] = [Math.min(bx0, fw / 2 - d), Math.min(by0, fh / 2 - d)];
    [bx1, by1] = [Math.max(bx1, fw / 2 + d), Math.max(by1, fh / 2 + d)];
  }
  const facing = (right) => ({ display: "${mmFxDx " + (right ? ">" : "<") + " 0 ? 'normal' : 'invisible'}" });

  // the sprite (normal and mirrored sheets), turned for the spiders
  const W = len(fw);
  const H = len(fh);
  const twoSheets = flip && !!cfg.stripFileFlipped;
  const sprite = [sheetWindow(id + "a", assetUrl(cfg.stripFile, ctx), m, W, H, 0, 0, true, twoSheets ? facing(true) : {})];
  if (twoSheets) sprite.push(sheetWindow(id + "b", assetUrl(cfg.stripFileFlipped, ctx), m, W, H, 0, 0, true, facing(false)));
  const items = [{
    type: "Container", position: "absolute", left: r1(len(-bx0)), top: r1(len(-by0)), width: r1(W), height: r1(H),
    ...(turn ? { transform: [{ rotate: "${mmFxDx * mmFxDy * 90}" }] } : {}),
    items: sprite,
  }];
  if (comp) {
    const url = assetUrl(comp.stripFile, ctx);
    const [cW, cH] = [len(cm.frameW), len(cm.frameH)];
    items.push(sheetWindow(id + "c", url, cm, cW, cH, len(offX - bx0), len(offY - by0), true, flip ? facing(true) : {}));
    // the trail swaps sides when the sprite turns around
    if (flip) {
      items.push(sheetWindow(id + "d", comp.stripFileFlipped ? assetUrl(comp.stripFileFlipped, ctx) : url, cm, cW, cH,
        len(fw - offX - cm.frameW - bx0), len(offY - by0), true, facing(false)));
    }
  }

  // to the wall ahead, then wall to wall for good, setting the direction
  // variable at each turn
  const loop = (axis, pos, max, speed, dir, dirVar) => {
    if (!(speed > 0 && max > 0)) return [];
    const at = (v) => [{ [axis]: r1(len(v)) }];
    const leg = (a, b) => animate((Math.abs(b - a) / speed) * 1000, "linear", at(a), at(b));
    const set = (v) => ({ type: "SetValue", componentId: id, property: dirVar, value: v });
    const round = dir > 0 ? [set(-1), leg(max, 0), set(1), leg(0, max)] : [set(1), leg(0, max), set(-1), leg(max, 0)];
    return [{
      type: "Sequential", sequencer: seq(id + axis),
      commands: [leg(pos, dir > 0 ? max : 0), { type: "Sequential", repeatCount: LOOP, commands: round }],
    }];
  };
  const bw = r1(len(bx1 - bx0));
  return [{
    // the lane carries x and is as tall as the y travel
    type: "Container", id, position: "absolute",
    left: r1(ox + len(bx0)), top: r1(oy + len(by0)), width: bw, height: r1(len(maxY + by1 - by0)),
    transform: [{ translateX: r1(len(x0)) }],
    bind: [{ name: "mmFxDx", value: dirX }, { name: "mmFxDy", value: dirY }],
    onMount: loop("translateX", x0, maxX, num(cfg.speedX, 120), dirX, "mmFxDx"),
    items: [{
      // the mover carries y
      type: "Container", position: "absolute", left: 0, top: 0, width: bw, height: r1(len(by1 - by0)),
      transform: [{ translateY: r1(len(y0)) }],
      onMount: loop("translateY", y0, maxY, num(cfg.speedY, 30), dirY, "mmFxDy"),
      items,
    }],
  }];
}

// ---- popup (PopupEffect) ---------------------------------------------

/** One character at a time: pops in at a random spot (scaling up out of
 * a half turn), plays for the dwell, pops out, and the next comes
 * somewhere else. The order is drawn here: each character once per round
 * (so never the same twice running), a lone sprite (fireworks) at four
 * spots. Its sheet restarts at every appearance, so a firework shell is
 * seen from its launch, and a burst's empty last cell holds to the end. */
function popup(cfg, ctx) {
  const sprites = (Array.isArray(cfg.sprites) ? cfg.sprites : [])
    .filter((s) => s && s.stripFile)
    .map((s) => ({ url: assetUrl(s.stripFile, ctx), m: sheetMeta(s, 40, 90) }))
    .filter((s) => s.m.frameW > 0 && s.m.frameH > 0);
  if (!sprites.length) return [];
  const rand = rng(ctx.idPrefix + JSON.stringify(cfg));
  const { cw, ch, len } = canvasBox(ctx);
  const id = ctx.idPrefix + "u";
  const host = (s) => id + "_" + s;
  const popMs = num(cfg.popMs, 500);
  const [lo, hi] = Array.isArray(cfg.dwellMsRange) && cfg.dwellMsRange.length === 2 ? cfg.dwellMsRange : [4000, 6000];

  const order = sprites.length > 1 ? [...sprites.keys()] : [0, 0, 0, 0];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const T = (x, y, rot, sc) => [{ translateX: x }, { translateY: y }, { rotate: rot }, { scale: sc }];
  const round = order.map((s) => {
    const { m } = sprites[s];
    // anywhere fully on the canvas
    const x = r1(len(rand() * Math.max(0, cw - m.frameW)));
    const y = r1(len(rand() * Math.max(0, ch - m.frameH)));
    const dwell = lo + rand() * (hi - lo);
    const plays = Math.max(1, Math.round((popMs + dwell + POP_OUT_MS) / (m.frameCount * m.frameMs)));
    const at = { componentId: host(s) };
    return {
      type: "Parallel",
      commands: [
        {
          type: "Sequential",
          commands: [
            animate(popMs, POP_EASE, T(x, y, -180, 0), T(x, y, 0, 1), at),
            { type: "Idle", delay: ms(dwell) },
            animate(POP_OUT_MS, "ease-in", T(x, y, 0, 1), T(x, y, 0, 0), at),
          ],
        },
        playSheet(host(s), m, plays),
      ],
    };
  });
  return [canvasLayer(ctx,
    sprites.map((s, i) => sheetWindow(host(i), s.url, s.m, len(s.m.frameW), len(s.m.frameH), 0, 0, false, { transform: T(0, 0, 0, 0) })),
    { onMount: [{ type: "Sequential", sequencer: seq(id), repeatCount: LOOP, commands: round }] })];
}

// ---- dropper (DropperEffect) -----------------------------------------

/** Spiders spread across the top, each going down to maxY and back up on
 * a thread, swaying (thread and all), starting at a random point of the
 * drop (MmFxDrop). Frames step at the Roku's fixed 100ms (its timer; tvOS
 * likewise ignores frameMs here). */
function dropper(cfg, ctx) {
  if (!cfg.stripFile) return [];
  const m = { ...sheetMeta(cfg, 40, 100), frameMs: 100 };
  if (!(m.frameW > 0 && m.frameH > 0)) return [];
  const rand = rng(ctx.idPrefix + JSON.stringify(cfg));
  const { cw, len } = canvasBox(ctx);
  const count = Math.min(Math.max(1, Math.floor(num(cfg.count, 6))), small(ctx.vp) ? MAX_DROPPERS_SMALL : MAX_DROPPERS);
  const speed = Math.max(1, num(cfg.speed, 36));
  const maxY = Math.max(1, num(cfg.maxY, 960));
  // Roku "0xRRGGBBAA" -> APL "#RRGGBBAA"
  const color = "#" + String(cfg.threadColor || "0xC8C8C8CC").replace(/^0x|^#/i, "");
  const [W, H, D] = [len(m.frameW), len(m.frameH), len(maxY)];
  const common = {
    mmD: r1(D), mmAmp: r1(len(num(cfg.swayAmplitude, 22.5))), mmSw: ms(num(cfg.swayPeriodMs, 3770) / 2),
    mmDur: ms((maxY / speed) * 1000), mmColor: color, mmTw: r1(Math.max(1, len(2))),
    ...sheetParams(assetUrl(cfg.stripFile, ctx), m, W, H),
  };
  const spacing = cw / count;
  const lanes = [];
  for (let i = 0; i < count; i++) {
    const baseX = Math.min(cw - 60, Math.max(60, spacing * i + spacing / 2 + (rand() - 0.5) * spacing * 0.4));
    lanes.push({
      type: "MmFxDrop", position: "absolute", left: r1(len(baseX) - W / 2), top: 0, width: r1(W), height: r1(D + H),
      mmP0: r3(rand()), mmSeq: ctx.idPrefix + "d" + i, ...common,
    });
  }
  return [canvasLayer(ctx, lanes)];
}

module.exports = {
  builders: {
    balloons: particles,
    snow: particles,
    leaves: particles,
    hearts: particles,
    spritesheet,
    spritemover,
    popup,
    dropper,
  },
  layouts,
  // shared with celebrations.js
  rng, sheetMeta, sheetWindow, playSheet, LOOP,
};
