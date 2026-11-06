// Native clock for the Echo Show: the time and date lines the render
// service hid in the page image, redrawn live at the exact rects it
// measured. Port of ClockOverlay.brs / ClockOverlayView.swift - the
// composition rules are the same, because they encode the same lesson:
// the device composes only the VALUES; every format decision (12/24h,
// meridiem shown or not, its localized strings and side, the date's word
// order and names) arrives in the manifest. English literals are ONLY the
// fallback for manifests that predate those fields.
//
// The difference is WHERE the composing runs. A skill's code only runs
// when Alexa calls it, so it cannot tick. Instead this file turns the
// manifest's rules into APL data-binding expressions over `utcTime`,
// which the Echo re-evaluates on its own as the clock advances - the
// minute flips on the device with no request to the skill.
//
// Values the expressions need (am/pm strings, weekday and month names)
// travel as bound variables, never spliced into the expression text, so
// a translation containing quotes or "${" cannot break the document.

const LEGACY_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LEGACY_MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

const present = (v) => v !== undefined && v !== null;
const truthy = (v) => v === true || v === "true" || v === 1;

/** APL expression for the display's wall-clock time in ms. The manifest's
 * offset is the DISPLAY's timezone; absent -> the Echo's own local time. */
function timeExpr(cfg) {
  return typeof cfg.tzOffsetMinutes === "number" ? "(utcTime + " + cfg.tzOffsetMinutes * 60000 + ")" : "localTime";
}

/** Time line -> { text, bind } for an APL Text component. */
function timeText(f, t) {
  const bind = [];
  const pad = (e) => (truthy(f.padHour) ? "${" + e + " < 10 ? '0' : ''}" : "") + "${" + e + "}";
  const minutes = "${Time.minutes(" + t + ") < 10 ? '0' : ''}${Time.minutes(" + t + ")}";
  if (truthy(f.is24h)) return { text: pad("Time.hours(" + t + ")") + ":" + minutes, bind };

  let txt = pad("((Time.hours(" + t + ") + 11) % 12 + 1)") + ":" + minutes;
  let am = null, pm = null, prefix = false, spaced = true;
  if (present(f.showMeridiem)) {
    // the settings decide: shown only when the user enabled it, with the
    // language's own strings on the language's own side
    if (truthy(f.showMeridiem) && present(f.am) && present(f.pm)) {
      am = f.am; pm = f.pm; prefix = truthy(f.meridiemPrefix); spaced = truthy(f.meridiemSpaced);
    }
  } else {
    // legacy manifest: old English-suffix behavior
    am = truthy(f.upperMeridiem) ? "AM" : "am";
    pm = truthy(f.upperMeridiem) ? "PM" : "pm";
  }
  if (am !== null) {
    bind.push({ name: "mmAm", value: am }, { name: "mmPm", value: pm });
    const mer = "${Time.hours(" + t + ") < 12 ? mmAm : mmPm}";
    const sp = spaced ? " " : "";
    txt = prefix ? mer + sp + txt : txt + sp + mer;
  }
  return { text: txt, bind };
}

/** Date line -> { text, bind }. Weekday/month arrays are Sunday-first and
 * January-first, matching APL's Time.weekDay (0 = Sunday) and Time.month
 * (0 = January). */
function dateText(d, t) {
  let weekdays = LEGACY_WEEKDAYS, months = LEGACY_MONTHS;
  let pattern = [{ t: "weekday" }, { t: "lit", v: ", " }, { t: "month" }, { t: "lit", v: " " }, { t: "day" }];
  if (Array.isArray(d.pattern) && Array.isArray(d.weekdays) && d.weekdays.length === 7 &&
      Array.isArray(d.months) && d.months.length === 12) {
    weekdays = d.weekdays; months = d.months; pattern = d.pattern;
  }
  const bind = [{ name: "mmWeekdays", value: weekdays }, { name: "mmMonths", value: months }];
  let txt = "";
  pattern.forEach((tok, i) => {
    if (!tok) return;
    if (tok.t === "weekday") txt += "${mmWeekdays[Time.weekDay(" + t + ")]}";
    else if (tok.t === "month") txt += "${mmMonths[Time.month(" + t + ")]}";
    else if (tok.t === "day") txt += "${Time.date(" + t + ")}";
    else if (typeof tok.v === "string") {
      bind.push({ name: "mmLit" + i, value: tok.v });
      txt += "${mmLit" + i + "}";
    }
  });
  return { text: txt, bind };
}

const ALIGN = { left: "left", start: "left", right: "right", end: "right" };

/** One measured label as an absolutely positioned APL Text. `place`
 * maps canvas px to the viewport (see apl.js). */
function label(el, composed, place) {
  const r = place.rect(el.rect);
  return {
    type: "Text",
    position: "absolute",
    left: r.x, top: r.y, width: r.w, height: r.h,
    bind: composed.bind,
    text: composed.text,
    color: el.color || "#FFFFFFFF",
    fontSize: place.len(el.fontSizePx || 16),
    fontWeight: truthy(el.bold) ? "bold" : "normal",
    textAlign: ALIGN[el.align] || "center",
    textAlignVertical: "center",
    maxLines: 1,
  };
}

/** APL components for one `clock` overlay. */
function clockComponents(cfg, place) {
  const els = cfg.elements || {};
  const t = timeExpr(cfg);
  const out = [];
  if (els.time && els.time.rect) out.push(label(els.time, timeText(els.time, t), place));
  if (els.date && els.date.rect) out.push(label(els.date, dateText(els.date, t), place));
  return out;
}

module.exports = { clockComponents, timeText, dateText, timeExpr };
