/*
 * Registry of widgets the Roku renders natively (see NATIVE_WIDGETS.md).
 *
 * Each handler runs against the portal frame AFTER mm-designer-ready:
 *   extract(frame) -> [overlay, ...]   measure geometry/config (canvas px)
 *   hide(frame, overlays)              blank the dynamic elements before
 *                                      the screenshot (opacity, never
 *                                      visibility - widget animations set
 *                                      visibility on children)
 */

// '"Playfair Display", sans-serif' -> "Playfair Display": the first
// family of the CSS stack, which is what the browser actually rendered
// (the portal preloads its whole catalog, so the first entry resolves).
// The device maps it to a bundled TTF and falls back to Source Sans Pro.
function primaryFontFamily(stack) {
  if (!stack) return null;
  const first = String(stack).split(",")[0].replace(/["']/g, "").trim();
  return first || null;
}

function cssColorToHex(css) {
  // "rgb(255, 255, 255)" / "rgba(255,255,255,0.8)" -> "#RRGGBBAA"
  const m = css && css.match(/rgba?\(([^)]+)\)/);
  if (!m) return "#FFFFFFFF";
  const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
  const [r, g, b] = parts;
  const a = parts.length > 3 ? Math.round(parts[3] * 255) : 255;
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return ("#" + h(r) + h(g) + h(b) + h(a)).toUpperCase();
}

// "12:07" / "9:07 PM" -> minutes since midnight, or null
function sampleToMinutes(sample) {
  const m = sample && sample.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const mer = m[3] && m[3].toUpperCase();
  if (mer === "PM" && h !== 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

// The portal renders the DISPLAY's configured timezone; the Roku only knows
// its own. Derive the display's UTC offset from the rendered time itself
// (rounded to 15 min) so the native clock matches the portal exactly.
// Re-derived every render, so DST shifts heal within a render cycle.
//
// A 12-hour display without a meridiem renders "8:45" for both 08:45 and
// 20:45, which makes the offset ambiguous by exactly 12 hours - and both
// answers can be legal offsets. That shipped a clock showing tomorrow's
// date every evening (+8h instead of -4h for an Eastern display). The
// rendered DATE from the very same capture names which side of midnight
// the portal was on, so it picks the candidate.
function deriveTzOffsetMinutes(sample, dateText) {
  const sampleMin = sampleToMinutes(sample);
  if (sampleMin == null) return null;
  const now = new Date();
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  let base = sampleMin - utcMin;
  while (base > 840) base -= 1440; // real offsets span -12h..+14h
  while (base < -780) base += 1440;
  const candidates = [base];
  const ambiguous = !/am|pm/i.test(sample) && parseInt(sample, 10) <= 12;
  if (ambiguous) {
    for (const alt of [base - 720, base + 720]) {
      if (alt >= -780 && alt <= 840) candidates.push(alt);
    }
  }
  let best = candidates[0];
  if (candidates.length > 1 && dateText) {
    // "Monday, August 10" - compare day-of-month and weekday under each
    // candidate offset; shifting the epoch and reading UTC getters gives
    // that candidate's wall clock
    const dm = dateText.match(/^([A-Za-z]+), ([A-Za-z]+) (\d{1,2})$/);
    if (dm) {
      const hit = candidates.find((c) => {
        const local = new Date(now.getTime() + c * 60000);
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        return local.getUTCDate() === parseInt(dm[3], 10) && days[local.getUTCDay()] === dm[1];
      });
      if (hit !== undefined) best = hit;
    }
  }
  return Math.round(best / 15) * 15;
}

// True local minutes-since-midnight under an offset, for format detection
function localMinutesAt(offsetMinutes) {
  const now = new Date();
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + offsetMinutes + 1440) % 1440;
}

const clockHandler = {
  type: "clock",

  async extract(frame) {
    const raw = await frame.evaluate(() => {
      const out = [];

      // The widget's OWN settings decide the format - the user's 12/24h
      // toggle, the show-AM/PM toggle, the account language, the
      // display timezone. The portal renders from exactly these, so the
      // manifest must too; inferring them from the rendered text broke
      // for meridiem-off clocks and for every non-English language.
      const readSettings = (container) => {
        try {
          const sc = window.angular.element(container).scope();
          let w = sc;
          while (w && !w.widgetData) w = w.$parent;
          const d = w && w.widgetData && w.widgetData.data;
          if (!d) return null;
          return {
            hour24Format: d.hour24Format === true,
            isMeridiemEnabled: d.isMeridiemEnabled === true,
            userLanguage: d.user_language || "en",
            timeZoneOffset: typeof d.timeZoneOffset === "number" ? d.timeZoneOffset : null,
          };
        } catch (e) {
          return null;
        }
      };

      // Everything language-shaped comes from the SAME Intl API the
      // portal renders with, so the device composes exactly what the
      // portal would have drawn - any language, meridiem prefixes
      // (Japanese) included. The device only ticks the values.
      const deriveFormat = (s) => {
        try {
          const lang = s.userLanguage;
          const probe = (h, hour12) =>
            new Intl.DateTimeFormat(lang, { hour: "numeric", minute: "2-digit", hour12: hour12, timeZone: "UTC" })
              .formatToParts(new Date(Date.UTC(2026, 0, 5, h, 8)));
          const am = probe(9, true);
          const pm = probe(21, true);
          const dpIdx = am.findIndex((p) => p.type === "dayPeriod");
          const hourIdx = am.findIndex((p) => p.type === "hour");
          const dpOf = (parts) => {
            const p = parts.find((x) => x.type === "dayPeriod");
            return p ? p.value : null;
          };
          const meridiemPrefix = dpIdx !== -1 && dpIdx < hourIdx;
          let meridiemSpaced = false;
          if (dpIdx !== -1) {
            const adj = am[meridiemPrefix ? dpIdx + 1 : dpIdx - 1];
            meridiemSpaced = !!(adj && adj.type === "literal" && /\s/.test(adj.value));
          }
          const hourLen = (parts) => {
            const p = parts.find((x) => x.type === "hour");
            return p ? p.value.length : 1;
          };
          // The tables MUST come from the composite format's own part
          // values, not the standalone month/weekday formats: Japanese
          // renders the month as a numeric part plus a literal 月 in the
          // pattern, while the standalone format returns "1月" whole -
          // mixing them would compose the 月 twice.
          const dateFmt = new Intl.DateTimeFormat(lang, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
          const partOf = (date, type) => {
            const p = dateFmt.formatToParts(date).find((x) => x.type === type);
            return p ? p.value : "";
          };
          const weekdays = [];
          // 2026-01-04 is a Sunday; index 0 = Sunday, matching the
          // device's day-of-week numbering
          for (let d = 0; d < 7; d++) weekdays.push(partOf(new Date(Date.UTC(2026, 0, 4 + d)), "weekday"));
          const months = [];
          for (let mo = 0; mo < 12; mo++) months.push(partOf(new Date(Date.UTC(2026, mo, 15)), "month"));
          const datePattern = dateFmt
            .formatToParts(new Date(Date.UTC(2026, 0, 5)))
            .map((p) => (p.type === "literal" ? { t: "literal", v: p.value } : { t: p.type }));
          return {
            am: dpOf(am) || "AM",
            pm: dpOf(pm) || "PM",
            meridiemPrefix: meridiemPrefix,
            meridiemSpaced: meridiemSpaced,
            padHour12: hourLen(am) === 2,
            padHour24: hourLen(probe(9, false)) === 2,
            weekdays: weekdays,
            months: months,
            datePattern: datePattern,
          };
        } catch (e) {
          return null;
        }
      };

      // one #clock_<widgetSettingId>_<page> container per clock instance
      document.querySelectorAll('[id^="clock_"]').forEach((container) => {
        const m = container.id.match(/^clock_(\d+)_(\d+)$/);
        if (!m) return;
        const settings = readSettings(container);
        const measure = (el) => {
          if (!el || el.offsetParent === null) return null;
          const r = el.getBoundingClientRect();
          const span = el.querySelector("span");
          const sr = span ? span.getBoundingClientRect() : r;
          // textfill sets the fitted font-size on the SPAN, not the container
          const cs = getComputedStyle(span || el);
          return {
            rect: { x: r.x, y: r.y, w: r.width, h: r.height },
            textRect: { x: sr.x, y: sr.y, w: sr.width, h: sr.height },
            fontSizePx: parseFloat(cs.fontSize),
            fontWeight: cs.fontWeight,
            align: cs.textAlign,
            color: cs.color,
            fontFamily: cs.fontFamily,
            text: (el.textContent || "").trim(),
          };
        };
        const id = m[1];
        const page = m[2];
        out.push({
          widgetSettingId: parseInt(id, 10),
          page: parseInt(page, 10),
          settings: settings,
          format: settings ? deriveFormat(settings) : null,
          time: measure(document.getElementById("time_" + id + "_" + page)),
          date: measure(document.getElementById("clockDate_" + id + "_" + page)),
        });
      });
      return out;
    });

    return raw
      .filter((c) => c.time || c.date)
      .map((c) => {
        const elements = {};
        // the settings are the truth; the text-derivation below is only
        // the fallback for a scope that could not be read
        const authoritative = !!(c.settings && c.format);
        const tzOffsetMinutes =
          authoritative && c.settings.timeZoneOffset != null
            ? c.settings.timeZoneOffset
            : c.time
              ? deriveTzOffsetMinutes(c.time.text, c.date ? c.date.text : null)
              : null;
        if (c.time) {
          const sample = c.time.text;
          let is24h;
          let padHour;
          if (authoritative) {
            is24h = c.settings.hour24Format;
            padHour = is24h ? c.format.padHour24 : c.format.padHour12;
          } else {
            // No meridiem does NOT imply a 24-hour clock: a 12-hour
            // display renders "8:45" bare. If the disambiguated wall
            // clock says the capture happened at 13:00+ while the sample
            // shows an hour of 12 or less, the display is proven
            // 12-hour. (A morning capture cannot tell them apart; the
            // next afternoon render heals it.)
            is24h = !/am|pm/i.test(sample);
            if (is24h && tzOffsetMinutes != null && parseInt(sample, 10) <= 12 && localMinutesAt(tzOffsetMinutes) >= 780) {
              is24h = false;
            }
            padHour = is24h ? /^\d\d:/.test(sample) : /^0\d:/.test(sample);
          }
          elements.time = {
            rect: c.time.rect,
            textRect: c.time.textRect,
            fontSizePx: c.time.fontSizePx,
            bold: parseInt(c.time.fontWeight, 10) >= 600,
            align: c.time.align,
            color: cssColorToHex(c.time.color),
            fontFamily: primaryFontFamily(c.time.fontFamily),
            is24h,
            padHour,
            // legacy field for channels that predate showMeridiem
            upperMeridiem: /AM|PM/.test(sample),
            sample,
            // the user's toggles and language, verbatim: the device
            // composes only the VALUES, in this format
            ...(authoritative
              ? {
                  showMeridiem: !is24h && c.settings.isMeridiemEnabled,
                  am: c.format.am,
                  pm: c.format.pm,
                  meridiemPrefix: c.format.meridiemPrefix,
                  meridiemSpaced: c.format.meridiemSpaced,
                }
              : {}),
          };
        }
        if (c.date) {
          // with the settings in hand any language goes native; without
          // them only the English "Friday, July 31" shape is safe
          const nativeable = authoritative || /^[A-Za-z]+, [A-Za-z]+ \d{1,2}$/.test(c.date.text);
          if (nativeable) {
            elements.date = {
              rect: c.date.rect,
              textRect: c.date.textRect,
              fontSizePx: c.date.fontSizePx,
              bold: parseInt(c.date.fontWeight, 10) >= 600,
              align: c.date.align,
              color: cssColorToHex(c.date.color),
              fontFamily: primaryFontFamily(c.date.fontFamily),
              sample: c.date.text,
              ...(authoritative
                ? {
                    weekdays: c.format.weekdays,
                    months: c.format.months,
                    pattern: c.format.datePattern,
                  }
                : {}),
            };
          }
        }
        return {
          type: "clock",
          widgetSettingId: c.widgetSettingId,
          page: c.page,
          tzOffsetMinutes,
          elements,
        };
      })
      .filter((o) => Object.keys(o.elements).length > 0);
  },

  async hide(frame, overlays) {
    await frame.evaluate((list) => {
      list.forEach((o) => {
        const suffix = o.widgetSettingId + "_" + o.page;
        if (o.elements.time) {
          const el = document.getElementById("time_" + suffix);
          if (el) el.style.opacity = "0";
        }
        if (o.elements.date) {
          const el = document.getElementById("clockDate_" + suffix);
          if (el) el.style.opacity = "0";
        }
      });
    }, overlays);
  },
};

// ---- GIF / stickers: animated as alpha-preserving film strips ----------
// (MP4 conversion is the wrong tool here: Roku allows ONE active Video
// node per channel and H.264 has no alpha, which kills transparent
// stickers. See NATIVE_WIDGETS.md.)
const crypto = require("crypto");
const fsHandlers = require("fs");
const pathHandlers = require("path");

const GIF_MAX_FRAMES = 36;
const GIF_MAX_STRIP_PIXELS = 4000000; // ~16MB RGBA texture budget per widget

const gifHandler = {
  type: "gif",

  async extract(frame) {
    return await frame.evaluate(() => {
      const out = [];
      document.querySelectorAll('[id^="gif_"]').forEach((container) => {
        const m = container.id.match(/^gif_(\d+)_(\d+)$/);
        if (!m) return;
        const img = container.querySelector("img");
        if (!img || !img.src || img.offsetParent === null) return;
        const box = img.getBoundingClientRect();
        // object-fit: contain -> the drawn content rect inside the box
        let rect = { x: box.x, y: box.y, w: box.width, h: box.height };
        if (img.naturalWidth > 0 && img.naturalHeight > 0 && box.width > 0 && box.height > 0) {
          const scale = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
          const w = img.naturalWidth * scale;
          const h = img.naturalHeight * scale;
          rect = { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, w, h };
        }
        out.push({
          type: "gif",
          widgetSettingId: parseInt(m[1], 10),
          page: parseInt(m[2], 10),
          src: img.src,
          rect,
        });
      });
      return out;
    });
  },

  async hide(frame, overlays) {
    await frame.evaluate((list) => {
      list.forEach((o) => {
        const el = document.getElementById("gif_" + o.widgetSettingId + "_" + o.page);
        if (el) el.style.opacity = "0";
      });
    }, overlays);
  },

  // after extract/hide: fetch each GIF, decode, and write a PNG sprite
  // GRID. Grid, not a single tall strip: GPUs cap texture dimensions
  // (~4096 on low-end Rokus) and an oversized texture silently kills the
  // animation. Big stickers get a reduced-resolution texture (the Poster
  // scales it back up) so they keep a healthy frame count. A sidecar
  // .json carries frame timing so cache hits keep the true speed.
  async process(overlays, ctx) {
    const sharp = require("sharp");
    const MAX_SHEET = 2048; // safe on every Roku GPU
    for (const o of overlays) {
      try {
        const frameW = Math.max(1, Math.round(o.rect.w));
        const frameH = Math.max(1, Math.round(o.rect.h));
        const cacheKey = crypto
          .createHash("md5")
          .update(o.src + "|" + frameW + "x" + frameH + "|grid2")
          .digest("hex");
        const fileName = "overlay_gif_" + cacheKey + ".png";
        const filePath = pathHandlers.join(ctx.outDir, fileName);
        const metaPath = filePath.replace(/\.png$/, ".json");

        if (fsHandlers.existsSync(filePath) && fsHandlers.existsSync(metaPath)) {
          Object.assign(o, JSON.parse(fsHandlers.readFileSync(metaPath, "utf8")));
        } else {
          const resp = await fetch(o.src);
          if (!resp.ok) throw new Error("fetch " + resp.status);
          const buf = Buffer.from(await resp.arrayBuffer());
          const srcMeta = await sharp(buf, { animated: true }).metadata();
          const total = srcMeta.pages || 1;
          if (total < 2) {
            o.skip = true; // not animated - stays in the image
            continue;
          }

          // texture resolution: full size if it fits, else scaled down so
          // ~GIF_MAX_FRAMES frames fit in a MAX_SHEET^2 sheet (never below
          // 35% - big stickers trade pixels for motion)
          let want = Math.min(GIF_MAX_FRAMES, total);
          let texScale = Math.min(1, Math.sqrt(GIF_MAX_STRIP_PIXELS / (want * frameW * frameH)));
          texScale = Math.max(texScale, 0.35);
          const texW = Math.max(1, Math.round(frameW * texScale));
          const texH = Math.max(1, Math.round(frameH * texScale));
          const cols = Math.max(1, Math.min(Math.floor(MAX_SHEET / texW), want));
          const maxRows = Math.max(1, Math.floor(MAX_SHEET / texH));
          const frameBudget = Math.max(2, Math.min(want, cols * maxRows));

          const step = Math.max(1, Math.ceil(total / frameBudget));
          const indices = [];
          for (let i = 0; i < total && indices.length < frameBudget; i += step) indices.push(i);
          const rows = Math.ceil(indices.length / cols);

          const delays = Array.isArray(srcMeta.delay) ? srcMeta.delay : [];
          const avgDelay =
            delays.length > 0
              ? delays.reduce((a, b) => a + (b > 0 ? b : 80), 0) / delays.length
              : 80;

          const frames = [];
          for (const idx of indices) {
            frames.push(
              await sharp(buf, { page: idx }).resize(texW, texH, { fit: "fill" }).png().toBuffer(),
            );
          }
          await sharp({
            create: {
              width: cols * texW,
              height: rows * texH,
              channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
          })
            .composite(
              frames.map((f, i) => ({
                input: f,
                left: (i % cols) * texW,
                top: Math.floor(i / cols) * texH,
              })),
            )
            .png()
            .toFile(filePath);

          const gridMeta = {
            frameCount: indices.length,
            frameMs: Math.round(avgDelay * step),
            cols,
            rows,
          };
          fsHandlers.writeFileSync(metaPath, JSON.stringify(gridMeta));
          Object.assign(o, gridMeta);
        }
        o.stripFile = fileName;
        o.frameW = frameW;
        o.frameH = frameH;
        // the sheet is a Roku workaround for its texture limits; keep the
        // original so a client that decodes GIFs itself can skip it
        o.source = o.src;
        delete o.src;
      } catch (e) {
        console.error("gif strip failed (" + (o.src || "").slice(0, 80) + "):", e.message);
        o.skip = true;
      }
    }
    return overlays.filter((o) => !o.skip);
  },
};

// ---- weather icons: animated SVGs filmed live in the browser -----------
// The icon set (S3 weatherIcons/*.svg) animates via SMIL/CSS, which a
// screenshot freezes. There is no file to decode frames from, so this
// handler captures timed viewport frames AFTER the page screenshot,
// crops the icon rects, and packs the same sprite-grid format the
// GifOverlay already plays (emitted as type "gif" - zero Roku changes).
// The static icon STAYS in the image as fallback; the overlay covers it.
const WX_PERIOD_CAP_S = 12; // longest animation cycle we'll film
const WX_DEFAULT_WINDOW_S = 2.6; // icons whose period we can't parse
const WX_MAX_SHOTS = 180; // 12s period cap at 70ms virtual steps = 171

// pull animation timing out of the SVG source: SMIL dur="9s" attributes
// and CSS animation/animation-duration declarations. Longest one wins -
// filming exactly one full cycle makes the loop wrap seamless (the sun
// finishes its rotation instead of snapping back).
function parseAnimationPeriodSeconds(svgText) {
  const times = [];
  for (const m of svgText.matchAll(/dur=["']([\d.]+)\s*(ms|s)["']/g)) {
    times.push(parseFloat(m[1]) * (m[2] === "ms" ? 0.001 : 1));
  }
  for (const m of svgText.matchAll(/animation(?:-duration)?\s*:\s*([^;}"']+)/g)) {
    for (const t of m[1].matchAll(/([\d.]+)\s*(ms|s)\b/g)) {
      times.push(parseFloat(t[1]) * (t[2] === "ms" ? 0.001 : 1));
    }
  }
  const valid = times.filter((t) => t > 0.05);
  if (!valid.length) return null;
  return Math.max(...valid);
}

/* A filmed weather-icon sheet is identified by icon + rendered size +
 * animation period; the same sun at the same size is byte-identical
 * every time, which is what makes it cacheable across renders. */
function wxSheetKey(o, outScale) {
  const w = Math.round(o.rect.w * outScale);
  const h = Math.round(o.rect.h * outScale);
  return crypto
    .createHash("md5")
    .update([o.src, w, h, o.period || 0].join("|"))
    .digest("hex")
    .slice(0, 16);
}

/* Any sheet already filmed for this icon+size, whatever its content tag. */
function wxCachedSheet(o, outDir, outScale) {
  const key = wxSheetKey(o, outScale);
  let metas;
  try {
    metas = fsHandlers
      .readdirSync(outDir)
      .filter((f) => f.startsWith("overlay_wxc_" + key + "_") && f.endsWith(".json"))
      .sort(
        (a, b) =>
          fsHandlers.statSync(pathHandlers.join(outDir, b)).mtimeMs -
          fsHandlers.statSync(pathHandlers.join(outDir, a)).mtimeMs,
      );
  } catch (e) {
    return null;
  }
  for (const m of metas) {
    try {
      const c = JSON.parse(fsHandlers.readFileSync(pathHandlers.join(outDir, m), "utf8"));
      if (c.stripFile && fsHandlers.existsSync(pathHandlers.join(outDir, c.stripFile))) {
        return { key, file: c.stripFile, ...c };
      }
    } catch (e) {}
  }
  return null;
}

/* ---- Native weather motion (Roku MotionOverlay) -------------------------
 *
 * The icon set animates with three SMIL primitives - animateTransform
 * rotate, animateTransform translate, animate opacity - each on one
 * element, drops chained with begin="0s; c.end+.33s". Every one of those
 * is a thing the device can do itself, every refresh, with a SceneGraph
 * Animation. So instead of filming 86 frames of a sun we ship the rays
 * ONCE as a transparent PNG and say "turn this 45 degrees every 6 seconds
 * about this point". One image per moving part, no filming, no frame
 * cadence, and the motion is as smooth as the renderer. Anything else in
 * an icon (stroke-dashoffset on wind, animateMotion, CSS keyframes) keeps
 * the sprite sheet - the feasibility test below decides per icon.
 *
 * Geometry: the SVG is laid out in a scratch page at WXM_SUPER times the
 * on-screen size, <use> references are inlined so every animated element
 * is actually rendered, and each element's screen matrix maps its local
 * rotation centre / translation vector into icon pixels. Layer PNGs are
 * the whole icon box with only that element painted. */
const WXM_SUPER = 2;
const WXM_MAX_PX = 512;
const WXM_VERSION = "1";

function wxMotionFeasible(svgText) {
  if (!/<animate/i.test(svgText)) return false;
  if (/animateMotion|<set[\s>]|@keyframes|animation\s*:/i.test(svgText)) return false;
  for (const m of svgText.matchAll(/<animate\s[^>]*>/gi)) {
    if (!/attributeName=["']opacity["']/.test(m[0])) return false;
  }
  for (const m of svgText.matchAll(/<animateTransform\s[^>]*>/gi)) {
    if (!/type=["'](rotate|translate)["']/.test(m[0])) return false;
  }
  return true;
}

function wxMotionKey(o, outScale) {
  return crypto
    .createHash("md5")
    .update([WXM_VERSION, o.src, Math.round(o.rect.w * outScale), Math.round(o.rect.h * outScale)].join("|"))
    .digest("hex")
    .slice(0, 16);
}

function wxMotionCached(o, outDir, outScale) {
  const metaFile = pathHandlers.join(outDir, "overlay_wxm_" + wxMotionKey(o, outScale) + ".json");
  try {
    const meta = JSON.parse(fsHandlers.readFileSync(metaFile, "utf8"));
    if (!meta || !Array.isArray(meta.layers) || !meta.layers.length) return null;
    for (const L of meta.layers) {
      if (!L.file || !fsHandlers.existsSync(pathHandlers.join(outDir, L.file))) return null;
    }
    return meta;
  } catch (e) {
    return null;
  }
}

/* SMIL timing -> device timing. A track plays `dur`, then (with a
 * "X.end+gap" begin chain) waits `gap` before going again: that whole
 * span is one device cycle, with the value held through the gap. A
 * negative or positive first `begin` is a phase: an initial delay. */
function wxMotionTiming(a) {
  const secs = (v) => {
    const m = String(v || "").trim().match(/^(-?[\d.]+)\s*(ms|s)?$/);
    return m ? parseFloat(m[1]) * (m[2] === "ms" ? 0.001 : 1) : null;
  };
  const dur = secs(a.dur) || 1;
  let gap = 0;
  let phase = 0;
  const begins = String(a.begin || "0s").split(";").map((x) => x.trim()).filter(Boolean);
  if (begins.length) {
    const first = secs(begins[0]);
    if (first !== null) phase = first;
    for (const b of begins) {
      const m = b.match(/\.end\s*\+\s*(-?[\d.]+)\s*(ms|s)?/);
      if (m) gap = parseFloat(m[1]) * (m[2] === "ms" ? 0.001 : 1);
    }
  }
  const cycle = dur + Math.max(0, gap);
  const delay = ((phase % cycle) + cycle) % cycle;
  return { durS: dur, cycleS: cycle, delayS: delay };
}

async function wxDecompose(page, o, ctx) {
  const sharp = require("sharp");
  const outW = Math.max(1, Math.round(o.rect.w * ctx.outScale));
  const outH = Math.max(1, Math.round(o.rect.h * ctx.outScale));
  const S = Math.min(WXM_MAX_PX, Math.max(64, Math.round(Math.max(outW, outH) * WXM_SUPER)));
  const scratch = await page.context().browser().newPage({ viewport: { width: S, height: S }, deviceScaleFactor: 1 });
  try {
    await scratch.setContent(
      '<!doctype html><html><head><style>html,body{margin:0;background:transparent;overflow:hidden}' +
        "#host{width:" + S + "px;height:" + S + "px}#host svg{width:" + S + "px;height:" + S + "px;display:block}</style></head>" +
        '<body><div id="host">' + o.svgText + "</div></body></html>",
    );
    const plan = await scratch.evaluate(() => {
      const svg = document.querySelector("#host svg");
      if (!svg) return { error: "no svg" };
      /* Inline every <use> as a nested <svg> carrying the symbol's viewBox,
       * so the animated elements exist in the RENDERED tree and have a
       * screen matrix. The originals stay inside <defs> (gradients resolve)
       * but are never rendered, so they are skipped below. */
      const uses = [...svg.querySelectorAll("use")];
      for (const u of uses) {
        const ref = u.getAttribute("href") || u.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "";
        const sym = ref.startsWith("#") ? svg.querySelector(ref) : null;
        if (!sym) continue;
        const inner = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        for (const attr of ["viewBox", "preserveAspectRatio"]) {
          if (sym.hasAttribute(attr)) inner.setAttribute(attr, sym.getAttribute(attr));
        }
        inner.setAttribute("overflow", "visible");
        for (const attr of ["width", "height", "x", "y"]) {
          if (u.hasAttribute(attr)) inner.setAttribute(attr, u.getAttribute(attr));
        }
        for (const child of [...sym.childNodes]) inner.appendChild(child.cloneNode(true));
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        if (u.hasAttribute("transform")) g.setAttribute("transform", u.getAttribute("transform"));
        /* animations that sat on the <use> itself move to the wrapper */
        for (const a of [...u.children]) g.appendChild(a);
        g.appendChild(inner);
        u.parentNode.replaceChild(g, u);
      }
      const rendered = (el) => {
        try {
          return el.getScreenCTM() !== null && !el.closest("defs");
        } catch (e) {
          return false;
        }
      };
      const anims = [...svg.querySelectorAll("animate, animateTransform, animateMotion, set")].filter((a) => rendered(a.parentElement));
      const layers = [];
      const byEl = new Map();
      const list = (v) => String(v || "").split(";").map((x) => x.trim()).filter((x) => x.length);
      for (const a of anims) {
        const el = a.parentElement;
        const tag = a.tagName.toLowerCase();
        const attr = a.getAttribute("attributeName");
        const type = a.getAttribute("type");
        let prop = null;
        if (tag === "animate" && attr === "opacity") prop = "opacity";
        else if (tag === "animatetransform" && attr === "transform" && (type === "rotate" || type === "translate")) prop = type;
        if (!prop) return { error: "unsupported " + tag + " " + (attr || "") + " " + (type || "") };
        if (!byEl.has(el)) {
          byEl.set(el, { tracks: [], el });
          layers.push(byEl.get(el));
        }
        let values = list(a.getAttribute("values"));
        if (!values.length && a.hasAttribute("from") && a.hasAttribute("to")) values = [a.getAttribute("from"), a.getAttribute("to")];
        byEl.get(el).tracks.push({
          prop,
          values,
          keyTimes: list(a.getAttribute("keyTimes")).map(Number),
          dur: a.getAttribute("dur"),
          begin: a.getAttribute("begin"),
        });
        a.remove(); /* base pose for the layer image */
      }
      /* An animated element inside another animated element (a snow
       * flake spins and fades on a <path> whose parent <g> falls): the
       * pixels belong to the INNERMOST one, and the ancestors' motion
       * applies on top as outer levels of a chain. Emitting the parent
       * as its own layer would draw the flake twice. */
      const animatedEls = new Set(layers.map((L) => L.el));
      const out = [];
      let idx = 0;
      for (const L of layers) {
        const hasAnimatedDescendant = [...L.el.querySelectorAll("*")].some((d) => animatedEls.has(d));
        if (hasAnimatedDescendant) continue;
        L.el.setAttribute("data-mm-layer", String(idx));
        const chain = [];
        for (let p = L.el.parentElement; p && p !== svg; p = p.parentElement) {
          if (animatedEls.has(p)) {
            const pm = p.getScreenCTM();
            chain.unshift({ tracks: byEl.get(p).tracks, ctm: pm ? [pm.a, pm.b, pm.c, pm.d, pm.e, pm.f] : [1, 0, 0, 1, 0, 0] });
          }
        }
        const m = L.el.getScreenCTM();
        const cs = getComputedStyle(L.el);
        out.push({
          ctm: m ? [m.a, m.b, m.c, m.d, m.e, m.f] : [1, 0, 0, 1, 0, 0],
          baseOpacity: cs ? parseFloat(cs.opacity) : 1,
          tracks: L.tracks,
          chain,
        });
        idx++;
      }
      return { layers: out };
    });
    if (!plan || plan.error) throw new Error("decompose: " + ((plan && plan.error) || "no plan"));
    if (!plan.layers.length) throw new Error("decompose: nothing animates");

    const toIcon = o.rect.w / S; /* scratch px -> canvas px */
    const key = wxMotionKey(o, ctx.outScale);
    const files = [];
    const shoot = async (css) => {
      await scratch.evaluate((css) => {
        let st = document.getElementById("mm-iso");
        if (!st) {
          st = document.createElement("style");
          st.id = "mm-iso";
          document.head.appendChild(st);
        }
        st.textContent = css;
      }, css);
      return await scratch.screenshot({ type: "png", omitBackground: true, clip: { x: 0, y: 0, width: S, height: S } });
    };
    const writeLayer = async (buf, idx) => {
      /* the box is rect.w x rect.h; the scratch is square S: keep the
       * icon's own aspect by cropping to the drawn extent of the box */
      const w = Math.max(1, Math.round((o.rect.w / o.rect.w) * S));
      const h = Math.max(1, Math.round((o.rect.h / o.rect.w) * S));
      const png = await sharp(buf).extract({ left: 0, top: 0, width: Math.min(w, S), height: Math.min(h, S) }).png().toBuffer();
      const tag = crypto.createHash("md5").update(png).digest("hex").slice(0, 8);
      const name = "overlay_wxm_" + key + "_" + idx + "_" + tag + ".png";
      fsHandlers.writeFileSync(pathHandlers.join(ctx.outDir, name), png);
      return name;
    };
    /* layer 0: everything that does not move */
    const layers = [];
    const staticBuf = await shoot("#host svg [data-mm-layer], #host svg [data-mm-layer] * { visibility: hidden !important }");
    layers.push({ file: await writeLayer(staticBuf, "s"), tracks: [] });
    const convert = (rawTracks, ctm) => {
      const [a, b, c, d, e, f] = ctm;
      const tracks = [];
      for (const t of rawTracks) {
        const timing = wxMotionTiming(t);
        const n = t.values.length;
        if (n < 2) continue;
        let keys = t.keyTimes.length === n ? t.keyTimes.slice() : t.values.map((_, k) => k / (n - 1));
        const scaleT = timing.durS / timing.cycleS;
        keys = keys.map((k) => Math.round(k * scaleT * 1000) / 1000);
        let values;
        let center;
        if (t.prop === "rotate") {
          const parsed = t.values.map((v) => v.split(/[\s,]+/).map(Number));
          values = parsed.map((p) => p[0]);
          const cx = parsed[0][1] || 0;
          const cy = parsed[0][2] || 0;
          center = [Math.round((a * cx + c * cy + e) * toIcon * 100) / 100, Math.round((b * cx + d * cy + f) * toIcon * 100) / 100];
        } else if (t.prop === "translate") {
          values = t.values.map((v) => {
            const [dx, dy] = v.split(/[\s,]+/).map(Number);
            return [Math.round((a * dx + c * (dy || 0)) * toIcon * 100) / 100, Math.round((b * dx + d * (dy || 0)) * toIcon * 100) / 100];
          });
        } else {
          values = t.values.map(Number);
        }
        if (timing.cycleS > timing.durS + 1e-6) {
          keys.push(1);
          values.push(values[values.length - 1]);
        }
        const track = {
          prop: t.prop === "rotate" ? "rotation" : t.prop === "translate" ? "translation" : "opacity",
          cycleMs: Math.round(timing.cycleS * 1000),
          delayMs: Math.round(timing.delayS * 1000),
          keys,
          values,
        };
        if (center) track.center = center;
        tracks.push(track);
      }
      return tracks;
    };
    for (let i = 0; i < plan.layers.length; i++) {
      const L = plan.layers[i];
      const buf = await shoot(
        "#host svg * { visibility: hidden !important } " +
          '#host svg [data-mm-layer="' + i + '"], #host svg [data-mm-layer="' + i + '"] * { visibility: visible !important; opacity: 1 !important }',
      );
      const tracks = convert(L.tracks, L.ctm);
      /* what the layer looks like BEFORE its first loop starts (a delayed
       * drop must wait invisible, not at full opacity) */
      const op = tracks.find((t) => t.prop === "opacity");
      const layer = { file: await writeLayer(buf, i), tracks, opacity: op ? op.values[0] : L.baseOpacity };
      if (L.chain && L.chain.length) layer.chain = L.chain.map((lvl) => ({ tracks: convert(lvl.tracks, lvl.ctm) }));
      layers.push(layer);
    }
    const meta = { layers };
    fsHandlers.writeFileSync(pathHandlers.join(ctx.outDir, "overlay_wxm_" + key + ".json"), JSON.stringify(meta));
    return meta;
  } finally {
    await scratch.close().catch(() => {});
  }
}

function wxMotionFill(o, meta) {
  o.type = "motion";
  o.source = o.src;
  o.layers = meta.layers.map((L) => {
    const out = { file: L.file, tracks: L.tracks || [] };
    if (L.opacity !== undefined && L.opacity !== null) out.opacity = L.opacity;
    if (L.chain && L.chain.length) out.chain = L.chain;
    return out;
  });
  delete o.liveCapture;
  delete o.period;
  delete o.src;
  delete o.svgText;
  delete o.native;
}

const weatherIconHandler = {
  type: "weatherIcon",

  async extract(frame) {
    return await frame.evaluate(() => {
      const seen = [];
      const els = [
        ...document.querySelectorAll('img[id^="icon_"], img[class*="icon_"]'),
      ];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width < 30 || el.offsetParent === null) continue;
        const key = el.id || el.className.toString();
        const m = key.match(/icon_(\d+)_(\d+)/);
        if (!m) continue;
        seen.push({
          type: "gif",
          widgetSettingId: parseInt(m[1], 10),
          page: parseInt(m[2], 10),
          rect: { x: r.x, y: r.y, w: r.width, h: r.height },
          src: el.src,
          liveCapture: true,
        });
      }
      return seen;
    });
  },

  // animation detection happens here (Node side - the S3 icon bucket has
  // no CORS headers, so an in-page fetch cannot read the SVG text). The
  // same fetch yields each icon's animation period for seamless looping.
  async process(overlays, ctx) {
    const bySrc = {};
    for (const o of overlays) {
      if (!(o.src in bySrc)) {
        if (/\.(gif|webp)(\?|$)/i.test(o.src)) {
          // raster animation: no seek API, so this icon (if any exist)
          // forces the film back onto the wall clock
          bySrc[o.src] = { animated: true, period: null, text: null };
        } else {
          try {
            const t = await (await fetch(o.src)).text();
            const animated = /<animate|animateTransform|animateMotion|@keyframes|animation\s*:/i.test(t);
            const period = animated ? parseAnimationPeriodSeconds(t) : null;
            // the text doubles as the inline-swap source for
            // virtual-time filming (see svgSwapIn)
            bySrc[o.src] = { animated, period, text: animated ? t : null };
            if (animated) {
              console.log(
                "wx icon:",
                o.src.split("/").pop().slice(0, 40),
                "period:",
                period ? period + "s" : "unknown",
              );
            }
          } catch (e) {
            bySrc[o.src] = { animated: false, period: null, text: null };
          }
        }
      }
      if (!bySrc[o.src].animated) {
        o.skip = true;
      } else {
        const p = bySrc[o.src].period;
        o.period = p ? Math.min(Math.max(p, 1), WX_PERIOD_CAP_S) : null;
        o.svgText = bySrc[o.src].text;
        /* a device that animates layers itself gets this icon as motion
         * if its SVG decomposes; otherwise it keeps the sheet */
        o.native = !!(ctx && ctx.nativeWeather && o.svgText && wxMotionFeasible(o.svgText));
      }
    }

    /* Publish first, film after. Filming icons for a size we have not
     * seen costs tens of seconds (52s on a fresh container, 2026-09-01)
     * and the page waits on all of it. When deferring, drop the icons
     * whose sheets are not cached: dropped entries are never HIDDEN
     * (see the caller), so they stay baked in the still - frozen for a
     * few seconds rather than missing - and the follow-up capture films
     * them properly. */
    if (ctx && ctx.deferFilming) {
      const pending = [];
      overlays.forEach((o) => {
        if (o.skip) return;
        const cached = o.native
          ? wxMotionCached(o, ctx.outDir, ctx.outScale)
          : wxCachedSheet(o, ctx.outDir, ctx.outScale);
        if (!cached) {
          o.skip = true;
          pending.push(o);
        }
      });
      if (pending.length) {
        if (ctx.filmState) ctx.filmState.pending = true;
        console.log(
          "wx: " + pending.length + " icon sheet(s) need filming - leaving them baked, filming on the follow-up",
        );
      }
    }
    return overlays.filter((o) => !o.skip);
  },

  // The frozen icon is REMOVED from the still (Dave's call): if the
  // animated frames don't cover it exactly - animation overflowing the
  // measured box, or a static icon sitting among animated ones - the
  // baked copy shows through as a stuck ghost. The overlay is the only
  // source of icon pixels. Elements are matched by geometry because one
  // widget's icons share an id/class (5-day forecast).
  async hide(frame, overlays) {
    await frame.evaluate((list) => {
      window.__mmWxHidden = [];
      list.forEach((o) => {
        const sel = "#icon_" + o.widgetSettingId + "_" + o.page + ", .icon_" + o.widgetSettingId + "_" + o.page;
        document.querySelectorAll(sel).forEach((el) => {
          const r = el.getBoundingClientRect();
          if (Math.abs(r.x - o.rect.x) > 2 || Math.abs(r.y - o.rect.y) > 2) return;
          el.style.opacity = "0";
          window.__mmWxHidden.push(el);
        });
      });
    }, overlays);
  },

  async captureAfter(page, frame, items, ctx) {
    /* Motion icons never film: reuse the decomposition or build it in a
     * scratch page (a second or two), then fall through with the rest. */
    for (const o of items.filter((i) => i.liveCapture && i.native)) {
      try {
        let meta = wxMotionCached(o, ctx.outDir, ctx.outScale);
        if (!meta) {
          const t0 = Date.now();
          meta = await wxDecompose(page, o, ctx);
          console.log(
            "wx motion: " + String(o.src).split("/").pop().slice(0, 30) + " -> " + meta.layers.length +
              " layer(s) in " + (Date.now() - t0) + "ms",
          );
        }
        wxMotionFill(o, meta);
      } catch (e) {
        /* decomposition failed: keep this icon on the sheet path */
        console.error("wx motion failed (" + String(o.src).split("/").pop() + "):", e.message);
        o.native = false;
      }
    }
    const live = items.filter((i) => i.liveCapture);
    if (!live.length) return items;
    const sharp = require("sharp");

    // Filming is by far the most expensive thing a render does - a full
    // animation cycle of wall-clock, ~7s. Since the panel double-composite
    // fix the frames carry ONLY icon pixels with alpha elsewhere, so a
    // sheet depends solely on WHICH icon at WHAT size, not on whatever is
    // behind it. That makes it cacheable: the same sun over the same
    // forecast tile produces byte-identical frames every render, and the
    // set only changes when the actual weather does.
    const wxKey = (o) => wxSheetKey(o, ctx.outScale);
    // Look up ANY sheet filmed for this icon+size, whatever its content
    // tag. The tag exists because filming is not deterministic: the same
    // sun filmed twice yields different frame counts (the sampling rate
    // follows the FASTEST icon on the page, so adding a rain icon
    // re-samples every sheet). Writing that under the old name left TVs
    // pairing a cached 14-frame texture with a 44-column grid - the icons
    // crawl sideways through garbage. Content in the name, always.
    const cachedFor = (o) => wxCachedSheet(o, ctx.outDir, ctx.outScale);

    const hits = live.map(cachedFor);
    if (hits.every(Boolean)) {
      live.forEach((o, i) => {
        const c = hits[i];
        o.source = o.src;
        o.stripFile = c.stripFile;
        o.frameW = c.frameW;
        o.frameH = c.frameH;
        o.frameCount = c.frameCount;
        o.cols = c.cols;
        o.rows = c.rows;
        o.frameMs = c.frameMs;
        delete o.liveCapture;
        delete o.period;
        delete o.src;
        delete o.svgText;
      });
      console.log("wx: " + live.length + " icon sheet(s) reused from cache, filming skipped");
      return items;
    }
    await ctx.reenableAnimations();
    // The still is already saved, so the page can be stripped to nothing
    // but the icons: restore them, then blank every background/shadow/
    // blur so the filmed frames carry ONLY icon pixels with alpha
    // elsewhere. Compositing icon-only frames over the still (which has
    // the panel but no icon) avoids double-drawing semi-transparent
    // panels, which showed as a faint square around each icon.
    await frame.evaluate(() => {
      (window.__mmWxHidden || []).forEach((el) => {
        el.style.opacity = "";
      });
      window.__mmWxHidden = [];
    });
    await frame.addStyleTag({
      content:
        "/*mm-film*/" +
        "*,*::before,*::after{background:transparent !important;" +
        "box-shadow:none !important;backdrop-filter:none !important;" +
        "-webkit-backdrop-filter:none !important;border-color:transparent !important;}",
    });
    await page.addStyleTag({ content: "/*mm-film*/html,body{background:transparent !important;}" });
    await page.waitForTimeout(200);

    // film long enough to cover the longest icon cycle
    const periods = live.map((o) => o.period || WX_DEFAULT_WINDOW_S);
    const windowS = Math.min(WX_PERIOD_CAP_S, Math.max(...periods));

    // Virtual time whenever every icon's clock is scriptable (SVG text in
    // hand): paused + seeked in exact 70ms steps, so frame spacing never
    // depends on screenshot cost - real-time sampling gave the widget sun
    // 230-500ms frames (Dave: jerky, 2026-08-26). A raster (gif/webp)
    // icon has no seek API; one of those present falls the whole film
    // back to the wall clock rather than mixing two timelines.
    const svgBySrc = {};
    let allSeekable = true;
    for (const o of live) {
      if (o.svgText) svgBySrc[o.src] = o.svgText;
      else allSeekable = false;
    }

    const shots = [];
    const stamps = [];
    let realGapMs;
    // always alpha: the page is stripped to icons-only for filming, in
    // both layered and normal pages
    const shotOpts = { type: "png", omitBackground: true };
    if (allSeekable) {
      await svgSwapIn(frame, svgBySrc);
      await pauseAllAnimations(frame);
      const steps = Math.min(WX_MAX_SHOTS, Math.round((windowS * 1000) / CW_STEP_MS));
      for (let i = 0; i < steps; i++) {
        await seekVirtual(frame, CW_WARMUP_MS + i * CW_STEP_MS);
        stamps.push(i * CW_STEP_MS);
        shots.push(await page.screenshot(shotOpts));
      }
      await svgSwapOut(frame);
      await resumeAllAnimations(frame);
      realGapMs = CW_STEP_MS;
    } else {
      const targetDt = Math.min(0.2, Math.max(0.08, Math.min(...periods) / 12));
      const t0 = Date.now();
      while (Date.now() - t0 < windowS * 1000 && shots.length < WX_MAX_SHOTS) {
        stamps.push(Date.now() - t0);
        shots.push(await page.screenshot(shotOpts));
        await page.waitForTimeout(targetDt * 1000);
      }
      realGapMs = shots.length > 1 ? (stamps[stamps.length - 1] - stamps[0]) / (shots.length - 1) : 200;
    }

    // stale capture sheets from previous renders (keep ~10 min for the
    // manifest still live on devices)
    for (const f of fsHandlers.readdirSync(ctx.outDir)) {
      if (!f.startsWith("overlay_wx_")) continue; // legacy per-render sheets only
      try {
        const p = pathHandlers.join(ctx.outDir, f);
        if (Date.now() - fsHandlers.statSync(p).mtimeMs > 600000) fsHandlers.unlinkSync(p);
      } catch (e) {}
    }

    const shotMeta = await sharp(shots[0]).metadata();
    for (const o of live) {
      try {
        const dr = {
          left: Math.round(o.rect.x * ctx.outScale),
          top: Math.round(o.rect.y * ctx.outScale),
          width: Math.max(1, Math.round(o.rect.w * ctx.outScale)),
          height: Math.max(1, Math.round(o.rect.h * ctx.outScale)),
        };
        dr.left = Math.min(Math.max(0, dr.left), shotMeta.width - 1);
        dr.top = Math.min(Math.max(0, dr.top), shotMeta.height - 1);
        dr.width = Math.min(dr.width, shotMeta.width - dr.left);
        dr.height = Math.min(dr.height, shotMeta.height - dr.top);

        // keep only the frames spanning THIS icon's cycle so its loop
        // wraps exactly where the animation restarts
        const periodMs = (o.period || WX_DEFAULT_WINDOW_S) * 1000;
        let count = stamps.filter((s) => s < periodMs).length;
        count = Math.max(2, Math.min(count, shots.length));
        const capacity =
          Math.max(1, Math.floor(2048 / dr.width)) * Math.max(1, Math.floor(2048 / dr.height));
        const stride = Math.max(1, Math.ceil(count / capacity));
        const picked = [];
        for (let i = 0; i < count; i += stride) picked.push(i);

        const frames = [];
        for (const idx of picked) frames.push(await sharp(shots[idx]).extract(dr).png().toBuffer());
        const cols = Math.max(1, Math.min(Math.floor(2048 / dr.width), frames.length));
        const rows = Math.ceil(frames.length / cols);
        // Keyed by icon + size (so the next render reuses it instead of
        // filming the same sun again) PLUS a hash of the sheet's own
        // pixels. A device caches these textures by URL, so re-filmed
        // content MUST get a new URL - otherwise the manifest's new
        // cols/rows/frameCount are applied to the old cached image and
        // the icon crawls sideways.
        const sheetBuf = await sharp({
          create: {
            width: cols * dr.width,
            height: rows * dr.height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite(
            frames.map((f, i) => ({
              input: f,
              left: (i % cols) * dr.width,
              top: Math.floor(i / cols) * dr.height,
            })),
          )
          .png()
          .toBuffer();
        const contentTag = crypto.createHash("md5").update(sheetBuf).digest("hex").slice(0, 8);
        const fileName = "overlay_wxc_" + wxKey(o) + "_" + contentTag + ".png";
        fsHandlers.writeFileSync(pathHandlers.join(ctx.outDir, fileName), sheetBuf);
        // older variants of this icon linger 10 min for manifests still
        // live on devices, then go
        for (const f of fsHandlers.readdirSync(ctx.outDir)) {
          if (!f.startsWith("overlay_wxc_" + wxKey(o) + "_")) continue;
          if (f.startsWith(fileName.replace(/\.png$/, ""))) continue;
          try {
            const p = pathHandlers.join(ctx.outDir, f);
            if (Date.now() - fsHandlers.statSync(p).mtimeMs > 600000) fsHandlers.unlinkSync(p);
          } catch (e) {}
        }

        o.stripFile = fileName;
        o.frameW = o.rect.w;
        o.frameH = o.rect.h;
        o.frameCount = frames.length;
        o.cols = cols;
        o.rows = rows;
        o.frameMs = Math.max(60, Math.round(realGapMs * stride));
        try {
          fsHandlers.writeFileSync(
            pathHandlers.join(ctx.outDir, fileName.replace(/\.png$/, ".json")),
            JSON.stringify({
              stripFile: fileName,
              frameW: o.frameW,
              frameH: o.frameH,
              frameCount: o.frameCount,
              cols: o.cols,
              rows: o.rows,
              frameMs: o.frameMs,
            }),
          );
        } catch (e) {}
        console.log(
          "wx sheet:",
          o.widgetSettingId,
          (o.src || "").split("/").pop().slice(0, 30),
          frames.length + "f @" + o.frameMs + "ms, cycle " + Math.round(periodMs / 100) / 10 + "s",
        );
        // the sprite sheet is a Roku workaround for its texture limits;
        // a client that can animate the SVG itself wants the original
        o.source = o.src;
        o.sourcePeriodMs = Math.round(periodMs);
        delete o.liveCapture;
        delete o.period;
        delete o.src;
        delete o.svgText;
      } catch (e) {
        console.error("weather icon capture failed:", e.message);
        o.skip = true;
      }
    }
    return items.filter((o) => !o.skip);
  },
};

// ---- virtual-time filming helpers --------------------------------------
// Shared by the weather-icon and cell-weather films. The principle: pause
// every clock on the page and SEEK it in exact steps, so frame spacing
// never depends on screenshot cost. Two clock families exist:
// - CSS animations: Web Animations API (getAnimations -> currentTime)
// - SMIL inside SVG files: an <img>-embedded SVG is OPAQUE, its SMIL
//   keeps running in real time while everything else is frozen (the sun
//   spun ~3x fast, Dave 2026-08-26). Each such img is swapped for an
//   INLINE copy of its SVG - inline SVG exposes pauseAnimations() and
//   setCurrentTime() - and swapped back after the film.

// swap every <img> whose src appears in svgBySrc for an inline copy
async function svgSwapIn(frame, svgBySrc) {
  await frame.evaluate((map) => {
    window.__mmSvgSwaps = [];
    let uidSeq = 0;
    document.querySelectorAll("img").forEach((img) => {
      let text = map[img.src];
      if (!text || !img.parentNode) return;
      // Icon sets reuse one-letter internal ids (id="a" gradients,
      // id="b" symbols). Inline several icons at once and those ids
      // collide DOCUMENT-wide: url(#a)/href="#b" resolve to whichever
      // copy came first, and the losers render nothing - the fleet's
      // suns came out as fully transparent sheets (2026-08-26). Every
      // instance gets its ids namespaced, so each copy is self-contained.
      const uid = "-mmswap" + uidSeq++;
      text = text
        .replace(/id=("([^"]+)"|'([^']+)')/g, (m, q, d, s) => 'id="' + (d || s) + uid + '"')
        .replace(/url\(#([^)]+)\)/g, (m, id) => "url(#" + id + uid + ")")
        .replace(/(xlink:href|href)=("#([^"]+)"|'#([^']+)')/g, (m, attr, q, d, s) => attr + '="#' + (d || s) + uid + '"')
        // SMIL syncbase refs: rain.svg chains its drops with
        // begin="0s; c.end+.33s" - rename those ids too, or each drop
        // fires once and waits forever on an event that never comes
        // (the widget rain lost its drops this way, 2026-08-26)
        .replace(/(begin|end)=("([^"]*)"|'([^']*)')/g, (m, attr, q, d, s) => {
          const v = (d !== undefined ? d : s).replace(
            /([A-Za-z_][\w-]*)\.(begin|end|repeat)/g,
            (mm, id, evt) => id + uid + "." + evt,
          );
          return attr + '="' + v + '"';
        });
      const holder = document.createElement("div");
      holder.innerHTML = text;
      const svg = holder.querySelector("svg");
      if (!svg) return;
      svg.setAttribute("class", img.getAttribute("class") || "");
      if (img.id) svg.id = img.id;
      // the img's inline style carries its positioning/sizing (the
      // portal sets icon heights inline) - the stand-in must inherit it
      // or it falls out of the crop rect entirely
      svg.setAttribute("style", img.getAttribute("style") || "");
      const r = img.getBoundingClientRect();
      svg.style.width = r.width + "px";
      svg.style.height = r.height + "px";
      img.parentNode.replaceChild(svg, img);
      try {
        svg.pauseAnimations();
      } catch (e) {}
      window.__mmSvgSwaps.push({ svg, img });
    });
  }, svgBySrc);
}

async function svgSwapOut(frame) {
  await frame
    .evaluate(() => {
      (window.__mmSvgSwaps || []).forEach((rec) => {
        try {
          if (rec.svg.parentNode) rec.svg.parentNode.replaceChild(rec.img, rec.svg);
        } catch (e) {}
      });
      window.__mmSvgSwaps = null;
    })
    .catch(() => {});
}

// collect AFTER svgSwapIn so the inline svgs' CSS animations join in
async function pauseAllAnimations(frame) {
  await frame.evaluate(() => {
    const list = document.getAnimations ? document.getAnimations({ subtree: true }) : [];
    window.__mmPausedAnims = list.map((a) => ({ a, t: a.currentTime }));
    list.forEach((a) => {
      try {
        a.pause();
      } catch (e) {}
    });
  });
}

async function resumeAllAnimations(frame) {
  await frame
    .evaluate(() => {
      (window.__mmPausedAnims || []).forEach((rec) => {
        try {
          rec.a.currentTime = rec.t;
          rec.a.play();
        } catch (e) {}
      });
      window.__mmPausedAnims = null;
    })
    .catch(() => {});
}

// pose the whole page at vtMs of virtual time; the double-rAF is the
// compositor-commit lesson from the celebrations filming
async function seekVirtual(frame, vtMs) {
  await frame.evaluate((vt) => {
    (window.__mmPausedAnims || []).forEach((rec) => {
      try {
        rec.a.currentTime = vt;
      } catch (e) {}
    });
    (window.__mmSvgSwaps || []).forEach((rec) => {
      try {
        rec.svg.setCurrentTime(vt / 1000);
      } catch (e) {}
    });
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, vtMs);
}

// ---- calendar cell weather (the 10-day forecast strips) ----------------
// Each day cell's decoration (util/calendarWeatherOverlay.js) is a strip
// of pure-CSS animation: rain/snow/hail particles, drifting clouds, beam
// sweeps, plus a small animated icon. mm-weather-settle keeps all of it
// out of the still (gradient + temps stay baked); this handler films the
// LIVE animation once per condition type + strip size - Dave's call
// (2026-08-26): "rain is always rain" - and replays it on the TV through
// the ordinary gif-overlay path. Sheets are cached like the icon sheets,
// so filming happens only when a new condition or size first appears.
const CW_PERIODS_S = {
  // window = the slowest major element's cycle, so the big features loop
  // cleanly; individual particles have mixed periods and may seam, which
  // is invisible at strip height
  sunny: 5.6, cloudy: 13, "partly-cloudy": 13, fog: 8.4, rain: 5,
  "sun-rain": 5.2, storm: 6.8, snow: 5.4, "sun-snow": 5.4,
  "wind-snow": 5.4, wind: 5.2, frigid: 5.2, hail: 5.4,
};
const CW_DEFAULT_PERIOD_S = 5.5;
const CW_STEP_MS = 70; // virtual-time sampling interval = playback frameMs
const CW_MAX_SHOTS = 200; // 13s cloudy cycle at 70ms = 186 steps
// No deliberate striding: slow drift is exactly where a lower frame rate
// shows as stepping (Dave: clouds jerking at the strided 140ms), and at
// strip size even a 186-frame sheet sits far under the texture cap. The
// sheet-capacity stride below remains purely as the safety valve.
const CW_TARGET_FRAMES = CW_MAX_SHOTS;
// Skip the ensemble's startup transient: during a particle's
// animation-delay it renders PARKED at its base spot, so t=0 shows
// every raindrop lined up at the top of the cell - and the loop wrap
// replayed that lineup every cycle (Dave saw it). The largest delay in
// the portal's patterns is 2.2s (wind); past it, every particle is in
// its periodic regime and any window is as good as any other.
const CW_WARMUP_MS = 3000;

/* ---- month-cell scrolling: DETECTION PASS (2026-09-02) ---------------
 * Month cells hold more events than fit. Other platforms marquee them
 * (js/directives/mangoMirrorScroll.js: top: boxHeight -> top: -innerHeight,
 * linear, looping, duration = (box+inner) * 19 Fast / * 35 Slow); painted
 * displays cannot, so they show "+2 more".
 *
 * The plan is to film that marquee and ship it as a sprite the device
 * plays - mimicking the portal exactly. This pass only MEASURES and
 * LOGS: it emits no overlays and changes no pixels, so we can confirm
 * the selectors against a real display before touching anything.
 *
 * The directive tags the content it animates with `-m-scroll-c` and its
 * parent with `-m-scroll-p`, and only when the cell actually overflows -
 * which makes those classes a precise "needs scrolling" marker. */
/* ---- month-cell scrolling ---------------------------------------------
 * A TV shows a photograph of the portal, so it cannot scroll. Month cells
 * holding more events than fit are MARQUEED there
 * (js/directives/mangoMirrorScroll.js animates top from +boxHeight to
 * -innerHeight, linear, looping) - a still lands at a random point in
 * that cycle, and at the start and end of every cycle the content sits
 * entirely outside its window, so the cell photographs EMPTY.
 *
 * So we film the marquee and hand the device a sprite that moves
 * identically. The portal tells us which cells scroll and how, on
 * window.mmScrollCells - the directive publishes it, because it already
 * computes the geometry and the duration; inferring that from outside
 * missed cells in testing and would break the next time that file moves.
 *
 * All cells advance on ONE shared screenshot timeline: set every cell's
 * top for frame k, take one screenshot, crop them all. Cost is therefore
 * the LONGEST cell's cycle, not the sum - and each cell keeps its own
 * frame count, so a short cell loops quickly and a tall one slowly, just
 * as the portal does. */
/* Cap on frames per cell. Every frame is a screenshot, so this is the
 * filming cost; it is also the sheet size. Starting at the window's edge
 * rather than the cell's drops the dead lead-in, so a given budget buys a
 * smaller step - 300 frames leaves well under
 * half an output pixel per frame on a typical cell, which reads as a crawl
 * rather than stepping. */
/* Raised 300 -> 700 with the move to 30fps: a typical cell's loop is ~22s
 * = 660 frames; a longer one hits the cap and plays a little slower per
 * frame, which the stride logic below already handles. The cold-start
 * filming cost roughly doubles (~4 minutes for a cell group) - deferred
 * and cached, so paid once per deploy, not per render. */
const CS_MAX_FRAMES = 700;
/* The marquee is a constant-velocity scroller - speed = (boxHeight +
 * innerHeight) * 35 for Slow, * 19 for Fast - so it always travels
 * 1000/35 = 28.6 px/s or 1000/19 = 52.6 px/s whatever the cell's size.
 * That is comfortable on a tablet at arm's length and too quick to read
 * across a room, so a television plays it at 1/CS_TV_PACE of that
 * (Dave, 2026-09-02). This is a deliberate divergence from the portal,
 * not a correction - an earlier 1.6x fudge pretended to be the latter.
 *
 * Slowing down is done by filming MORE frames, not by holding each one
 * longer: the frame count comes from the television's cycle, so each
 * frame still shows for ~CS_PLAY_MS and the step between frames gets
 * smaller. Holding 66 frames for 3x as long would drop it to 5fps and
 * turn the scroll into visible stepping. */
/* THE knob. It multiplies the portal's own cycle, and the portal has
 * already folded Fast vs Slow into that (speed = travel * 19 for Fast,
 * * 35 for Slow), so one number covers both modes and keeps their ratio:
 *
 *   Slow  28.6 px/s / 4 = 7.2 px/s
 *   Fast  52.6 px/s / 4 = 13.2 px/s
 *
 * History: 3 was too quick across a room; 12 was approved while a filming
 * bug (siblings still animating at portal speed) was adding motion that
 * was not the sprite's own - once that was fixed the true 2.4 px/s read as
 * too slow (Dave, 2026-09-02: "needs to be double the current speed"),
 * and 6 - 4.8 px/s, verified on the device - still read slow to him, so
 * 4. A typical month cell - ~105px of travel - comes round in ~15s.
 *
 * CS_PLAY_MS is the frame hold the count is derived from. 33ms is the
 * device's floor (GifOverlay clamps there - two refreshes at 60Hz). Rain
 * is smooth at 70ms because a drop moves several pixels a frame; slowly
 * scrolling TEXT is the hardest case for a frame stepper, because the eye
 * tracks the letters and sees every update, so it gets the full 30fps
 * with a step around a tenth of an output pixel (Dave, 2026-09-02: "the
 * rain is nice and smooth, but this still looks a bit jerky"). */
const CS_TV_PACE = 4;
const CS_PLAY_MS = 33;
/* The old 1:1 note, kept because the arithmetic still matters: the marquee is
 * a constant-velocity scroller - speed = (boxHeight + innerHeight) * 35
 * for Slow, * 19 for Fast - so it always travels 1000/35 = 28.6 px/s or
 * 1000/19 = 52.6 px/s whatever the cell's size. Filming durationMs over
 * frameCount frames and playing them at durationMs/frameCount reproduces
 * exactly that. A "looks fast on a TV" fudge factor lived here briefly
 * (2026-09-02) and was wrong: it desynchronised the sprite from the
 * portal it is supposed to be a photograph of. If the pace needs to
 * change, change scrolling speed in the portal, where every display
 * gets it. */

/* Bump when the filmed motion changes meaning, so sheets cached under the
 * old geometry are not reused: the key is otherwise all inputs, and travel
 * changed from boxHeight+innerHeight to a seamless innerHeight. */
const CS_FILM_VERSION = "7-pace4";

function csKey(o, outScale) {
  return crypto
    .createHash("md5")
    .update(
      [
        CS_FILM_VERSION,
        o.date || "",
        /* widgetSettingId, not widgetId: extract() has only ever set the
         * former, so this term was the empty string for every cell and the
         * key carried no widget identity at all. Two calendars sized alike,
         * on the same date, with the same content height and duration would
         * have shared one sheet. */
        o.widgetSettingId || "",
        Math.round(o.rect.w * outScale),
        Math.round(o.rect.h * outScale),
        Math.round(o.innerHeight),
        Math.round(o.durationMs),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16);
}

function csCachedSheet(o, outDir, outScale) {
  const key = csKey(o, outScale);
  let metas;
  try {
    metas = fsHandlers
      .readdirSync(outDir)
      .filter((f) => f.startsWith("overlay_cs_" + key + "_") && f.endsWith(".json"));
  } catch (e) {
    return null;
  }
  for (const m of metas) {
    try {
      const c = JSON.parse(fsHandlers.readFileSync(pathHandlers.join(outDir, m), "utf8"));
      if (c.stripFile && fsHandlers.existsSync(pathHandlers.join(outDir, c.stripFile))) return c;
    } catch (e) {}
  }
  return null;
}


/* ---- native scroll: one strip per cell, the device does the motion ----
 *
 * Instead of filming every frame of the marquee (up to CS_MAX_FRAMES
 * screenshots a cell) the content is photographed ONCE as a tall
 * transparent strip - ceil(innerHeight / window) screenshots, each showing
 * the next window-height of it - and the manifest tells the device where
 * the window is and how far to slide the strip: +window -> -stripH, the
 * portal's own path minus its dead lead-in. The Roku's ScrollOverlay
 * animates that every refresh, sub-pixel. The pace is durationMs, computed
 * at fill time from CS_TV_PACE and the live geometry, so a pace change
 * needs no refilm. Emitted only where capture.js says the device's client
 * understands "scroll" (ctx.nativeScroll); everyone else keeps the sheets.
 * The blanking, alpha and ancestor-background handling are the sheet
 * path's, repeated so the two stay independent until the sheets can go. */
const CS_STRIP_SALT = "strip-1";
const CS_SEG_MAX = 2048; /* Roku texture cap, output px */

function csStripKey(o, outScale) {
  return crypto
    .createHash("md5")
    .update(
      [
        CS_STRIP_SALT,
        o.date || "",
        o.widgetSettingId || "",
        Math.round(o.rect.w * outScale),
        Math.round(o.rect.h * outScale),
        Math.round(o.innerHeight),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16);
}

function csCachedStrip(o, outDir, outScale) {
  const key = csStripKey(o, outScale);
  let metas;
  try {
    metas = fsHandlers
      .readdirSync(outDir)
      .filter((f) => f.startsWith("overlay_ss_" + key + "_") && f.endsWith(".json"));
  } catch (e) {
    return null;
  }
  for (const m of metas) {
    try {
      const c = JSON.parse(fsHandlers.readFileSync(pathHandlers.join(outDir, m), "utf8"));
      if (
        c.segments &&
        c.segments.length &&
        c.segments.every((s) => fsHandlers.existsSync(pathHandlers.join(outDir, s.file)))
      )
        return c;
    } catch (e) {}
  }
  return null;
}

/* the television's loop for this cell, from the live geometry: same px/s
 * the sheet path uses, over +window -> -innerHeight */
function csTvDuration(o) {
  const pxPerSec = ((o.boxHeight + o.innerHeight) / o.durationMs) * 1000;
  const tvPxPerSec = pxPerSec / CS_TV_PACE;
  const travel = o.rect.h + o.innerHeight;
  return { ms: (travel / tvPxPerSec) * 1000, pxPerSec: tvPxPerSec };
}

async function csCaptureStrips(page, frame, items, ctx) {
  const live = items.filter((i) => i.liveCapture);
  if (!live.length) return items;
  const sharp = require("sharp");

  const fill = (o, meta) => {
    const tv = csTvDuration(o); /* before durationMs is overwritten below */
    o.type = "scroll";
    if (meta.rect) o.rect = { ...meta.rect };
    o.segments = meta.segments.map((s) => ({ ...s }));
    o.stripFile = meta.segments[0].file; /* first piece, for tooling that lists by stripFile */
    o.stripW = meta.stripW;
    o.stripH = meta.stripH;
    o.fromY = o.rect.h;
    o.toY = -meta.stripH;
    o.durationMs = Math.round(tv.ms);
    o.loop = true;
    delete o.liveCapture;
    delete o.idx;
    delete o.boxHeight;
    delete o.innerHeight;
    delete o.speed;
    delete o._slices;
  };

  const hits = live.map((o) => csCachedStrip(o, ctx.outDir, ctx.outScale));
  if (hits.every(Boolean)) {
    live.forEach((o, i) => fill(o, hits[i]));
    console.log("cellScroll: " + live.length + " cell(s) from cached strips");
    return items;
  }
  const need = live.filter((o, i) => !hits[i]);
  need.forEach((o) => {
    o._slices = Math.max(1, Math.ceil(o.innerHeight / Math.max(1, o.rect.h)));
  });
  const steps = Math.max(...need.map((o) => o._slices));

  await frame.evaluate((idxs) => {
    const park = document.getElementById("mm-scroll-park");
    if (park) park.disabled = true;
    const list = window.mmScrollCells || [];
    window.__mmCsBg = window.__mmCsBg || [];
    idxs.forEach((i) => {
      const c = list[i];
      if (!c || !c.content) return;
      for (let n = c.content.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        if (window.__mmCsBg.some((e) => e.el === n)) continue;
        window.__mmCsBg.push({ el: n, bg: n.style.getPropertyValue("background"), pri: n.style.getPropertyPriority("background") });
        n.style.setProperty("background", "transparent", "important");
      }
    });
    list.forEach((c) => {
      if (!c.content) return;
      if (window.jQuery) {
        try {
          const par = c.content.parentElement;
          const all = par ? par.querySelectorAll(".-m-scroll-c") : [c.content];
          window.jQuery(all.length ? all : [c.content]).stop(true, false);
        } catch (e) {}
      }
      const b0 = c.content.parentElement || c.content;
      b0.style.visibility = "";
      b0.style.opacity = "";
    });
  }, need.map((o) => o.idx));
  await frame.addStyleTag({ content: "/*mm-film*/html,body,#main{background:transparent !important}" });
  await page.addStyleTag({ content: "/*mm-film*/html,body{background:transparent !important}" });
  const t0 = Date.now();
  try {
    const shots = [];
    for (let k = 0; k < steps; k++) {
      await frame.evaluate(
        (args) => {
          const list = window.mmScrollCells || [];
          args.cells.forEach((cell) => {
            const c = list[cell.idx];
            if (!c || !c.content) return;
            /* slice k: the window shows content rows [k*winH, (k+1)*winH) */
            const top = -args.k * cell.winH;
            const par = c.content.parentElement;
            const all = par ? par.querySelectorAll(".-m-scroll-c") : [c.content];
            (all.length ? all : [c.content]).forEach((el) => (el.style.top = top + "px"));
          });
          return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        },
        { k, cells: need.map((o) => ({ idx: o.idx, winH: o.rect.h })) },
      );
      shots.push(await page.screenshot({ type: "png", omitBackground: true }));
    }
    const shotMeta = await sharp(shots[0]).metadata();
    for (const o of need) {
      try {
        const dr = {
          left: Math.round(o.rect.x * ctx.outScale),
          top: Math.round(o.rect.y * ctx.outScale),
          width: Math.max(1, Math.round(o.rect.w * ctx.outScale)),
          height: Math.max(1, Math.round(o.rect.h * ctx.outScale)),
        };
        dr.left = Math.min(Math.max(0, dr.left), shotMeta.width - 1);
        dr.top = Math.min(Math.max(0, dr.top), shotMeta.height - 1);
        dr.width = Math.min(dr.width, shotMeta.width - dr.left);
        dr.height = Math.min(dr.height, shotMeta.height - dr.top);
        const stripH = Math.max(1, Math.min(Math.round(o.innerHeight * ctx.outScale), o._slices * dr.height));
        const pieces = [];
        for (let k = 0; k < o._slices; k++) {
          pieces.push(await sharp(shots[Math.min(k, shots.length - 1)]).extract(dr).png().toBuffer());
        }
        const stripBuf = await sharp({
          create: { width: dr.width, height: o._slices * dr.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
        })
          .composite(pieces.map((p, i) => ({ input: p, left: 0, top: i * dr.height })))
          .png()
          .toBuffer();
        /* key from the rect process() saw, before it is snapped */
        const key = csStripKey(o, ctx.outScale);
        o.rect = {
          x: dr.left / ctx.outScale,
          y: dr.top / ctx.outScale,
          w: dr.width / ctx.outScale,
          h: dr.height / ctx.outScale,
        };
        const tag = crypto.createHash("md5").update(stripBuf).digest("hex").slice(0, 8);
        const segments = [];
        for (let y = 0, i = 0; y < stripH; i++) {
          const h = Math.min(CS_SEG_MAX, stripH - y);
          const buf = await sharp(stripBuf).extract({ left: 0, top: y, width: dr.width, height: h }).png().toBuffer();
          const file = "overlay_ss_" + key + "_" + tag + "_" + i + ".png";
          fsHandlers.writeFileSync(pathHandlers.join(ctx.outDir, file), buf);
          segments.push({ file, h: h / ctx.outScale });
          y += h;
        }
        const meta = { rect: { ...o.rect }, segments, stripW: dr.width / ctx.outScale, stripH: stripH / ctx.outScale };
        fsHandlers.writeFileSync(
          pathHandlers.join(ctx.outDir, "overlay_ss_" + key + "_" + tag + ".json"),
          JSON.stringify(meta),
        );
        const tv = csTvDuration(o);
        console.log(
          "cellScroll strip: " + o.date + " " + o._slices + " shot(s), " + stripH + "px, loop " +
            Math.round(tv.ms / 100) / 10 + "s, " + Math.round(tv.pxPerSec * 10) / 10 + " px/s (native)",
        );
        fill(o, meta);
      } catch (e) {
        console.error("cell scroll strip failed (" + o.date + "):", e.message);
        o.skip = true;
      }
    }
  } finally {
    await frame.evaluate((idxs) => {
      const park = document.getElementById("mm-scroll-park");
      if (park) park.disabled = false;
      (window.__mmCsBg || []).forEach((e) => {
        if (e.bg) e.el.style.setProperty("background", e.bg, e.pri || "");
        else e.el.style.removeProperty("background");
      });
      window.__mmCsBg = [];
      document.querySelectorAll("style").forEach((n) => {
        if ((n.textContent || "").includes("mm-film")) n.remove();
      });
      const list = window.mmScrollCells || [];
      list.forEach((c) => {
        if (c && c.content) {
          const par = c.content.parentElement;
          const all = par ? [...par.querySelectorAll(".-m-scroll-c")] : [c.content];
          (all.length ? all : [c.content]).forEach((el) => (el.style.top = ""));
        }
      });
      idxs.forEach((i) => {
        const c = list[i];
        if (c && c.content) {
          const b = c.content.parentElement || c.content;
          b.style.setProperty("visibility", "hidden", "important");
          b.style.setProperty("opacity", "0", "important");
        }
      });
    }, need.filter((o) => !o.skip).map((o) => o.idx));
    await page
      .evaluate(() => {
        document.querySelectorAll("style").forEach((n) => {
          if ((n.textContent || "").includes("mm-film")) n.remove();
        });
      })
      .catch(() => {});
  }
  live.forEach((o, i) => {
    if (hits[i]) fill(o, hits[i]);
  });
  console.log("cellScroll: captured " + need.filter((o) => !o.skip).length + " strip(s) in " + (Date.now() - t0) + "ms");
  return items.filter((o) => !o.skip);
}

const cellScrollHandler = {
  type: "cellScroll",

  async extract(frame) {
    const cells = await frame.evaluate(() => {
      const list = window.mmScrollCells || [];
      const out = [];
      const unplaced = [];
      /* Which page these cells belong to. Every page's DOM exists at
       * once - hidden pages are stacked, not display:none - so neither
       * "what is visible" nor "the page being captured" identifies the
       * owner, and an overlay with no page is kept for ALL pages, which
       * put scrolling calendar events on top of unrelated pages
       * (2026-09-02). Ask the scope which page holds the widget, the way
       * the other handlers read it out of the widget's own DOM ids. */
      let groups = null;
      try {
        const roots = [document.querySelector("[ng-app]"), document.body, document.documentElement];
        for (const r of roots) {
          if (!r || !window.angular) continue;
          const inj = window.angular.element(r).injector();
          if (!inj) continue;
          const walk = (sc) => {
            if (!sc || groups) return;
            if (sc.groups && sc.groups.length) {
              groups = sc.groups;
              return;
            }
            walk(sc.$$childHead);
            walk(sc.$$nextSibling);
          };
          walk(inj.get("$rootScope"));
          break;
        }
      } catch (e) {}
      /* The directive's id is the calendar's DOM id, not a bare setting
       * id: "calendar_592345", "mealplan_...", "todo_<id>_<index>",
       * "chores_<id>_<label>_<index>". Comparing it raw matched nothing
       * and silently dropped every cell (2026-09-02). */
      const pageOfWidget = (rawId) => {
        if (!groups || rawId == null) return null;
        const m = String(rawId).match(/_(\d+)/);
        const wid = m ? m[1] : String(rawId);
        for (let p = 0; p < groups.length; p++) {
          const widgets = (groups[p] && groups[p].widgets) || [];
          for (const w of widgets) {
            if (String(w.widgetSettingId) === wid) return p;
          }
        }
        return null;
      };
      list.forEach((c, i) => {
        if (!c.el || !c.content || !document.documentElement.contains(c.el)) return;
        const pageIdx = pageOfWidget(c.widgetId);
        if (pageIdx === null) {
          unplaced.push(String(c.widgetId));
          return; /* cannot place it - never guess, it would land on every page */
        }
        /* the window the content scrolls inside: the directive sizes this
         * parent to boxHeight when a cell overflows */
        const win = c.content.parentElement;
        if (!win) return;
        const r = win.getBoundingClientRect();
        if (r.width < 20 || r.height < 12) return;
        if (!(c.innerHeight > r.height)) return; /* fits after all */
        /* The sized box is not always the clipping box. On the month grid
         * the directive sets the height on the events container but puts
         * overflow:hidden on a different ancestor, so the marquee stays
         * visible for another pixel or two below that container - down to
         * the day cell's own edge. Filming the container alone left that
         * strip uncovered, showing the baked screenshot underneath as a
         * frozen scrap of an event at the bottom of the cell (Dave,
         * 2026-09-02). Film whatever actually clips it. */
        const cellR = c.el.getBoundingClientRect();
        let clipBottom = r.bottom;
        for (let n = win; n && n !== document.body; n = n.parentElement) {
          if (getComputedStyle(n).overflowY !== "visible") {
            clipBottom = n.getBoundingClientRect().bottom;
            break;
          }
        }
        const bottom = Math.min(clipBottom, cellR.bottom, r.bottom + 8);
        const winH = Math.max(r.height, bottom - r.y);
        out.push({
          type: "cellScroll",
          idx: i,
          page: pageIdx,
          date: c.date || null,
          widgetSettingId: c.widgetId || null,
          rect: { x: r.x, y: r.y, w: r.width, h: winH },
          boxHeight: c.boxHeight,
          innerHeight: c.innerHeight,
          durationMs: c.durationMs,
          speed: c.speed,
          liveCapture: true,
        });
      });
      return { out, unplaced, registered: list.length };
    });
    if (cells.unplaced.length) {
      console.log(
        "cellScroll: " + cells.unplaced.length + " cell(s) could not be placed on a page (" +
          [...new Set(cells.unplaced)].join(",") + ") - skipped",
      );
    }
    return cells.out;
  },

  /* Publish first, film after: an uncached cell is dropped here, and
   * because the caller only hides survivors of process(), its events
   * stay baked - the portal's own first frame - until the follow-up
   * capture films it. */
  async process(overlays, ctx) {
    if (!ctx || !ctx.deferFilming) return overlays;
    const pending = [];
    const keep = overlays.filter((o) => {
      if ((ctx.nativeScroll ? csCachedStrip : csCachedSheet)(o, ctx.outDir, ctx.outScale)) return true;
      pending.push(o);
      return false;
    });
    if (pending.length) {
      if (ctx.filmState) ctx.filmState.pending = true;
      console.log(
        "cellScroll: " + pending.length + " cell(s) need filming - left baked, filming on the follow-up",
      );
    }
    return keep;
  },

  /* Only cells that will actually be covered get hidden.
   *
   * Resolved by identity, not by the index extract() saw: the marquee
   * splices itself out of window.mmScrollCells and pushes itself back at
   * the end of every cycle, so a stored index can be pointing at another
   * cell - or at a detached one - a few hundred milliseconds later. That
   * hid the wrong cells and left the real ones baked into the screenshot
   * underneath their own sprite (Dave, 2026-09-02). */
  async hide(frame, overlays) {
    const n = await frame.evaluate((wanted) => {
      const list = window.mmScrollCells || [];
      const same = (c, w) =>
        c && c.date === w.date && String(c.widgetId) === String(w.widgetSettingId);
      let hidden = 0;
      const stuck = [];
      /* Blank the BOX, not its contents.
       *
       * Enumerating content elements kept leaking: first scrollTarget[0]
       * alone, then every .-m-scroll-c under the parent - and a scrap still
       * survived on some cells (Dave, 2026-09-02: "you need to rethink how
       * you're doing that"). Any element the enumeration misses is an
       * element left baked under the sprite, so the enumeration itself is
       * the bug.
       *
       * The sprite's footprint IS c.content.parentElement - extract() takes
       * the rect from it. Setting opacity on that one box blanks exactly
       * what the sprite covers, whatever is inside it and however the
       * portal restructures it. Opacity applies to the whole rendered
       * subtree, so content that overflows the box and is clipped further
       * out goes transparent too - which is precisely where the leftover
       * scrap was living. */
      const box = (c) => (c && c.content ? c.content.parentElement || c.content : null);

      wanted.forEach((w) => {
        let c = list[w.idx];
        if (!(w.date != null ? same(c, w) : c)) {
          c = w.date != null ? list.find((x) => same(x, w)) : null;
        }
        if (c && c.content && document.documentElement.contains(c.content)) {
          /* opacity, not visibility alone: visibility is inherited, so any
           * descendant carrying visibility:visible - and the portal's
           * animation CSS sets that on a lot of things - re-shows itself
           * through a hidden ancestor. hide() then reported success while
           * the events stayed baked in the screenshot (Dave, 2026-09-02).
           * Opacity applies to the whole subtree and cannot be undone from
           * inside it. Neither affects layout, so the marquee we are about
           * to film is unmoved. */
          /* !important: a plain inline declaration loses to a running CSS
           * animation, and the portal's animation stylesheets touch both
           * of these. In the cascade an !important inline declaration
           * outranks an animation, a normal inline one does not. */
          const b = box(c);
          if (b) {
            b.style.setProperty("visibility", "hidden", "important");
            b.style.setProperty("opacity", "0", "important");
          }
          hidden++;
          if (b && getComputedStyle(b).opacity !== "0") {
            stuck.push(c.date + " op=" + getComputedStyle(b).opacity);
          }
        }
      });
      return { hidden, stuck, listLen: list.length };
    }, overlays.map((o) => ({ idx: o.idx, date: o.date, widgetSettingId: o.widgetSettingId })));
    if (n.hidden < overlays.length || n.stuck.length) {
      console.log(
        "cellScroll: blanked " + n.hidden + "/" + overlays.length + " box(es)" +
          (n.stuck.length ? " - still opaque: " + n.stuck.join(", ") : "") +
          " (list " + n.listLen + ")",
      );
    }
  },

  async captureAfter(page, frame, items, ctx) {
    const live = items.filter((i) => i.liveCapture);
    if (!live.length) return items;
    const sharp = require("sharp");

    /* a client that scrolls natively gets one strip, not a filmed sheet */
    if (ctx && ctx.nativeScroll) return await csCaptureStrips(page, frame, items, ctx);

    const fill = (o, meta) => {
      o.stripFile = meta.stripFile;
      /* a cached sheet was cropped from a snapped rect - reuse it, or the
       * sprite is drawn at a different box than it was filmed from */
      if (meta.rect) o.rect = { ...meta.rect };
      o.frameW = o.rect.w;
      o.frameH = o.rect.h;
      o.frameCount = meta.frameCount;
      o.cols = meta.cols;
      o.rows = meta.rows;
      o.frameMs = meta.frameMs;
      o.type = "gif"; /* the device already plays sprite sheets */
      delete o.liveCapture;
      delete o._frames;
      delete o._tvMs;
      delete o._travel;
      delete o._tvPxPerSec;
      delete o.idx;
      delete o.boxHeight;
      delete o.innerHeight;
      delete o.durationMs;
      delete o.speed;
    };

    const hits = live.map((o) => csCachedSheet(o, ctx.outDir, ctx.outScale));
    if (hits.every(Boolean)) {
      live.forEach((o, i) => fill(o, hits[i]));
      console.log("cellScroll: " + live.length + " cell(s) from cached sheets, filming skipped");
      return items;
    }

    /* frames per cell = its own cycle at the shared step */
    const need = live.filter((o, i) => !hits[i]);
    need.forEach((o) => {
      /* The portal's own motion, minus its dead lead-in. Its marquee starts
       * at top = boxHeight, the FULL cell height including the date row, so
       * the content sits (boxHeight - window) below the window's bottom edge
       * before a pixel of it shows - ~22px, nine seconds at this pace, of a
       * cell doing nothing (Dave, 2026-09-02: "unnecessary space before the
       * scrolling starts again"). Start at the window's own edge instead:
       * the first event begins entering at once, and the wrap stays an
       * empty-to-empty cut the eye cannot see. Everything else - path,
       * px/s, run-out - is the portal's.
       *
       * A ticker with a cloned second copy was tried here and reverted: it
       * changed the motion Dave had approved, and its frames came out
       * incoherent. */
      const pxPerSec = ((o.boxHeight + o.innerHeight) / o.durationMs) * 1000;
      o._tvPxPerSec = pxPerSec / CS_TV_PACE;
      o._travel = o.rect.h + o.innerHeight;
      o._tvMs = (o._travel / o._tvPxPerSec) * 1000;
      o._frames = Math.max(2, Math.min(CS_MAX_FRAMES, Math.round(o._tvMs / CS_PLAY_MS)));
    });
    const steps = Math.max(...need.map((o) => o._frames));

    /* let the marquees move, and stop the portal animating them itself */
    await frame.evaluate((idxs) => {
      const park = document.getElementById("mm-scroll-park");
      if (park) park.disabled = true;
      const list = window.mmScrollCells || [];
      /* Film on alpha. A sprite is drawn back over the page, and on a
       * display with an image or slideshow background that page is a
       * transparent layer over a native picture - so anything the frame
       * bakes in behind the events is a rectangle that does not match
       * (Dave, 2026-09-02: "we can't just put a black box"). The other
       * sprite handlers already film with transparent backgrounds; this
       * one did not. Every ancestor from the cell up to body loses its
       * background for the duration, so a semi-transparent widget panel
       * is not drawn twice either. Originals are restored in the finally. */
      window.__mmCsBg = window.__mmCsBg || [];
      idxs.forEach((i) => {
        const c = list[i];
        if (!c || !c.content) return;
        for (let n = c.content.parentElement; n && n !== document.documentElement; n = n.parentElement) {
          if (window.__mmCsBg.some((e) => e.el === n)) continue;
          window.__mmCsBg.push({ el: n, bg: n.style.getPropertyValue("background"), pri: n.style.getPropertyPriority("background") });
          n.style.setProperty("background", "transparent", "important");
        }
      });
      list.forEach((c) => {
        if (!c.content) return;
        /* Stop the portal's OWN animation on EVERY element of the marquee.
         * jQuery animates each element of scrollTarget on its own fx queue,
         * so stopping c.content alone left its siblings scrolling at real
         * speed underneath virtual-time filming - two clocks fighting over
         * the same `top`, which is what came out as smeared, doubled frames
         * (Dave, 2026-09-02). stop(true,false): clear the queue, do not
         * jump to the end, so the complete-callback never re-arms it. */
        if (window.jQuery) {
          try {
            const par = c.content.parentElement;
            const all = par ? par.querySelectorAll(".-m-scroll-c") : [c.content];
            window.jQuery(all.length ? all : [c.content]).stop(true, false);
          } catch (e) {}
        }
        const b0 = c.content.parentElement || c.content;
        b0.style.visibility = "";
        b0.style.opacity = "";
      });
    }, need.map((o) => o.idx));

    /* From here the page carries our twin copies and a paused marquee.
     * Anything that throws in between must not leave either behind, so the
     * restore below is a finally, not a next statement. */
    await frame.addStyleTag({ content: "/*mm-film*/html,body,#main{background:transparent !important}" });
    await page.addStyleTag({ content: "/*mm-film*/html,body{background:transparent !important}" });
    const t0 = Date.now();
    try {
      const shots = [];
      for (let k = 0; k < steps; k++) {
        await frame.evaluate(
          (args) => {
            const list = window.mmScrollCells || [];
            args.cells.forEach((cell) => {
              const c = list[cell.idx];
              if (!c || !c.content) return;
              /* +window -> -innerHeight, linear: the portal's path with the
               * dead lead-in above the window removed */
              const t = Math.min(1, args.k / cell.frames);
              const top = cell.winH - t * (cell.winH + cell.innerHeight);
              const par = c.content.parentElement;
              const all = par ? par.querySelectorAll(".-m-scroll-c") : [c.content];
              (all.length ? all : [c.content]).forEach((el) => (el.style.top = top + "px"));
            });
            return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          },
          { k, cells: need.map((o) => ({ idx: o.idx, frames: o._frames, winH: o.rect.h, innerHeight: o.innerHeight })) },
        );
        shots.push(await page.screenshot({ type: "png", omitBackground: true }));
      }

      const shotMeta = await sharp(shots[0]).metadata();
      for (const o of need) {
        try {
          const dr = {
            left: Math.round(o.rect.x * ctx.outScale),
            top: Math.round(o.rect.y * ctx.outScale),
            width: Math.max(1, Math.round(o.rect.w * ctx.outScale)),
            height: Math.max(1, Math.round(o.rect.h * ctx.outScale)),
          };
          dr.left = Math.min(Math.max(0, dr.left), shotMeta.width - 1);
          dr.top = Math.min(Math.max(0, dr.top), shotMeta.height - 1);
          dr.width = Math.min(dr.width, shotMeta.width - dr.left);
          dr.height = Math.min(dr.height, shotMeta.height - dr.top);

          const capacity =
            Math.max(1, Math.floor(2048 / dr.width)) * Math.max(1, Math.floor(2048 / dr.height));
          const stride = Math.max(1, Math.ceil(o._frames / capacity));
          const picked = [];
          for (let i = 0; i < o._frames; i += stride) picked.push(i);

          const frames = [];
          for (const idx of picked) frames.push(await sharp(shots[idx]).extract(dr).png().toBuffer());
          const cols = Math.max(1, Math.min(Math.floor(2048 / dr.width), frames.length));
          const rows = Math.ceil(frames.length / cols);
          const sheetBuf = await sharp({
            create: { width: cols * dr.width, height: rows * dr.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
          })
            .composite(frames.map((f, i) => ({ input: f, left: (i % cols) * dr.width, top: Math.floor(i / cols) * dr.height })))
            .png()
            .toBuffer();
          /* key first: it must be computed from the rect the cache lookup in
           * process() saw, not the snapped one below, or write and read
           * disagree and every render re-films. */
          const key = csKey(o, ctx.outScale);
          /* The crop is whole output pixels; the rect it is drawn at must be
           * the same region or the two disagree by a fraction of a pixel and
           * the background shows through at the edge. */
          o.rect = {
            x: dr.left / ctx.outScale,
            y: dr.top / ctx.outScale,
            w: dr.width / ctx.outScale,
            h: dr.height / ctx.outScale,
          };
          const tag = crypto.createHash("md5").update(sheetBuf).digest("hex").slice(0, 8);
          const fileName = "overlay_cs_" + key + "_" + tag + ".png";
          fsHandlers.writeFileSync(pathHandlers.join(ctx.outDir, fileName), sheetBuf);
          const meta = {
            stripFile: fileName,
            rect: { ...o.rect },
            frameCount: frames.length,
            cols,
            rows,
            frameMs: Math.max(40, Math.round(o._tvMs / frames.length)),
          };
          fsHandlers.writeFileSync(
            pathHandlers.join(ctx.outDir, fileName.replace(/\.png$/, ".json")),
            JSON.stringify(meta),
          );
          console.log(
            "cellScroll sheet: " + o.date + " " + frames.length + "f @" + meta.frameMs + "ms (" +
              o.speed + ", loop " + Math.round(o._tvMs / 100) / 10 + "s, " +
              Math.round(o._tvPxPerSec * 10) / 10 + " px/s, " +
              Math.round((100 * o._travel) / frames.length) / 100 + "px/frame)",
          );
          fill(o, meta);
        } catch (e) {
          console.error("cell scroll film failed (" + o.date + "):", e.message);
          o.skip = true;
        }
      }

    } finally {
      /* park them again and re-hide the ones we now cover */
      await frame.evaluate((idxs) => {
        const park = document.getElementById("mm-scroll-park");
        if (park) park.disabled = false;
        (window.__mmCsBg || []).forEach((e) => {
          if (e.bg) e.el.style.setProperty("background", e.bg, e.pri || "");
          else e.el.style.removeProperty("background");
        });
        window.__mmCsBg = [];
        document.querySelectorAll("style").forEach((n) => {
          if ((n.textContent || "").includes("mm-film")) n.remove();
        });
        const list = window.mmScrollCells || [];
        list.forEach((c) => {
          if (c && c.content) {
            const par = c.content.parentElement;
            const all = par ? [...par.querySelectorAll(".-m-scroll-c")] : [c.content];
            (all.length ? all : [c.content]).forEach((el) => (el.style.top = ""));
          }
        });
        idxs.forEach((i) => {
          const c = list[i];
          if (c && c.content) {
            const b = c.content.parentElement || c.content;
            b.style.setProperty("visibility", "hidden", "important");
            b.style.setProperty("opacity", "0", "important");
          }
        });
      }, need.filter((o) => !o.skip).map((o) => o.idx));
      /* the outer page carried a film style of its own */
      await page.evaluate(() => {
        document.querySelectorAll("style").forEach((n) => {
          if ((n.textContent || "").includes("mm-film")) n.remove();
        });
      }).catch(() => {});
    }

    live.forEach((o, i) => {
      if (hits[i]) fill(o, hits[i]);
    });
    console.log("cellScroll: filmed " + need.filter((o) => !o.skip).length + " cell(s) in " + (Date.now() - t0) + "ms");
    return items.filter((o) => !o.skip);
  },
};

/* ---- Native motion for the calendar strips (CSS-driven) ------------------
 *
 * The 10-day strip is pure CSS animation: raindrops, flakes, pellets,
 * wind and fog lines, a storm bolt, plus the condition icon (the same SVG
 * set as the widget). Instead of parsing @keyframes - vars, calc(), %
 * units, easing, negative delays - each animated element is SAMPLED: its
 * animation is paused and seeked through one cycle while the computed
 * transform matrix and opacity are read back, and every matrix is
 * decomposed into translate / rotate / scale. That is exact for any
 * keyframe the browser can compute, and the device interpolates
 * linearly between samples. One layer PNG per element, shot in isolation
 * at its base pose (animation: none). The icon goes through wxDecompose,
 * with the strip's CSS float on the <img> folded in as a chain level. */
const CWM_MIN_SAMPLES = 12;
const CWM_MAX_SAMPLES = 48;
const CWM_VERSION = "1";

function cwmSampleCount(cycleMs) {
  return Math.max(CWM_MIN_SAMPLES, Math.min(CWM_MAX_SAMPLES, Math.round(cycleMs / 40)));
}

/* matrix(a,b,c,d,e,f) -> { tx, ty, rot (deg, screen clockwise), sx, sy } */
function cwmDecomposeMatrix(str) {
  const m = String(str || "").match(/matrix\(([^)]+)\)/);
  if (!m) return { tx: 0, ty: 0, rot: 0, sx: 1, sy: 1 };
  const [a, b, c, d, e, f] = m[1].split(",").map(Number);
  const sx = Math.hypot(a, b) || 1;
  const rot = (Math.atan2(b, a) * 180) / Math.PI;
  /* remove the rotation from the second column to read the y scale */
  const cosr = Math.cos((rot * Math.PI) / 180);
  const sinr = Math.sin((rot * Math.PI) / 180);
  const sy = -c * sinr + d * cosr || 1;
  return { tx: e, ty: f, rot, sx, sy };
}

/* samples[k] = { tx, ty, rot, sx, sy, op } at k/N of the cycle */
function cwmTracksFromSamples(samples, cycleMs, delayMs, center) {
  const n = samples.length;
  const keys = samples.map((_, k) => Math.round((k / n) * 1000) / 1000);
  keys.push(1);
  const wrap = (arr) => arr.concat([arr[0]]);
  const r2 = (v) => Math.round(v * 100) / 100;
  const varies = (get, eps) => samples.some((s) => Math.abs(get(s) - get(samples[0])) > eps);
  const tracks = [];
  if (varies((s) => s.tx, 0.05) || varies((s) => s.ty, 0.05) || Math.abs(samples[0].tx) > 0.05 || Math.abs(samples[0].ty) > 0.05) {
    tracks.push({ prop: "translation", cycleMs, delayMs, keys, values: wrap(samples.map((s) => [r2(s.tx), r2(s.ty)])) });
  }
  if (varies((s) => s.rot, 0.1) || Math.abs(samples[0].rot) > 0.1) {
    /* unwrap so a spin does not snap back through 0 */
    let acc = 0;
    let prev = samples[0].rot;
    const unwrapped = samples.map((s, i) => {
      if (i) {
        let d = s.rot - prev;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        acc += d;
        prev = s.rot;
        return r2(samples[0].rot + acc);
      }
      return r2(s.rot);
    });
    tracks.push({ prop: "rotation", cycleMs, delayMs, keys, values: unwrapped.concat([r2(unwrapped[0] + (unwrapped[n - 1] - unwrapped[0]) * (n / (n - 1)))]), center });
  }
  if (varies((s) => s.sx, 0.01) || varies((s) => s.sy, 0.01) || Math.abs(samples[0].sx - 1) > 0.01 || Math.abs(samples[0].sy - 1) > 0.01) {
    tracks.push({ prop: "scale", cycleMs, delayMs, keys, values: wrap(samples.map((s) => [r2(s.sx), r2(s.sy)])), center });
  }
  if (varies((s) => s.op, 0.01)) {
    tracks.push({ prop: "opacity", cycleMs, delayMs, keys, values: wrap(samples.map((s) => r2(s.op))) });
  }
  return tracks;
}

function cwmCached(key, outDir) {
  try {
    const meta = JSON.parse(fsHandlers.readFileSync(pathHandlers.join(outDir, "overlay_cwm_" + key + ".json"), "utf8"));
    if (!meta || !Array.isArray(meta.layers)) return null;
    for (const L of meta.layers) if (!fsHandlers.existsSync(pathHandlers.join(outDir, L.file))) return null;
    if (meta.icon) for (const L of meta.icon.layers) if (!fsHandlers.existsSync(pathHandlers.join(outDir, L.file))) return null;
    return meta;
  } catch (e) {
    return null;
  }
}

/* Build the motion meta for one strip exemplar. The page is expected in
 * the film pose already: settle lifted, icons restored, isolation CSS
 * up, SVG icons inlined, every animation paused. */
async function cwmBuild(page, frame, o, key, ctx) {
  const sharp = require("sharp");
  const t0 = Date.now();
  /* 1. what animates in this strip, with base boxes and timings */
  const plan = await frame.evaluate((rect) => {
    const strips = [...document.querySelectorAll(".mm-weather-header-strip")];
    const strip = strips.find((el) => {
      const r = el.getBoundingClientRect();
      return Math.abs(r.x - rect.x) < 2 && Math.abs(r.y - rect.y) < 2;
    });
    if (!strip) return { error: "strip not found" };
    const meta = strip.parentElement ? strip.parentElement.querySelector(".mm-weather-header-meta") : null;
    const iconEl = meta ? meta.querySelector(".mm-weather-header-icon") : null;
    const parts = [];
    let idx = 0;
    const consider = (el, kind) => {
      const anims = el.getAnimations ? el.getAnimations() : [];
      const css = anims.filter((a) => a.effect && a.effect.getTiming);
      if (!css.length) return null;
      const timing = css[0].effect.getTiming();
      const dur = Number(timing.duration) || 0;
      if (!(dur > 0)) return null;
      el.setAttribute("data-mm-cwl", String(idx));
      const rec = {
        idx,
        kind,
        delayMs: Number(timing.delay) || 0,
        cycleMs: dur,
        iterations: timing.iterations,
        direction: timing.direction || "normal",
      };
      idx++;
      parts.push(rec);
      return rec;
    };
    [...strip.querySelectorAll("*")].forEach((el) => consider(el, "particle"));
    let icon = null;
    if (iconEl) {
      const r = iconEl.getBoundingClientRect();
      const float = consider(iconEl, "icon");
      icon = { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, src: iconEl.getAttribute("data-mm-src") || iconEl.currentSrc || iconEl.src || "", float: float ? float.idx : null };
    }
    return { parts, icon, stripRect: (() => { const r = strip.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })() };
  }, o.rect);
  if (plan.error) throw new Error(plan.error);

  const dr = {
    left: Math.round(o.rect.x * ctx.outScale),
    top: Math.round(o.rect.y * ctx.outScale),
    width: Math.max(1, Math.round(o.rect.w * ctx.outScale)),
    height: Math.max(1, Math.round(o.rect.h * ctx.outScale)),
  };
  const iso = (extra) =>
    frame.evaluate((css) => {
      let st = document.getElementById("mm-cwm-iso");
      if (!st) {
        st = document.createElement("style");
        st.id = "mm-cwm-iso";
        document.head.appendChild(st);
      }
      st.textContent = css;
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, extra);
  const shootStrip = async () => {
    const buf = await page.screenshot({ type: "png", omitBackground: true });
    const m = await sharp(buf).metadata();
    const clip = {
      left: Math.min(Math.max(0, dr.left), m.width - 1),
      top: Math.min(Math.max(0, dr.top), m.height - 1),
    };
    clip.width = Math.min(dr.width, m.width - clip.left);
    clip.height = Math.min(dr.height, m.height - clip.top);
    return await sharp(buf).extract(clip).png().toBuffer();
  };
  const save = (png, tag) => {
    const h = crypto.createHash("md5").update(png).digest("hex").slice(0, 8);
    const name = "overlay_cwm_" + key + "_" + tag + "_" + h + ".png";
    fsHandlers.writeFileSync(pathHandlers.join(ctx.outDir, name), png);
    return name;
  };

  const particles = plan.parts.filter((p) => p.kind === "particle");
  const layers = [];
  /* 2. the strip's static content (everything the settle hides that does
   * not animate) - shot with animated elements out of the way */
  await iso("/*mm-film*/ .mm-weather-header-strip [data-mm-cwl], .mm-weather-header-meta, .mm-weather-header-meta * { visibility: hidden !important }");
  layers.push({ file: save(await shootStrip(), "s"), tracks: [] });

  /* 3. each particle: base image + sampled motion */
  for (const part of particles) {
    const sel = '.mm-weather-header-strip [data-mm-cwl="' + part.idx + '"]';
    await iso(
      "/*mm-film*/ .mm-weather-header-strip [data-mm-cwl], .mm-weather-header-meta, .mm-weather-header-meta * { visibility: hidden !important } " +
        sel + " { visibility: visible !important; animation: none !important; opacity: 1 !important }",
    );
    const box = await frame.evaluate((sel) => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, baseOpacity: parseFloat(getComputedStyle(el).opacity) };
    }, sel);
    const png = await shootStrip();
    /* sampling: animation back on (paused), seek through one cycle */
    await iso("/*mm-film*/ .mm-weather-header-strip [data-mm-cwl], .mm-weather-header-meta, .mm-weather-header-meta * { visibility: hidden !important }");
    const n = cwmSampleCount(part.cycleMs);
    const samples = await frame.evaluate(
      ({ sel, n, delayMs, cycleMs, direction }) => {
        const el = document.querySelector(sel);
        const anim = el.getAnimations()[0];
        const out = [];
        /* effective cycle: alternate directions double it */
        const alt = direction === "alternate" || direction === "alternate-reverse";
        const total = alt ? cycleMs * 2 : cycleMs;
        for (let k = 0; k < n; k++) {
          anim.currentTime = delayMs + ((k / n) * total) % total + (delayMs < 0 ? 0 : 0);
          const cs = getComputedStyle(el);
          out.push({ t: cs.transform, op: parseFloat(cs.opacity) });
        }
        return { out, total };
      },
      { sel, n, delayMs: part.delayMs, cycleMs: part.cycleMs, direction: part.direction },
    );
    const decoded = samples.out.map((sm) => Object.assign(cwmDecomposeMatrix(sm.t), { op: sm.op }));
    /* CSS transform-origin defaults to the box centre; the layer PNG is
     * the whole strip, so the centre is the box centre within the strip */
    const center = [Math.round((box.x + box.w / 2 - o.rect.x) * 100) / 100, Math.round((box.y + box.h / 2 - o.rect.y) * 100) / 100];
    /* a negative delay is a phase: the element is already mid-cycle at
     * t=0. Rotating the samples makes key 0 that phase; a positive delay
     * is a real wait. */
    let delayMs = 0;
    let ordered = decoded;
    if (part.delayMs < 0) {
      const phase = (((-part.delayMs) % samples.total) + samples.total) % samples.total;
      const shift = Math.round((phase / samples.total) * n) % n;
      ordered = decoded.slice(shift).concat(decoded.slice(0, shift));
    } else {
      delayMs = Math.round(part.delayMs);
    }
    const tracks = cwmTracksFromSamples(ordered, Math.round(samples.total), delayMs, center);
    const op = tracks.find((t) => t.prop === "opacity");
    layers.push({ file: save(png, String(part.idx)), tracks, opacity: op ? op.values[0] : box.baseOpacity });
  }
  await iso("");

  /* 4. the icon: the widget decomposer at the icon's own box, plus the
   * strip's CSS float on the <img> as a chain level on every layer */
  let icon = null;
  if (plan.icon && plan.icon.src) {
    try {
      const svgText = await (await fetch(plan.icon.src)).text();
      if (wxMotionFeasible(svgText)) {
        const io = { src: plan.icon.src, rect: plan.icon.rect, svgText };
        let meta = wxMotionCached(io, ctx.outDir, ctx.outScale);
        if (!meta) meta = await wxDecompose(page, io, ctx);
        let chain = null;
        if (plan.icon.float !== null) {
          const fp = plan.parts.find((p) => p.idx === plan.icon.float);
          const sel = '.mm-weather-header-meta [data-mm-cwl="' + fp.idx + '"]';
          const n = cwmSampleCount(fp.cycleMs);
          const sm = await frame.evaluate(
            ({ sel, n, delayMs, cycleMs, direction }) => {
              const el = document.querySelector(sel);
              const anim = el.getAnimations()[0];
              const alt = direction === "alternate" || direction === "alternate-reverse";
              const total = alt ? cycleMs * 2 : cycleMs;
              const out = [];
              for (let k = 0; k < n; k++) {
                anim.currentTime = delayMs + ((k / n) * total) % total;
                const cs = getComputedStyle(el);
                out.push({ t: cs.transform, op: parseFloat(cs.opacity) });
              }
              return { out, total };
            },
            { sel, n, delayMs: fp.delayMs, cycleMs: fp.cycleMs, direction: fp.direction },
          );
          const dec = sm.out.map((x) => Object.assign(cwmDecomposeMatrix(x.t), { op: x.op }));
          const c = [plan.icon.rect.w / 2, plan.icon.rect.h / 2];
          const tr = cwmTracksFromSamples(dec, Math.round(sm.total), Math.max(0, Math.round(fp.delayMs)), c);
          if (tr.length) chain = [{ tracks: tr }];
        }
        icon = {
          rect: { x: plan.icon.rect.x - o.rect.x, y: plan.icon.rect.y - o.rect.y, w: plan.icon.rect.w, h: plan.icon.rect.h },
          layers: meta.layers.map((L) => {
            const out = { file: L.file, tracks: L.tracks || [] };
            if (L.opacity !== undefined && L.opacity !== null) out.opacity = L.opacity;
            const ch = (L.chain || []).concat(chain || []);
            if (ch.length) out.chain = ch;
            return out;
          }),
        };
      }
    } catch (e) {
      console.error("cwm icon (" + String(plan.icon.src).split("/").pop() + "):", e.message);
    }
  }
  const meta = { layers, icon, w: o.rect.w, h: o.rect.h };
  fsHandlers.writeFileSync(pathHandlers.join(ctx.outDir, "overlay_cwm_" + key + ".json"), JSON.stringify(meta));
  console.log(
    "cwm: " + o.cellWeather + " -> " + layers.length + " strip layer(s)" + (icon ? " + icon " + icon.layers.length + " layer(s)" : "") +
      " in " + (Date.now() - t0) + "ms",
  );
  await frame.evaluate(() => document.querySelectorAll("[data-mm-cwl]").forEach((el) => el.removeAttribute("data-mm-cwl"))).catch(() => {});
  return meta;
}

/* one motion overlay for the strip's particles at the strip rect, plus
 * one for the icon at its own box (a separate overlay, so the icon's
 * layers keep their crisp 2x images) */
function cwmFill(o, meta, extras) {
  o.type = "motion";
  o.layers = meta.layers;
  if (meta.icon) {
    extras.push({
      type: "motion",
      page: o.page,
      rect: { x: o.rect.x + meta.icon.rect.x, y: o.rect.y + meta.icon.rect.y, w: meta.icon.rect.w, h: meta.icon.rect.h },
      layers: meta.icon.layers,
    });
  }
  delete o.liveCapture;
  delete o.cellWeather;
}

const cellWeatherHandler = {
  type: "cellWeather",

  async extract(frame) {
    return await frame.evaluate(() => {
      const out = [];
      document.querySelectorAll(".mm-weather-header-strip").forEach((el) => {
        if (el.offsetParent === null) return;
        if (getComputedStyle(el).visibility === "hidden") return; // another page
        const m = (el.className || "").toString().match(/mm-weather-overlay-([a-z-]+)/);
        if (!m) return;
        const r = el.getBoundingClientRect();
        if (r.width < 20 || r.height < 6) return;
        const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
        if (cx < 0 || cx > window.innerWidth || cy < 0 || cy > window.innerHeight) return;
        out.push({
          type: "gif",
          cellWeather: m[1],
          rect: { x: r.x, y: r.y, w: r.width, h: r.height },
          liveCapture: true,
        });
      });
      return out;
    });
  },

  // The settle CSS already keeps particles and motion out of the still;
  // temperatures and date numbers are per-day DATA and stay baked. The
  // little condition icon is filmed INTO the strip sheet, so its baked
  // copy goes the way the widget icons' did: the overlay is the only
  // source of icon pixels - a frozen ghost under an animated sheet
  // reads as a smudge.
  async hide(frame, overlays) {
    if (!overlays.length) return;
    await frame.evaluate(() => {
      window.__mmCwHidden = [];
      document.querySelectorAll(".mm-weather-header-icon").forEach((el) => {
        if (getComputedStyle(el).visibility === "hidden") return;
        el.style.opacity = "0";
        window.__mmCwHidden.push(el);
      });
    });
  },

  async captureAfter(page, frame, items, ctx) {
    const live = items.filter((i) => i.liveCapture);
    if (!live.length) return items;
    const sharp = require("sharp");

    // one shared sheet per condition + strip pixel size
    const sizeKey = (o) =>
      o.cellWeather + "|" + Math.round(o.rect.w * ctx.outScale) + "x" + Math.round(o.rect.h * ctx.outScale);
    const cwKey = (o) => crypto.createHash("md5").update(sizeKey(o)).digest("hex").slice(0, 16);
    const cachedFor = (o) => {
      const key = cwKey(o);
      let metas;
      try {
        metas = fsHandlers
          .readdirSync(ctx.outDir)
          .filter((f) => f.startsWith("overlay_cw_" + key + "_") && f.endsWith(".json"))
          .sort(
            (a, b) =>
              fsHandlers.statSync(pathHandlers.join(ctx.outDir, b)).mtimeMs -
              fsHandlers.statSync(pathHandlers.join(ctx.outDir, a)).mtimeMs,
          );
      } catch (e) {
        return null;
      }
      for (const m of metas) {
        try {
          const c = JSON.parse(fsHandlers.readFileSync(pathHandlers.join(ctx.outDir, m), "utf8"));
          if (c.stripFile && fsHandlers.existsSync(pathHandlers.join(ctx.outDir, c.stripFile))) return c;
        } catch (e) {}
      }
      return null;
    };
    const fill = (o, c) => {
      o.stripFile = c.stripFile;
      /* a cached sheet was cropped from a snapped rect - reuse it, or the
       * sprite is drawn at a different box than it was filmed from */
      o.frameW = o.rect.w;
      o.frameH = o.rect.h;
      o.frameCount = c.frameCount;
      o.cols = c.cols;
      o.rows = c.rows;
      o.frameMs = c.frameMs;
      delete o.liveCapture;
      delete o.cellWeather;
    };

    /* ---- native motion (Roku MotionOverlay): the same exemplar-per-
     * (condition, size) sharing as the sheets, but the exemplar is a set
     * of layers with sampled tracks, built once, never filmed. ---- */
    if (ctx.nativeWeather) {
      const mkey = (o) => crypto.createHash("md5").update(CWM_VERSION + "|" + sizeKey(o)).digest("hex").slice(0, 16);
      const mhits = live.map((o) => cwmCached(mkey(o), ctx.outDir));
      const extras = [];
      if (mhits.every(Boolean)) {
        live.forEach((o, i) => cwmFill(o, mhits[i], extras));
        console.log("cwm: " + live.length + " strip(s) from cached motion");
        return items.concat(extras);
      }
      const mneed = new Map();
      live.forEach((o, i) => {
        if (!mhits[i] && !mneed.has(mkey(o))) mneed.set(mkey(o), o);
      });
      if (ctx.deferFilming) {
        ctx.filmPending = true;
        const ready = [];
        live.forEach((o, i) => {
          if (mhits[i]) {
            cwmFill(o, mhits[i], extras);
            ready.push(o);
          }
        });
        console.log("cwm: " + mneed.size + " strip motion(s) to build - publishing " + ready.length + " cached now, building on the follow-up");
        return items.filter((o) => !o.liveCapture || !o.cellWeather || ready.includes(o)).concat(extras);
      }
      /* same page pose as the film path below */
      await ctx.reenableAnimations();
      await frame.evaluate(() => {
        document.querySelectorAll("style").forEach((n) => {
          if ((n.textContent || "").includes("mm-film")) n.remove();
        });
        const settle = document.getElementById("mm-weather-settle");
        if (settle) settle.disabled = true;
        (window.__mmCwHidden || []).forEach((el) => (el.style.opacity = ""));
        window.__mmCwHidden = [];
        /* remember each icon's file: after svgSwapIn the <img> is gone */
        document.querySelectorAll("img.mm-weather-header-icon").forEach((el) => el.setAttribute("data-mm-src", el.src));
      });
      await frame.addStyleTag({
        content:
          "/*mm-film*/" +
          "body *{visibility:hidden !important}" +
          ".mm-weather-overlay,.mm-weather-overlay *,.mm-weather-header-meta,.mm-weather-header-meta *{visibility:visible !important}" +
          ".mm-weather-header-strip{background:none !important;box-shadow:none !important}" +
          ".mm-weather-date-temp,.mm-weather-date-temp *{visibility:hidden !important}",
      });
      await page.addStyleTag({ content: "/*mm-film*/html,body{background:transparent !important}" });
      await page.waitForTimeout(200);
      await pauseAllAnimations(frame);
      const built = new Map();
      try {
        for (const [k, o] of mneed) {
          try {
            built.set(k, await cwmBuild(page, frame, o, k, ctx));
          } catch (e) {
            console.error("cwm build failed (" + o.cellWeather + "):", e.message);
          }
        }
      } finally {
        await frame.evaluate(() => {
          const st = document.getElementById("mm-cwm-iso");
          if (st) st.remove();
          document.querySelectorAll("style").forEach((n) => {
            if ((n.textContent || "").includes("mm-film")) n.remove();
          });
        }).catch(() => {});
        await page.evaluate(() => document.querySelectorAll("style").forEach((n) => { if ((n.textContent || "").includes("mm-film")) n.remove(); })).catch(() => {});
        await resumeAllAnimations(frame);
        await frame.evaluate(() => {
          const settle = document.getElementById("mm-weather-settle");
          if (settle) settle.disabled = false;
        }).catch(() => {});
      }
      for (const o of live) {
        const c = built.get(mkey(o)) || cwmCached(mkey(o), ctx.outDir);
        if (!c) {
          o.skip = true;
          continue;
        }
        cwmFill(o, c, extras);
      }
      return items.filter((o) => !o.skip).concat(extras);
    }

    const hits = live.map(cachedFor);
    if (hits.every(Boolean)) {
      live.forEach((o, i) => fill(o, hits[i]));
      console.log("cw: " + live.length + " cell strip(s) from cached sheets, filming skipped");
      return items;
    }

    // film one exemplar per distinct (condition, size) that has no
    // cached sheet - a single new condition must not refilm the rest
    const need = new Map();
    live.forEach((o, i) => {
      if (!hits[i] && !need.has(sizeKey(o))) need.set(sizeKey(o), o);
    });

    /* Publish first, film after. A new cell geometry (switching a
     * calendar to Monthly, say) invalidates every sheet, and filming
     * them is tens of seconds - 436 frames / 38s on 2026-09-01 - with
     * the user watching a spinner the whole time. On the first pass we
     * ship the cells whose sheets are already cached and DROP the rest:
     * their strip gradient, icon and temperatures are baked into the
     * page image, so those cells simply do not animate yet. The caller
     * sees filmPending and re-captures immediately with filming
     * allowed, so the animation arrives a few seconds later with
     * nobody waiting on it. */
    if (ctx.deferFilming) {
      ctx.filmPending = true;
      const ready = [];
      live.forEach((o, i) => {
        if (hits[i]) {
          fill(o, hits[i]);
          ready.push(o);
        }
      });
      console.log(
        "cw: " + need.size + " sheet(s) need filming - publishing " + ready.length +
          " cached strip(s) now, filming on the follow-up",
      );
      /* keep every non-cellWeather item; keep only the filled cells */
      return items.filter((o) => !o.liveCapture || !o.cellWeather || ready.includes(o));
    }

    await ctx.reenableAnimations();
    await frame.evaluate(() => {
      // the icon film may have left its background-stripping styles up
      // (the shared sweep runs only after ALL handlers); they would
      // erase these CSS-background-drawn particles
      document.querySelectorAll("style").forEach((n) => {
        if ((n.textContent || "").includes("mm-film")) n.remove();
      });
      // wake the weather and restore the icons for their close-up
      const settle = document.getElementById("mm-weather-settle");
      if (settle) settle.disabled = true;
      (window.__mmCwHidden || []).forEach((el) => (el.style.opacity = ""));
      window.__mmCwHidden = [];
    });
    // Isolation differs from the icon film: these particles are drawn
    // with CSS backgrounds, so background-stripping would erase the
    // payload. Instead everything is visibility-hidden and the weather
    // subtrees switched back on. The strip's own gradient stays OFF -
    // it is already baked, and double-compositing a translucent
    // gradient darkens it (the icon film's faint-square lesson). Temps
    // stay hidden: they are per-day data inside a per-TYPE shared sheet.
    await frame.addStyleTag({
      content:
        "/*mm-film*/" +
        "body *{visibility:hidden !important}" +
        ".mm-weather-overlay,.mm-weather-overlay *,.mm-weather-header-meta,.mm-weather-header-meta *{visibility:visible !important}" +
        ".mm-weather-header-strip{background:none !important;box-shadow:none !important}" +
        ".mm-weather-date-temp,.mm-weather-date-temp *{visibility:hidden !important}",
    });
    await page.addStyleTag({ content: "/*mm-film*/html,body{background:transparent !important}" });
    await page.waitForTimeout(200);

    // Filmed in VIRTUAL time, not wall-clock: real-time shooting can only
    // sample as fast as a screenshot returns (~300ms on the fleet), which
    // played back as jerky rain (Dave, 2026-08-26). Instead every CSS
    // animation is paused and SEEKED - frame i sits at exactly i*70ms of
    // animation time, whatever the screenshot costs. Seeking currentTime
    // reproduces delays and ensemble phasing exactly, and the double-rAF
    // before each shot is the compositor-commit lesson from the
    // celebrations filming.
    //
    // The condition icons' motion is SMIL inside the SVG file - see the
    // virtual-time helpers for why they get swapped for inline copies.
    // The icon bucket has no CORS, so the SVG text is fetched Node-side.
    const iconSrcs = await frame.evaluate(() => {
      const seen = new Set();
      document.querySelectorAll("img.mm-weather-header-icon").forEach((el) => {
        if (getComputedStyle(el).visibility !== "hidden" && el.src) seen.add(el.src);
      });
      return [...seen];
    });
    const svgBySrc = {};
    for (const src of iconSrcs) {
      try {
        const t = await (await fetch(src)).text();
        if (/<svg[\s>]/i.test(t)) svgBySrc[src] = t;
      } catch (e) {
        console.error("cw icon svg fetch failed (film keeps the img):", e.message);
      }
    }
    await svgSwapIn(frame, svgBySrc);
    await pauseAllAnimations(frame);

    const windowS = Math.min(
      13,
      Math.max(...[...need.values()].map((o) => CW_PERIODS_S[o.cellWeather] || CW_DEFAULT_PERIOD_S)),
    );
    const steps = Math.min(CW_MAX_SHOTS, Math.round((windowS * 1000) / CW_STEP_MS));
    const shots = [];
    const stamps = [];
    for (let i = 0; i < steps; i++) {
      await seekVirtual(frame, CW_WARMUP_MS + i * CW_STEP_MS);
      stamps.push(i * CW_STEP_MS); // frame-pick logic works in window-relative time
      shots.push(await page.screenshot({ type: "png", omitBackground: true }));
    }

    // hand the clocks back and the imgs their places, then the settle
    // goes back on before anything else can be photographed
    await svgSwapOut(frame);
    await resumeAllAnimations(frame);
    await frame
      .evaluate(() => {
        const settle = document.getElementById("mm-weather-settle");
        if (settle) settle.disabled = false;
      })
      .catch(() => {});

    const shotMeta = await sharp(shots[0]).metadata();
    const built = new Map();
    for (const [k, o] of need) {
      try {
        const dr = {
          left: Math.round(o.rect.x * ctx.outScale),
          top: Math.round(o.rect.y * ctx.outScale),
          width: Math.max(1, Math.round(o.rect.w * ctx.outScale)),
          height: Math.max(1, Math.round(o.rect.h * ctx.outScale)),
        };
        dr.left = Math.min(Math.max(0, dr.left), shotMeta.width - 1);
        dr.top = Math.min(Math.max(0, dr.top), shotMeta.height - 1);
        dr.width = Math.min(dr.width, shotMeta.width - dr.left);
        dr.height = Math.min(dr.height, shotMeta.height - dr.top);

        const periodMs = (CW_PERIODS_S[o.cellWeather] || CW_DEFAULT_PERIOD_S) * 1000;
        let count = stamps.filter((s) => s < periodMs).length;
        count = Math.max(2, Math.min(count, shots.length));
        const capacity =
          Math.max(1, Math.floor(2048 / dr.width)) * Math.max(1, Math.floor(2048 / dr.height));
        // slow cycles (clouds at 13s) don't need 70ms sampling on the TV -
        // stride them down; fast ones (rain) keep every frame
        const stride = Math.max(1, Math.ceil(count / Math.min(capacity, CW_TARGET_FRAMES)));
        const picked = [];
        for (let i = 0; i < count; i += stride) picked.push(i);

        const frames = [];
        for (const idx of picked) frames.push(await sharp(shots[idx]).extract(dr).png().toBuffer());
        const cols = Math.max(1, Math.min(Math.floor(2048 / dr.width), frames.length));
        const rows = Math.ceil(frames.length / cols);
        const sheetBuf = await sharp({
          create: {
            width: cols * dr.width,
            height: rows * dr.height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite(
            frames.map((f, i) => ({
              input: f,
              left: (i % cols) * dr.width,
              top: Math.floor(i / cols) * dr.height,
            })),
          )
          .png()
          .toBuffer();
        const contentTag = crypto.createHash("md5").update(sheetBuf).digest("hex").slice(0, 8);
        const fileName = "overlay_cw_" + cwKey(o) + "_" + contentTag + ".png";
        fsHandlers.writeFileSync(pathHandlers.join(ctx.outDir, fileName), sheetBuf);
        for (const f of fsHandlers.readdirSync(ctx.outDir)) {
          if (!f.startsWith("overlay_cw_" + cwKey(o) + "_")) continue;
          if (f.startsWith(fileName.replace(/\.png$/, ""))) continue;
          try {
            const p = pathHandlers.join(ctx.outDir, f);
            if (Date.now() - fsHandlers.statSync(p).mtimeMs > 600000) fsHandlers.unlinkSync(p);
          } catch (e) {}
        }
        const meta = {
          stripFile: fileName,
          frameCount: frames.length,
          cols,
          rows,
          frameMs: Math.max(40, CW_STEP_MS * stride),
        };
        fsHandlers.writeFileSync(
          pathHandlers.join(ctx.outDir, fileName.replace(/\.png$/, ".json")),
          JSON.stringify(meta),
        );
        console.log(
          "cw sheet:",
          o.cellWeather,
          frames.length + "f @" + meta.frameMs + "ms, cycle " + Math.round(periodMs / 100) / 10 + "s",
        );
        built.set(k, meta);
      } catch (e) {
        console.error("cell weather film failed (" + k + "):", e.message);
      }
    }

    for (const o of live) {
      const c = built.get(sizeKey(o)) || cachedFor(o);
      if (!c) {
        o.skip = true;
        continue;
      }
      fill(o, c);
    }
    return items.filter((o) => !o.skip);
  },
};

// ---- photo slideshow (image widget) ------------------------------------
// The portal resolves every source (Unsplash/Google Photos/iCloud/S3)
// into $scope.imageWidgetList[n].images - a plain URL array. The overlay
// just carries that list + interval; the Roku crossfades through it
// natively. The currently-baked photo stays in the image as fallback.
// Single-image widgets stay baked (no overlay needed).
/* How many photo URLs a slideshow or rotating background may carry to
 * the device. The portal itself caps nothing - it holds whatever the
 * backend or Unsplash returns - so this is the only limit, and a widget
 * with more photos than this would loop the first N forever, silently.
 * 250 is ~25KB of manifest against the ~31KB it already is: cheap
 * against a manifest the TV refetches on every version change, and
 * enough for any realistic album (Dave, 2026-08-31). */
const MAX_ROTATION_IMAGES = 250;

const slideshowHandler = {
  type: "slideshow",

  async extract(frame) {
    /* the cap is a Node constant: it must be PASSED IN, not referenced
     * inside the page (2026-09-02: referencing it threw
     * "MAX_ROTATION_IMAGES is not defined" in the browser and killed
     * the whole handler) */
    const raw = await frame.evaluate((maxImages) => {
      if (!window.angular) return [];
      const roots = [document.querySelector("[ng-app]"), document.body, document.documentElement];
      let list = null;
      for (const r of roots) {
        if (!r) continue;
        const inj = window.angular.element(r).injector();
        if (!inj) continue;
        const walk = (s) => {
          if (!s || list) return;
          if (s.imageWidgetList) {
            list = s.imageWidgetList;
            return;
          }
          walk(s.$$childHead);
          walk(s.$$nextSibling);
        };
        walk(inj.get("$rootScope"));
        break;
      }
      const out = [];
      (list || []).forEach((d) => {
        try {
          const ws = d.widgetSetting || {};
          const iws = (ws.data && ws.data.imageWidgetSetting) || {};
          (d.pagenumber || []).forEach((pg) => {
            const el = document.getElementById("img_" + d.widgetId + "_" + pg + "_1");
            if (!el) return;
            const r = el.getBoundingClientRect();
            if (r.width < 20 || r.height < 20) return;
            out.push({
              type: "slideshow",
              widgetSettingId: d.widgetId,
              page: parseInt(pg, 10),
              rect: { x: r.x, y: r.y, w: r.width, h: r.height },
              images: (d.images || []).slice(0, maxImages),
              intervalSeconds: parseInt(iws.imageDelayTime, 10) || 60,
              cropToFill: iws.isCropToFill === true,
              transition: iws.transition || "fade",
            });
          });
        } catch (e) {}
      });
      return out;
    }, MAX_ROTATION_IMAGES);
    /* One photo counts. BLOCKED_MEDIA stops the portal loading ANY
     * user photo, so a widget skipped here is not "left baked" - it is
     * left EMPTY on the TV. Single-image widgets used to fall through
     * that gap (LIVE_PORTAL.md open item 7). The device's slide timer
     * already no-ops below two images, so a lone photo simply shows. */
    return raw.filter((o) => o.images && o.images.length >= 1);
  },

  // photos are FULLY hidden from the render (Dave's call): with crop
  // off, a baked photo of a different aspect ratio peeks around the
  // overlay's contain-fit photos. The widget panel stays baked; the
  // overlay is the single source of photo pixels. Also hides the
  // "image is loading" placeholder text so it can't get baked.
  async hide(frame, overlays) {
    await frame.evaluate((list) => {
      list.forEach((o) => {
        const suffix = o.widgetSettingId + "_" + o.page;
        ["img_" + suffix + "_1", "img_" + suffix + "_2", "img_loading_" + suffix].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.style.opacity = "0";
        });
      });
    }, overlays);
  },
};

// ---- countdown: numbers ticked natively, chrome stays baked ------------
// Box backgrounds, unit labels and the event name are static - they stay
// in the image. Only the .value numbers are hidden and re-rendered on
// device. The target is shipped as an absolute epoch computed in the
// render browser (matches how the portal parses eventTime in device-local
// time), so the Roku only does timezone-free epoch math.
const countdownHandler = {
  type: "countdown",

  async extract(frame) {
    return await frame.evaluate(() => {
      const out = [];
      // event times live in the scope's page/widget tree
      const eventTimeByWidget = {};
      if (window.angular) {
        const roots = [document.querySelector("[ng-app]"), document.body, document.documentElement];
        for (const r of roots) {
          if (!r) continue;
          const inj = window.angular.element(r).injector();
          if (!inj) continue;
          let groups = null;
          const walk = (s) => {
            if (!s || groups) return;
            if (s.groups && s.groups.length) {
              groups = s.groups;
              return;
            }
            walk(s.$$childHead);
            walk(s.$$nextSibling);
          };
          walk(inj.get("$rootScope"));
          (groups || []).forEach((g) => {
            (g.widgets || []).forEach((w) => {
              const cd = w.data && w.data.countDownWidget;
              if (cd && cd.eventTime) eventTimeByWidget[w.widgetSettingId] = cd.eventTime;
            });
          });
          break;
        }
      }

      document.querySelectorAll('[id^="countdown_"]').forEach((container) => {
        const m = container.id.match(/^countdown_(\d+)_(\d+)$/);
        if (!m) return;
        const wid = parseInt(m[1], 10);
        const eventTime = eventTimeByWidget[wid];
        if (!eventTime) return;
        const target = Date.parse(String(eventTime).replace(" ", "T"));
        if (!target) return;

        const elements = {};
        container.querySelectorAll(".count-down-box").forEach((box) => {
          const section = box.getAttribute("data-countdown-section");
          const value = box.querySelector(".value");
          if (!section || !value || value.offsetParent === null) return;
          const r = value.getBoundingClientRect();
          const cs = getComputedStyle(value);
          elements[section] = {
            rect: { x: r.x, y: r.y, w: r.width, h: r.height },
            fontSizePx: parseFloat(cs.fontSize),
            bold: parseInt(cs.fontWeight, 10) >= 600,
            align: cs.textAlign,
            fontFamily: (cs.fontFamily || "").split(",")[0].replace(/["']/g, "").trim() || null,
            color: (() => {
              const mm = cs.color.match(/rgba?\(([^)]+)\)/);
              if (!mm) return "#FFFFFFFF";
              const p = mm[1].split(",").map((s) => parseFloat(s.trim()));
              const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
              const a = p.length > 3 ? Math.round(p[3] * 255) : 255;
              return ("#" + h(p[0]) + h(p[1]) + h(p[2]) + h(a)).toUpperCase();
            })(),
          };
        });
        if (Object.keys(elements).length === 0) return;
        out.push({
          type: "countdown",
          widgetSettingId: wid,
          page: parseInt(m[2], 10),
          targetEpochSeconds: Math.floor(target / 1000),
          elements,
        });
      });
      return out;
    });
  },

  async hide(frame, overlays) {
    await frame.evaluate((list) => {
      list.forEach((o) => {
        const container = document.getElementById("countdown_" + o.widgetSettingId + "_" + o.page);
        if (!container) return;
        container.querySelectorAll(".count-down-box .value").forEach((el) => {
          el.style.opacity = "0";
        });
      });
    }, overlays);
  },
};

// ---- page background slideshow (layered render) ------------------------
// A background sits BEHIND the widgets, so it can't be a normal overlay.
// When a page has a rotating background, the handler hides the portal's
// bg layers and the render is taken with a transparent page background
// (render.js switches to alpha PNG), producing a widgets-only layer. The
// Roku then stacks: page color -> background photos -> widgets PNG ->
// overlays. Emitted as its own type so MainScene puts it in the slot's
// UNDER-container; single-photo backgrounds stay baked.
const backgroundHandler = {
  type: "background",

  async extract(frame) {
    return await frame.evaluate((maxImages) => {
      let sc = null;
      const roots = [document.querySelector("[ng-app]"), document.body, document.documentElement];
      for (const r of roots) {
        if (!r || !window.angular) continue;
        const inj = window.angular.element(r).injector();
        if (!inj) continue;
        const walk = (s) => {
          if (!s || sc) return;
          if (s.groups && s.groups.length) {
            sc = s;
            return;
          }
          walk(s.$$childHead);
          walk(s.$$nextSibling);
        };
        walk(inj.get("$rootScope"));
        break;
      }
      if (!sc) return [];
      const pageIdx = typeof sc.quoteIndex === "number" ? sc.quoteIndex : 0;
      const group = sc.groups[pageIdx];
      if (!group || group.isBackgroundImage !== true) return [];
      const obj = sc.backgroundImageObj || {};

      // the photo currently painted is no longer in the queue (the portal
      // splices as it shows), so put it first to keep continuity
      const images = [];
      for (const id of ["bg_img_1", "bg_img_2"]) {
        const el = document.getElementById(id);
        if (!el) continue;
        const m = (getComputedStyle(el).backgroundImage || "").match(/url\(["']?([^"')]+)["']?\)/);
        if (m && m[1] && !images.includes(m[1])) images.push(m[1]);
      }
      (sc.allPhotos || []).forEach((p) => {
        if (p && p.regular && !images.includes(p.regular)) images.push(p.regular);
      });
      if (images.length < 2) return []; // static background stays baked

      let brightness = 1;
      if (typeof sc.imageBrightness === "number") brightness = sc.imageBrightness;
      else if (typeof obj.imageBrightness === "number") brightness = obj.imageBrightness;

      // #main carries the page background color (it is made transparent
      // for the layered render, so the Roku must paint it underneath)
      let pageColor = null;
      const mainEl = document.getElementById("main");
      if (mainEl) {
        const c = getComputedStyle(mainEl).backgroundColor;
        if (c && c !== "rgba(0, 0, 0, 0)") pageColor = c;
      }
      if (!pageColor) {
        const bs = sc.mirrorBackgroundSetting || (sc.mirrorDetail && sc.mirrorDetail.backgroundSetting);
        if (bs && bs.pageBackgroundColor) pageColor = bs.pageBackgroundColor;
      }

      return [
        {
          type: "background",
          // page-level, not a widget - synthetic id keeps state keys unique
          widgetSettingId: -1,
          page: pageIdx,
          images: images.slice(0, maxImages),
          intervalSeconds: parseInt(obj.imageDelayTime, 10) || 60,
          cropToFill: obj.isCropToFill !== false,
          transition: obj.transition || "fade",
          brightness,
          pageColor,
        },
      ];
    }, MAX_ROTATION_IMAGES);
  },

  async hide(frame) {
    await frame.evaluate(() => {
      ["bg_img_1", "bg_img_2"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.opacity = "0";
      });
    });
  },
};

// ---- visual overlays (seasonal effects) --------------------------------
// These are display-wide, not per-widget, and the portal draws them on
// full-screen canvases with per-frame randomness. Film strips are the
// wrong tool here (full-screen sheets blow the texture budget, the motion
// never repeats, and ~10fps strips look jerky), so the Roku re-creates
// them natively as particle animations using the SAME sprite art.
//
// NOTE: sprite URLs and motion constants live inside the portal's
// overlayController.js, so this table MIRRORS them. If the portal's
// artwork or tuning changes, update this table too.
const S3_OVERLAY = "https://displaytemplates.s3.us-east-1.amazonaws.com/media/visualoverlays/";

const EFFECTS = {
  // portal: overlaySetting.snow -> #snow, "❅" glyphs, CSS `fall` keyframes
  // (down, drifting +40px mid-flight), size 1-2.5em, 11-16.5s, max 30.
  // The glyph is text, so the sprite is generated locally.
  snow: {
    type: "snow",
    domIds: ["snow"],
    domClasses: ["snowflake"],
    generate: ["snowflake"],
    config: {
      sprites: ["effect_snowflake.png"],
      maxCount: 30,
      spawnEverySeconds: 0.7,
      sizeRange: [16, 40],
      speedRange: [70, 105],
      driftAmplitudeRange: [20, 45],
      driftPeriodRange: [5, 11],
      fadeInPx: 60,
      growthFactor: 1.0,
      direction: "down",
    },
  },

  // portal: overlaySetting.fallingLeaves -> .leaf imgs, 18-30s fall, 1/s.
  // The art is animated GIFs; Roku Posters show a single frame, so the
  // first frame is extracted and the flutter is replaced by native spin.
  fallingLeaves: {
    type: "leaves",
    domIds: ["fallingLeaves"],
    domClasses: ["leaf"],
    generate: ["leaves"],
    config: {
      sprites: [
        "effect_leaf1.png",
        "effect_leaf2.png",
        "effect_leaf3.png",
        "effect_leaf4.png",
        "effect_leaf5.png",
        "effect_leaf6.png",
      ],
      maxCount: 18,
      spawnEverySeconds: 1.0,
      sizeRange: [34, 62],
      speedRange: [38, 62],
      driftAmplitudeRange: [30, 70],
      driftPeriodRange: [6, 13],
      fadeInPx: 60,
      growthFactor: 1.0,
      spinTurnsRange: [-1.4, 1.4],
      direction: "down",
    },
  },

  // portal: overlaySetting.flHeart -> .heart imgs (red_heart1.png, 30px
  // wide), CSS `fallHearts` (down with a +/-20px sway), 25-35s, max 20
  flHeart: {
    type: "hearts",
    domIds: [],
    domClasses: ["heart"],
    config: {
      sprites: [S3_OVERLAY + "red_heart1.png"],
      maxCount: 20,
      spawnEverySeconds: 1.5,
      sizeRange: [26, 34],
      speedRange: [32, 45],
      driftAmplitudeRange: [15, 25],
      driftPeriodRange: [7, 14],
      fadeInPx: 80,
      growthFactor: 1.0,
      direction: "down",
    },
  },

  // portal: overlaySetting.flBalloon -> #balloonCanvas
  flBalloon: {
    type: "balloons",
    domIds: ["balloonCanvas"],
    config: {
      sprites: [
        S3_OVERLAY + "baloons/blue_balloon.png",
        S3_OVERLAY + "baloons/green_balloon.png",
        S3_OVERLAY + "baloons/yellow_balloon.png",
        S3_OVERLAY + "baloons/purple_balloon.png",
        S3_OVERLAY + "baloons/pink_balloon.png",
      ],
      // portal: <=15 balloons, size 30-70px, 0.2-0.7 px/frame @60fps,
      // sine drift (amplitude 20-60px, 0.5-1.5 rad/s), fade in over the
      // first 100px of travel, slow growth while rising
      maxCount: 15,
      spawnEverySeconds: 1.6,
      sizeRange: [30, 70],
      speedRange: [12, 42],
      driftAmplitudeRange: [20, 60],
      driftPeriodRange: [4.2, 12.6],
      fadeInPx: 100,
      growthFactor: 1.25,
      direction: "up",
    },
  },
};

// sprite aspect ratios, measured once per process. The portal scales by
// width and lets height follow the art (drawHeight = natH * size/natW),
// so the Roku needs the real ratio or the sprites come out squashed.
const spriteAspectCache = {};

async function spriteAspect(url) {
  if (spriteAspectCache[url] !== undefined) return spriteAspectCache[url];
  let aspect = 1.3;
  try {
    const sharp = require("sharp");
    const resp = await fetch(url);
    if (resp.ok) {
      const meta = await sharp(Buffer.from(await resp.arrayBuffer())).metadata();
      if (meta.width > 0 && meta.height > 0) aspect = meta.height / meta.width;
    }
  } catch (e) {
    console.error("sprite aspect failed (" + url.split("/").pop() + "):", e.message);
  }
  spriteAspectCache[url] = aspect;
  return aspect;
}

// String lights: an animated WEBP tiled across the full width at the top
// and bottom. Built into a sprite sheet (one full-width strip per frame)
// and played by the existing GifOverlay, so the blink survives.
const STRINGLIGHT_HEIGHT = 50;

async function buildStringLightEffects(outDir) {
  const sharp = require("sharp");
  const file = "effect_stringlights.png";
  const filePath = pathHandlers.join(outDir, file);
  const metaPath = filePath.replace(/\.png$/, ".json");
  let meta;

  if (fsHandlers.existsSync(filePath) && fsHandlers.existsSync(metaPath)) {
    meta = JSON.parse(fsHandlers.readFileSync(metaPath, "utf8"));
  } else {
    const resp = await fetch(S3_OVERLAY + "stringlight.webp");
    if (!resp.ok) throw new Error("stringlight fetch " + resp.status);
    const buf = Buffer.from(await resp.arrayBuffer());
    const src = await sharp(buf, { animated: true }).metadata();
    const pages = src.pages || 1;
    const frameH = src.pageHeight || src.height;
    const tileW = Math.max(1, Math.round((src.width / frameH) * STRINGLIGHT_HEIGHT));
    const cols = Math.ceil(1920 / tileW) + 1;
    // 2048px sheet ceiling: subsample long animations
    const maxFrames = Math.max(1, Math.floor(2048 / STRINGLIGHT_HEIGHT));
    const step = Math.max(1, Math.ceil(pages / maxFrames));
    const indices = [];
    for (let i = 0; i < pages; i += step) indices.push(i);

    const strips = [];
    for (const idx of indices) {
      const tile = await sharp(buf, { page: idx })
        .resize(tileW, STRINGLIGHT_HEIGHT, { fit: "fill" })
        .png()
        .toBuffer();
      const row = [];
      for (let c = 0; c < cols; c++) row.push({ input: tile, left: c * tileW, top: 0 });
      strips.push(
        await sharp({
          create: {
            width: 1920,
            height: STRINGLIGHT_HEIGHT,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite(row)
          .png()
          .toBuffer(),
      );
    }

    await sharp({
      create: {
        width: 1920,
        height: STRINGLIGHT_HEIGHT * strips.length,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(strips.map((s, i) => ({ input: s, left: 0, top: i * STRINGLIGHT_HEIGHT })))
      .png()
      .toFile(filePath);

    const delays = Array.isArray(src.delay) ? src.delay : [];
    const avg = delays.length ? delays.reduce((a, b) => a + (b > 0 ? b : 120), 0) / delays.length : 120;
    meta = {
      frameCount: strips.length,
      frameMs: Math.max(60, Math.round(avg * step)),
      cols: 1,
      rows: strips.length,
    };
    fsHandlersWriteJson(metaPath, meta);
    console.log("generated string light sheet:", strips.length, "frames");
  }

  const base = { type: "spritesheet", stripFile: file, frameW: 1920, frameH: STRINGLIGHT_HEIGHT, ...meta };
  return [
    { ...base, rect: { x: 0, y: 0, w: 1920, h: STRINGLIGHT_HEIGHT } },
    { ...base, rect: { x: 0, y: 1080 - STRINGLIGHT_HEIGHT, w: 1920, h: STRINGLIGHT_HEIGHT } },
  ];
}

function fsHandlersWriteJson(p, obj) {
  fsHandlers.writeFileSync(p, JSON.stringify(obj));
}

// Build a sprite sheet from an animated image (GIF/WEBP) at a target
// width, for effects that both animate AND move. Same grid rules as the
// widget GIF pipeline: <=2048 per side, cached by url+size.
// Giphy pools used by the pop-up overlays (elf / scary). Mirrored from
// the portal's overlayController.js.
const ELF_GIFS = [
  "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExaXl4OGtvc3N4NjVpYWFneGxnb2YzZXQ2MG9jcXJzYnc1bnV2NmgwZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/c6Wwg5oTaXNPydsOpO/giphy.gif",
  "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExem1heXU4bW84MmEwZGtmczQ2NWhxMDExcHhvb3F5a21xNmR1Mjd5YyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/nqLx5MEvW09S3R7KjM/giphy.gif",
  "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExNG0xd2J5bWR3N3FjZnRhYzljaDZ5dHBrMGtocmo5ajBvcW0xN3RsZiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/2vqcMtDEE8HHKoSDuG/giphy.gif",
  "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExeW9nNHZzcjMxcmV3cGtjNTgwd2xuZWNlNzIzbW00cXNhYjR2ZGxvayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/jUXA5epl1lWkI33w8s/giphy.gif",
  "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExeHhtbWVvbHdlODhhMGZiYWZhYmdrNjdpNDRoaTJqN3dvcHo2NDIwMCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/saushIfoVoIAWAUxHO/giphy.gif",
  "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExdmtrdXJheWVjMHowMXpiMjQxbjgxeWh2ZG52dTViZzAyYmNrdW92aCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/dFtJ7fIzH8N7nTXPHH/giphy.gif",
  "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExbm9wZmMzd2tpY2xqdHdlbXBpaDdjeTQ3NmYxNXA1MWxxZGU4azdtNyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/Jcdo0sSYwHu3BAkhp3/giphy.gif",
  "https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExNzN2eGI1aWFhM2twc2k1cWN0NWM5YzhhaTBkNWRnMXJuMHg5aDlybiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/vxALUErbULsI7kTlxg/giphy.gif",
];

const SCARY_GIFS = [
  S3_OVERLAY + "haloween/skull_bye.gif",
  S3_OVERLAY + "haloween/spider_crawl2.gif",
  S3_OVERLAY + "haloween/ghost1.gif",
  S3_OVERLAY + "haloween/skull2.gif",
  S3_OVERLAY + "haloween/bats.gif",
  S3_OVERLAY + "haloween/witch_face.gif",
];

// A pre-rendered burst sheet shipped inside the image (effect-assets/,
// generated at build time). Dwell = `cycles` full playthroughs at one
// position; the sheets end on faded/empty frames, so jitterMs pulls the
// pop-out a touch earlier INTO that tail (never past a fresh burst) and
// keeps multiple players of the same sheet from syncing up.
function bundledBurstEffect(name, outDir, cycles, jitterMs) {
  const base = pathHandlers.join(__dirname, "effect-assets", "effect_" + name + "_sheet");
  const meta = JSON.parse(fsHandlers.readFileSync(base + ".json", "utf8"));
  // content-hashed name: a regenerated sheet must get a NEW url, or the
  // TV's texture cache (and R2) keep showing the old art at the old one
  const png = fsHandlers.readFileSync(base + ".png");
  const file = "effect_" + name + "_" + crypto.createHash("md5").update(png).digest("hex").slice(0, 8) + ".png";
  const dest = pathHandlers.join(outDir, file);
  if (!fsHandlers.existsSync(dest)) fsHandlers.writeFileSync(dest, png);
  const cycleMs = meta.frameCount * meta.frameMs;
  return {
    type: "popup",
    sprites: [{ stripFile: file, ...meta }],
    dwellMsRange: [cycleMs * cycles - jitterMs, cycleMs * cycles],
    popMs: 130,
  };
}

// portal: .elf img { height: 200px }, one at a time, 4-6s dwell,
// pop-in/pop-out, random position anywhere on screen
async function buildPopupEffect(urls, outDir, prefix) {
  const sprites = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      sprites.push(await buildAnimatedSheet(urls[i], 200, outDir, prefix + i, "height"));
    } catch (e) {
      console.error(prefix + " sprite " + i + " failed:", e.message);
    }
  }
  if (!sprites.length) throw new Error("no " + prefix + " sprites");
  return {
    type: "popup",
    sprites,
    dwellMsRange: [4000, 6000],
    popMs: 500,
  };
}

async function buildAnimatedSheet(url, target, outDir, prefix, fit) {
  const sharp = require("sharp");
  const key = crypto.createHash("md5").update(url + "|" + target + "|" + (fit || "width")).digest("hex").slice(0, 12);
  const file = "effect_" + prefix + "_" + key + ".png";
  const filePath = pathHandlers.join(outDir, file);
  const metaPath = filePath.replace(/\.png$/, ".json");
  if (fsHandlers.existsSync(filePath) && fsHandlers.existsSync(metaPath)) {
    return { stripFile: file, ...JSON.parse(fsHandlers.readFileSync(metaPath, "utf8")) };
  }

  const flipFile = file.replace(/\.png$/, "_flip.png");
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("fetch " + resp.status);
  const buf = Buffer.from(await resp.arrayBuffer());
  const src = await sharp(buf, { animated: true }).metadata();
  const pages = src.pages || 1;
  const srcH = src.pageHeight || src.height;
  let frameW = Math.round(target);
  let frameH = Math.max(1, Math.round((srcH / src.width) * target));
  if (fit === "height") {
    frameH = Math.round(target);
    frameW = Math.max(1, Math.round((src.width / srcH) * target));
  }

  const maxFrames = Math.min(
    36,
    Math.max(2, Math.floor(2048 / frameW) * Math.floor(2048 / frameH)),
  );
  const step = Math.max(1, Math.ceil(pages / maxFrames));
  const indices = [];
  for (let i = 0; i < pages && indices.length < maxFrames; i += step) indices.push(i);

  const frames = [];
  for (const idx of indices) {
    frames.push(
      await sharp(buf, { page: idx }).resize(frameW, frameH, { fit: "fill" }).png().toBuffer(),
    );
  }
  const cols = Math.max(1, Math.min(Math.floor(2048 / frameW), frames.length));
  const rows = Math.ceil(frames.length / cols);
  await sharp({
    create: {
      width: cols * frameW,
      height: rows * frameH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      frames.map((f, i) => ({
        input: f,
        left: (i % cols) * frameW,
        top: Math.floor(i / cols) * frameH,
      })),
    )
    .png()
    .toFile(filePath);

  // A mirrored sheet for travel in the other direction: Roku clips a
  // Group AFTER its transform, so a negative scale pushes the frame
  // window out of its own cutout and the sprite vanishes. Each frame is
  // flipped individually so the grid addressing is unchanged.
  const flipped = [];
  for (const f of frames) flipped.push(await sharp(f).flop().png().toBuffer());
  await sharp({
    create: {
      width: cols * frameW,
      height: rows * frameH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(
      flipped.map((f, i) => ({
        input: f,
        left: (i % cols) * frameW,
        top: Math.floor(i / cols) * frameH,
      })),
    )
    .png()
    .toFile(pathHandlers.join(outDir, flipFile));

  const delays = Array.isArray(src.delay) ? src.delay : [];
  const avg = delays.length ? delays.reduce((a, b) => a + (b > 0 ? b : 90), 0) / delays.length : 90;
  const meta = {
    frameW,
    frameH,
    cols,
    rows,
    frameCount: frames.length,
    frameMs: Math.max(50, Math.round(avg * step)),
    stripFileFlipped: flipFile,
  };
  fsHandlersWriteJson(metaPath, meta);
  console.log("generated " + prefix + " sheet:", frames.length, "frames", frameW + "x" + frameH);
  return { stripFile: file, ...meta };
}

async function spriteAspectLocal(file) {
  if (spriteAspectCache[file] !== undefined) return spriteAspectCache[file];
  let aspect = 1;
  try {
    const meta = await require("sharp")(file).metadata();
    if (meta.width > 0 && meta.height > 0) aspect = meta.height / meta.width;
  } catch (e) {
    console.error("local sprite aspect failed (" + file + "):", e.message);
  }
  spriteAspectCache[file] = aspect;
  return aspect;
}

async function extractEffects(frame, ctx) {
  const enabled = await frame.evaluate(() => {
    if (!window.angular) return null;
    const roots = [document.querySelector("[ng-app]"), document.body, document.documentElement];
    for (const r of roots) {
      if (!r) continue;
      const inj = window.angular.element(r).injector();
      if (!inj) continue;
      let found = null;
      const walk = (s) => {
        if (!s || found) return;
        if (s.overlaySetting) {
          found = s.overlaySetting;
          return;
        }
        walk(s.$$childHead);
        walk(s.$$nextSibling);
      };
      walk(inj.get("$rootScope"));
      return found || null;
    }
    return null;
  });
  if (!enabled) return [];
  const active = Object.keys(EFFECTS).filter(
    (key) => enabled[key] === true || enabled[key] === "true",
  );
  const outDir = (ctx && ctx.outDir) || ".";
  const toGenerate = active.flatMap((key) => EFFECTS[key].generate || []);
  if (toGenerate.length) await generateEffectSprites(toGenerate, outDir);

  const out = [];

  // Santa: an animated GIF that bounces around the screen (portal moves
  // him 2px/0.5px per frame @60fps, flipping to face his direction).
  // The Roku computes the bounce itself, leg by leg.
  if (enabled.santa === true || enabled.santa === "true") {
    try {
      const sheet = await buildAnimatedSheet(S3_OVERLAY + "santa_flying.gif", 150, outDir, "santa");
      out.push({
        type: "spritemover",
        ...sheet,
        width: sheet.frameW,
        height: sheet.frameH,
        startX: 0,
        startY: 50,
        speedX: 120,
        speedY: 30,
        flipOnTurn: true,
      });
    } catch (e) {
      console.error("santa effect failed:", e.message);
    }
  }

  // Flying witch set: the witch (bats trailing her) plus two spiders
  // that rotate to face their direction. Portal speeds are px/frame at
  // 60fps; entity boxes and start positions mirrored from its table.
  if (enabled.flyingWitch === true || enabled.flyingWitch === "true") {
    try {
      const witch = await buildAnimatedSheet(
        S3_OVERLAY + "haloween/witch_broom.png",
        150,
        outDir,
        "witch",
      );
      const bats = await buildAnimatedSheet(S3_OVERLAY + "haloween/bats.gif", 120, outDir, "bats");
      out.push({
        type: "spritemover",
        ...witch,
        startX: 0,
        startY: 1080 - 200,
        startDirX: 1,
        startDirY: -1,
        speedX: 150,
        speedY: 42,
        flipOnTurn: true,
        companion: { ...bats, offsetX: -(bats.frameW + 20), offsetY: -20 },
      });

      const spider = await buildAnimatedSheet(
        S3_OVERLAY + "haloween/spiderwalk.gif",
        100,
        outDir,
        "spider",
      );
      out.push({
        type: "spritemover",
        ...spider,
        startX: 30,
        startY: 1080 - 200,
        startDirX: 1,
        startDirY: -1,
        speedX: 60,
        speedY: 72,
        flipOnTurn: true,
        rotateOnTurn: true,
      });

      // separate system: spiders that drop from the top on threads
      // (portal: class "spider" + SVG "web-line", ~1 per 200px, 0.6
      // px/frame @60fps, sway sin(t/600)*22.5, down to height-120)
      const dropper = await buildAnimatedSheet(
        S3_OVERLAY + "haloween/spiderwalk.gif",
        80,
        outDir,
        "spiderdrop",
      );
      out.push({
        type: "dropper",
        ...dropper,
        count: Math.max(1, Math.floor(1920 / 200)),
        speed: 36,
        maxY: 1080 - 120,
        swayAmplitude: 22.5,
        swayPeriodMs: 3770,
        threadColor: "0xC8C8C8CC",
      });

      const spider3 = await buildAnimatedSheet(
        S3_OVERLAY + "haloween/spiderwalk.gif",
        110,
        outDir,
        "spider3",
      );
      out.push({
        type: "spritemover",
        ...spider3,
        startX: 1920 - 150,
        startY: 1080 - 150,
        startDirX: -1,
        startDirY: -1,
        speedX: 60,
        speedY: 72,
        flipOnTurn: true,
        rotateOnTurn: true,
      });
    } catch (e) {
      console.error("witch effect failed:", e.message);
    }
  }

  // pop-up characters: one random GIF at a random spot, 4-6s, repeat
  if (enabled.elf === true || enabled.elf === "true") {
    try {
      out.push(await buildPopupEffect(ELF_GIFS, outDir, "elf"));
    } catch (e) {
      console.error("elf effect failed:", e.message);
    }
  }
  if (enabled.scaryPopUp === true || enabled.scaryPopUp === "true") {
    try {
      out.push(await buildPopupEffect(SCARY_GIFS, outDir, "scary"));
    } catch (e) {
      console.error("scary effect failed:", e.message);
    }
  }

  // Fireworks and Bursting Hearts: the two effects dropped from v1
  // because their per-frame particle physics fights the Express. The
  // burst is pre-rendered ONCE at build time from the portal's own
  // confetti library (tools/generate-celebrations.js) and pops at random
  // positions - one full playthrough per appearance.
  if (enabled.firework === true || enabled.firework === "true") {
    try {
      // two independent players so shells overlap (Dave 2026-08-26:
      // one at a time is too sparse); different cycle counts mean their
      // appearance boundaries drift apart instead of firing in lockstep
      out.push(bundledBurstEffect("firework", outDir, 1, 300));
      out.push(bundledBurstEffect("firework", outDir, 2, 300));
    } catch (e) {
      console.error("firework effect failed:", e.message);
    }
  }
  if (enabled.bsHeart === true || enabled.bsHeart === "true") {
    try {
      out.push(bundledBurstEffect("bsheart", outDir, 1, 100));
    } catch (e) {
      console.error("bursting hearts effect failed:", e.message);
    }
  }

  // string lights are a fixed pair of animated strips, not particles
  if (enabled.stringLight === true || enabled.stringLight === "true") {
    try {
      out.push(...(await buildStringLightEffects(outDir)));
    } catch (e) {
      console.error("string lights failed:", e.message);
    }
  }

  for (const key of active) {
    const cfg = { type: EFFECTS[key].type, ...EFFECTS[key].config };
    cfg.sprites = await Promise.all(
      cfg.sprites.map(async (src) => {
        // generated sprites are local filenames (resolved against the
        // asset base on the device); everything else is an absolute URL
        const local = !/^https?:/i.test(src);
        const aspect = local
          ? await spriteAspectLocal(pathHandlers.join(outDir, src))
          : await spriteAspect(src);
        return { url: src, aspect };
      }),
    );
    out.push(cfg);
  }
  return out;
}

// keep the portal's own effect elements out of the still: frozen
// mid-flight particles would sit baked under the live native ones.
// (leaves and hearts are appended straight to <body> by class, so both
// ids and classes have to be covered)
// Every visual-overlay element the devices draw natively, and which
// must therefore never appear in a painted capture. ONE list, TWO
// consumers: livePortal injects it as a born-hidden CSS rule (so
// elements that respawn mid-capture are hidden from their first paint),
// and hideEffects sweeps it per capture as the belt-and-braces pass.
function effectHideSelectors() {
  const ids = Object.values(EFFECTS)
    .flatMap((e) => e.domIds || [])
    // fireworksCanvas/bsHearts: the portal's own firework and bursting-
    // hearts overlays. The TV plays bundled sheets instead, and a live
    // canvas here bakes a frozen mid-explosion into the still (seen
    // 2026-08-26: a green shell stuck at the top of every capture).
    .concat(["santa", "elf", "scaryelf", "witch", "bat", "spider", "spider3", "fireworksCanvas", "bsHearts"]);
  const classes = Object.values(EFFECTS)
    .flatMap((e) => e.domClasses || [])
    // "spider" class = the dropping spiders, "web-line" = their threads
    .concat(["stringlight", "elf", "spider", "web-line"]);
  return { ids, classes };
}

// CSS that must hold whenever this portal is photographed, in TWO
// tags because they have different lifecycles: effect hiding is
// permanent, while the weather settle is lifted for the moments the
// cell-weather film rolls (cellWeatherHandler).
//
// mm-capture-hygiene: effect elements stay invisible (effectHideSelectors).
// mm-weather-settle: the calendar cell-weather decoration SETTLES - its
// ~27 infinite CSS animations (rain/snow/hail particles, cloud drift,
// beam sweeps, icon floats; util/calendarWeatherOverlay.js + style.css)
// otherwise bake into every capture at a random mid-phase (Dave saw
// frozen raindrops, 2026-08-26). Transient particles hide entirely;
// persistent pieces (strip gradient, temperatures) keep their resting
// look. Scoped to .mm-weather-* only - scar 1: calendar scrolling
// depends on animationend, so a broad animation:none is forbidden.
function effectHideCss() {
  const sel = effectHideSelectors();
  return sel.ids.map((i) => "#" + i).concat(sel.classes.map((c) => "." + c)).join(",") + "{opacity:0 !important}";
}
/* Month cells with more events than fit are MARQUEED by the portal
 * (mangoMirrorScroll animates top from +boxHeight to -innerHeight,
 * looping). A still lands at a random point in that cycle - sometimes
 * mid-row, and at each end of the cycle the content is entirely outside
 * its window, so the cell photographs EMPTY (a blank 14th, 2026-09-02).
 * Parking every marquee at the top makes captures deterministic: the
 * first events, cleanly. A stylesheet !important beats the inline top
 * jQuery animates, so the animation may keep running underneath.
 * Its own element so the cell-scroll film can disable JUST this while it
 * drives `top` itself. */
function scrollParkCss() {
  return ".-m-scroll-c{top:0 !important}";
}

function weatherSettleCss() {
  const weatherParticles = [".mm-rain-drop", ".mm-snow-flake", ".mm-hail-pellet", ".mm-wind-line", ".mm-fog-line", ".mm-storm-bolt"];
  const weatherScope = [
    ".mm-weather-overlay", ".mm-weather-overlay *", ".mm-weather-overlay::before", ".mm-weather-overlay::after",
    ".mm-weather-overlay *::before", ".mm-weather-overlay *::after",
    ".mm-weather-header-meta", ".mm-weather-header-meta *", ".mm-weather-header-meta *::before", ".mm-weather-header-meta *::after",
  ];
  return (
    weatherParticles.join(",") + "{opacity:0 !important}" +
    weatherScope.join(",") + "{animation:none !important}"
  );
}

async function hideEffects(frame) {
  // the persistent rules normally arrive via livePortal's init script;
  // installing them here too covers the legacy (non-painted) pipeline,
  // whose pages never pass through livePortal
  await frame.evaluate((tags) => {
    for (const t of tags) {
      if (!document.getElementById(t.id)) {
        const s = document.createElement("style");
        s.id = t.id;
        s.textContent = t.css;
        document.head.appendChild(s);
      }
    }
  }, [
    { id: "mm-capture-hygiene", css: effectHideCss() },
    { id: "mm-weather-settle", css: weatherSettleCss() },
    { id: "mm-scroll-park", css: scrollParkCss() },
  ]);
  // effects handled outside the particle table still have to be kept out
  // of the still (the Roku animates them natively)
  const { ids, classes } = effectHideSelectors();
  await frame.evaluate(
    (sel) => {
      sel.ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.opacity = "0";
      });
      sel.classes.forEach((cls) => {
        document.querySelectorAll("." + cls).forEach((el) => {
          el.style.opacity = "0";
        });
      });
    },
    { ids, classes },
  );
}

// sprites the portal draws as text or animated GIFs have to become plain
// PNGs the Roku can display; generated once and served alongside the
// page images (referenced by filename, resolved against assetBase)
async function generateEffectSprites(kinds, outDir) {
  const sharp = require("sharp");
  for (const kind of kinds) {
    if (kind === "snowflake") {
      const file = pathHandlers.join(outDir, "effect_snowflake.png");
      if (fsHandlers.existsSync(file)) continue;
      const spoke = (a) =>
        `<g transform="rotate(${a} 32 32)">` +
        '<line x1="32" y1="7" x2="32" y2="57" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>' +
        '<line x1="32" y1="14" x2="24" y2="22" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>' +
        '<line x1="32" y1="14" x2="40" y2="22" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>' +
        '<line x1="32" y1="50" x2="24" y2="42" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>' +
        '<line x1="32" y1="50" x2="40" y2="42" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>' +
        "</g>";
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
        [0, 60, 120].map(spoke).join("") +
        "</svg>";
      await sharp(Buffer.from(svg)).png().toFile(file);
      console.log("generated effect_snowflake.png");
    } else if (kind === "leaves") {
      for (let i = 1; i <= 6; i++) {
        const file = pathHandlers.join(outDir, "effect_leaf" + i + ".png");
        if (fsHandlers.existsSync(file)) continue;
        try {
          const resp = await fetch(S3_OVERLAY + "fall/leaf" + i + ".gif");
          if (!resp.ok) throw new Error("fetch " + resp.status);
          const buf = Buffer.from(await resp.arrayBuffer());
          await sharp(buf, { page: 0 }).png().toFile(file);
        } catch (e) {
          console.error("leaf sprite " + i + " failed:", e.message);
        }
      }
      console.log("generated leaf sprites");
    }
  }
}

// ---- interactive targets (remote-controlled task completion) -----------
// Chores/todo checkboxes are real inputs in the page, so the render can
// publish them as focusable targets: rect, current state, and the ids the
// completion API needs. The device draws them natively (the DOM ones are
// hidden) so a press can tick instantly, then PUTs to the same endpoint
// the portal uses. Display gesture flags decide what is offered at all.
async function generateCheckboxSprites(outDir) {
  const sharp = require("sharp");
  const files = { empty: "ui_check_empty.png", checked: "ui_check_on.png" };
  const box =
    '<rect x="3" y="3" width="58" height="58" rx="10" ry="10" fill="#FFFFFF" fill-opacity="0.92" stroke="#3C4043" stroke-width="4"/>';
  const svgs = {
    empty: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' + box + "</svg>",
    checked:
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">' +
      box +
      '<path d="M17 33 L28 45 L48 20" fill="none" stroke="#1B8A3A" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>",
  };
  for (const key of Object.keys(files)) {
    const file = pathHandlers.join(outDir, files[key]);
    if (fsHandlers.existsSync(file)) continue;
    await sharp(Buffer.from(svgs[key])).png().toFile(file);
  }
  return files;
}

async function extractTargets(frame, ctx) {
  const pageIdx = ctx && ctx.pageIdx !== undefined ? ctx.pageIdx : null;
  const found = await frame.evaluate((wantPage) => {
    let sc = null;
    let root = null;
    const roots = [document.querySelector("[ng-app]"), document.body, document.documentElement];
    for (const r of roots) {
      if (!r || !window.angular) continue;
      const inj = window.angular.element(r).injector();
      if (!inj) continue;
      root = inj.get("$rootScope");
      const walk = (s) => {
        if (!s || sc) return;
        if (s.groups && s.groups.length) {
          sc = s;
          return;
        }
        walk(s.$$childHead);
        walk(s.$$nextSibling);
      };
      walk(root);
      break;
    }
    const gesture = (sc && sc.gesture) || {};
    const items = [];
    document.querySelectorAll("input.todocheckbox").forEach((el) => {
      if (el.offsetParent === null || el.disabled) return;
      // designer mode keeps EVERY page in the DOM, hiding the inactive
      // ones with visibility - and unlike clocks/countdowns these inputs
      // carry no page number, so without this check we would publish
      // another page's checkboxes (visibility inherits, so this covers
      // any hidden ancestor too)
      if (getComputedStyle(el).visibility === "hidden") return;
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) return;
      // The to-do list scrolls inside its widget, so most of its rows are
      // laid out far below the visible box. They aren't in the screenshot
      // and can't be aimed at, so they must not become targets - clip to
      // every clipping ancestor, then to the canvas.
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflow === "visible" && cs.overflowX === "visible" && cs.overflowY === "visible") continue;
        const ar = a.getBoundingClientRect();
        if (cx < ar.left || cx > ar.right || cy < ar.top || cy > ar.bottom) return;
      }
      if (cx < 0 || cx > window.innerWidth || cy < 0 || cy > window.innerHeight) return;

      // Which task this row is bound to comes from the row's OWN binding,
      // never a scope lookup for `todo`: sub-task rows repeat over
      // `subTask`, so reading `todo` off the scope chain silently
      // resolves to their PARENT task (same id on four rows, and a tap
      // that completes the wrong thing).
      const s = window.angular.element(el).scope();
      const modelExpr = el.getAttribute("ng-model") || "";      // "todo.status" / "subTask.status"
      const itemExpr = modelExpr.replace(/\.status\s*$/, "");
      const clickExpr = el.getAttribute("ng-click") || "";
      const todo = itemExpr && s ? s.$eval(itemExpr) : null;
      if (!todo || todo.id === undefined || !clickExpr) return;

      // page index from the row's own scope, not just visibility
      let po = s;
      while (po && po.outerindex === undefined) po = po.$parent;
      const ownPage = po ? parseInt(po.outerindex, 10) : NaN;
      if (wantPage !== null && !isNaN(ownPage) && ownPage !== wantPage) return;

      // which widget owns it, and is completion allowed for that kind?
      let w = s;
      while (w && !w.widgetData) w = w.$parent;
      const wd = w && w.widgetData;
      const kind = wd && wd.contentType === "chores" ? "chores" : "todo";
      const allowed =
        kind === "chores" ? gesture.touch_chores_complete : gesture.touch_todo_complete;
      if (allowed !== true && allowed !== 1 && allowed !== "true") return;

      let labelId = null;
      if (kind === "chores") {
        let p = s;
        while (p && !(p.value && p.value.selectedLabel)) p = p.$parent;
        if (p && p.value.selectedLabel) labelId = p.value.selectedLabel.labelId;
      }
      items.push({
        kind,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        checked: el.checked === true,
        widgetSettingId: wd ? wd.widgetSettingId : null,
        payload: {
          id: todo.id,
          projectId: todo.projectId,
          taskId: todo.taskId,
          todoAccountId: todo.todoAccountId,
          labelId,
        },
      });
    });
    return { items, authToken: (root && root.authToken) || null };
  }, pageIdx);

  if (!found.items.length) return null;
  const sprites = await generateCheckboxSprites((ctx && ctx.outDir) || ".");
  return {
    items: found.items,
    authToken: found.authToken,
    statusUrl: (ctx && ctx.apiBase ? ctx.apiBase : "") + "todo/updateStatus",
    sprites,
  };
}

// Gesture regions: areas the pointer can sit over to send a swipe, as
// opposed to targets, which are controls the device redraws itself.
// Today that means the calendar's swipe surface (more dates up/down).
// Nothing is hidden for these - the widget is drawn normally, the region
// only tells the device where the gesture is live.
async function extractRegions(frame, ctx) {
  const pageIdx = ctx && ctx.pageIdx !== undefined ? ctx.pageIdx : null;
  const found = await frame.evaluate((wantPage) => {
    let sc = null;
    const roots = [document.querySelector("[ng-app]"), document.body, document.documentElement];
    for (const r of roots) {
      if (!r || !window.angular) continue;
      const inj = window.angular.element(r).injector();
      if (!inj) continue;
      const walk = (s) => {
        if (!s || sc) return;
        if (s.groups && s.groups.length) return void (sc = s);
        walk(s.$$childHead);
        walk(s.$$nextSibling);
      };
      walk(inj.get("$rootScope"));
      break;
    }
    const gesture = (sc && sc.gesture) || {};
    const on = (v) => v === true || v === 1 || v === "true" || v === "1";
    if (!on(gesture.touch_calendar_scroll)) return [];

    const items = [];
    document.querySelectorAll("[ng-swipe-up][ng-swipe-down]").forEach((el) => {
      if (el.offsetParent === null) return;
      if (getComputedStyle(el).visibility === "hidden") return; // another page
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) return;
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      if (cx < 0 || cx > window.innerWidth || cy < 0 || cy > window.innerHeight) return;
      const s = window.angular.element(el).scope();
      let w = s;
      while (w && !w.widgetData) w = w.$parent;
      const wd = w && w.widgetData;
      if (!wd || wd.widgetSettingId === undefined) return;
      // designer mode keeps EVERY page in the DOM and the visibility
      // check alone does not separate them here, so trust the widget's
      // own page index (outerindex, the same value the portal passes to
      // its handlers) exactly like the overlay extractors do
      let po = s;
      while (po && po.outerindex === undefined) po = po.$parent;
      const ownPage = po ? parseInt(po.outerindex, 10) : parseInt(el.getAttribute("outerIndex"), 10);
      if (wantPage !== null && !isNaN(ownPage) && ownPage !== wantPage) return;
      items.push({
        kind: "calendar",
        page: ownPage,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        // one page can hold several calendars, so the gesture has to name
        // which one it landed on
        id: String(wd.widgetSettingId),
      });
    });
    return items;
  }, pageIdx);
  return found && found.length ? found : null;
}

// the device draws these natively, so keep the DOM ones out of the still
async function hideTargets(frame, items) {
  await frame.evaluate((rects) => {
    document.querySelectorAll("input.todocheckbox").forEach((el) => {
      if (getComputedStyle(el).visibility === "hidden") return; // other page
      const r = el.getBoundingClientRect();
      // only hide the ones we actually published as targets
      const mine = rects.some((t) => Math.abs(t.x - r.x) < 2 && Math.abs(t.y - r.y) < 2);
      if (mine) el.style.opacity = "0";
    });
  }, items.map((i) => i.rect));
}

// Add future handlers here - one object each, and a matching entry in
// the Roku app's m.overlayRegistry.
module.exports = {
  extractEffects,
  hideEffects,
  effectHideSelectors,
  effectHideCss,
  weatherSettleCss,
  scrollParkCss,
  extractTargets,
  extractRegions,
  hideTargets,
  handlers: [
    cellScrollHandler,
    clockHandler,
    gifHandler,
    weatherIconHandler,
    // after weatherIconHandler: both film, and this one clears the icon
    // film's leftover styles before rolling its own
    cellWeatherHandler,
    slideshowHandler,
    countdownHandler,
    backgroundHandler,
  ],
};

/* test hook: the weather-motion decomposer, for the standalone check in
 * test/ and for poking at an icon without a display */
module.exports.__wx = { wxDecompose, wxMotionFeasible, wxMotionTiming };
