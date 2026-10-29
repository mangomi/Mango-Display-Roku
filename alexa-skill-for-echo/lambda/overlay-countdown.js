// Native countdown: the day/hour/minute/second NUMBERS the render service
// hid (box chrome, unit labels and the event name stay baked), redrawn at
// the measured rects and styles. Port of CountdownOverlay.brs /
// CountdownOverlayView.swift: pure epoch math against the manifest's
// absolute target - timezone-free. Matches the portal: units compute with
// fixed modulo whichever boxes are enabled, and the visible value runs
// one second ahead (the portal subtracts 1s before display).
//
// Like clock.js, the counting runs on the Echo: each number is an APL
// data-binding expression over `utcTime`, which the device re-evaluates
// as time advances, so the seconds tick with no request to the skill.
// The target is the only manifest value in the expressions, and it goes
// in as a number (never as text from the manifest).

const UNITS = ["day", "hour", "minute", "second"];
const ALIGN = { left: "left", start: "left", right: "right", end: "right" };

/** APL expression (no ${}) for the whole seconds left on the display, the
 * portal's way: target - now - 1, never below 0. */
function remainExpr(targetEpochSeconds) {
  return "Math.max(0, " + Math.floor(targetEpochSeconds) + " - Math.floor(utcTime / 1000) - 1)";
}

/** Text for one unit's box, from the remaining-seconds expression. */
function unitText(unit, remain) {
  const r = "(" + remain + ")";
  if (unit === "day") return "${Math.floor(" + r + " / 86400)}";
  if (unit === "hour") return "${Math.floor(" + r + " % 86400 / 3600)}";
  if (unit === "minute") return "${Math.floor(" + r + " % 3600 / 60)}";
  return "${" + r + " % 60}";
}

/** One number as an absolutely positioned APL Text. The portal's box is
 * exactly as wide as the digits it holds (sub-pixel advances); the Echo's
 * font is not the portal's, so the same digits can come out wider and
 * get cut. Like the Roku, give it a font-size of slack on the aligned
 * side(s). */
function label(el, text, place) {
  const align = ALIGN[el.align] || "center";
  const pad = el.fontSizePx || 16;
  let x = el.rect.x;
  if (align === "center") x -= pad / 2;
  if (align === "right") x -= pad;
  const r = place.rect({ x, y: el.rect.y, w: el.rect.w + pad, h: el.rect.h });
  return {
    type: "Text",
    position: "absolute",
    left: r.x, top: r.y, width: r.w, height: r.h,
    text,
    color: el.color || "#FFFFFFFF",
    fontSize: place.len(el.fontSizePx || 16),
    fontWeight: el.bold === true ? "bold" : "normal",
    textAlign: align,
    textAlignVertical: "center",
    maxLines: 1,
  };
}

/** APL components for one `countdown` overlay. */
function build(cfg, ctx) {
  const els = cfg.elements || {};
  const target = Number(cfg.targetEpochSeconds);
  if (!Number.isFinite(target)) return [];
  const remain = remainExpr(target);
  const out = [];
  for (const unit of UNITS) {
    const el = els[unit];
    if (el && el.rect) out.push(label(el, unitText(unit, remain), ctx.place));
  }
  return out;
}

module.exports = { build, remainExpr, unitText };
