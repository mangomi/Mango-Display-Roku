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
function deriveTzOffsetMinutes(sample) {
  const sampleMin = sampleToMinutes(sample);
  if (sampleMin == null) return null;
  const now = new Date();
  let diff = sampleMin - (now.getUTCHours() * 60 + now.getUTCMinutes());
  while (diff > 840) diff -= 1440; // real offsets span -12h..+14h
  while (diff < -780) diff += 1440;
  return Math.round(diff / 15) * 15;
}

const clockHandler = {
  type: "clock",

  async extract(frame) {
    const raw = await frame.evaluate(() => {
      const out = [];
      // one #clock_<widgetSettingId>_<page> container per clock instance
      document.querySelectorAll('[id^="clock_"]').forEach((container) => {
        const m = container.id.match(/^clock_(\d+)_(\d+)$/);
        if (!m) return;
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
        if (c.time) {
          const sample = c.time.text;
          const is24h = !/am|pm/i.test(sample);
          elements.time = {
            rect: c.time.rect,
            textRect: c.time.textRect,
            fontSizePx: c.time.fontSizePx,
            bold: parseInt(c.time.fontWeight, 10) >= 600,
            align: c.time.align,
            color: cssColorToHex(c.time.color),
            is24h,
            // reproduce the sample's shape: zero-padded hour? AM/PM casing?
            padHour: is24h ? /^\d\d:/.test(sample) : /^0\d:/.test(sample),
            upperMeridiem: /AM|PM/.test(sample),
            sample,
          };
        }
        if (c.date) {
          // only go native when it's the English "Friday, July 31" pattern;
          // localized dates stay in the image (graceful degradation)
          const nativeable = /^[A-Za-z]+, [A-Za-z]+ \d{1,2}$/.test(c.date.text);
          if (nativeable) {
            elements.date = {
              rect: c.date.rect,
              textRect: c.date.textRect,
              fontSizePx: c.date.fontSizePx,
              bold: parseInt(c.date.fontWeight, 10) >= 600,
              align: c.date.align,
              color: cssColorToHex(c.date.color),
              sample: c.date.text,
            };
          }
        }
        return {
          type: "clock",
          widgetSettingId: c.widgetSettingId,
          page: c.page,
          tzOffsetMinutes: c.time ? deriveTzOffsetMinutes(c.time.text) : null,
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

  // after extract/hide: fetch each GIF, decode, and write a vertical PNG
  // film strip (frames stacked) sized exactly to the on-screen rect
  async process(overlays, ctx) {
    const sharp = require("sharp");
    for (const o of overlays) {
      try {
        const frameW = Math.max(1, Math.round(o.rect.w));
        const frameH = Math.max(1, Math.round(o.rect.h));
        const cacheKey = crypto
          .createHash("md5")
          .update(o.src + "|" + frameW + "x" + frameH)
          .digest("hex");
        const fileName = "overlay_gif_" + cacheKey + ".png";
        const filePath = pathHandlers.join(ctx.outDir, fileName);

        if (!fsHandlers.existsSync(filePath)) {
          const resp = await fetch(o.src);
          if (!resp.ok) throw new Error("fetch " + resp.status);
          const buf = Buffer.from(await resp.arrayBuffer());
          const meta = await sharp(buf, { animated: true }).metadata();
          const total = meta.pages || 1;
          if (total < 2) {
            // not animated - leave it in the image (undo nothing; the
            // overlay entry is dropped below)
            o.skip = true;
            continue;
          }
          // frame budget: subsample long GIFs, respect texture ceiling
          let maxFrames = Math.min(GIF_MAX_FRAMES, Math.floor(GIF_MAX_STRIP_PIXELS / (frameW * frameH)));
          if (maxFrames < 2) maxFrames = 2;
          const step = Math.max(1, Math.ceil(total / maxFrames));
          const indices = [];
          for (let i = 0; i < total; i += step) indices.push(i);

          const delays = Array.isArray(meta.delay) ? meta.delay : [];
          const avgDelay =
            delays.length > 0
              ? delays.reduce((a, b) => a + (b > 0 ? b : 80), 0) / delays.length
              : 80;

          const frames = [];
          for (const idx of indices) {
            frames.push(
              await sharp(buf, { page: idx })
                .resize(frameW, frameH, { fit: "fill" })
                .png()
                .toBuffer(),
            );
          }
          const strip = sharp({
            create: {
              width: frameW,
              height: frameH * frames.length,
              channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
          }).composite(frames.map((f, i) => ({ input: f, top: i * frameH, left: 0 })));
          await strip.png().toFile(filePath);
          o.frameMs = Math.round(avgDelay * step);
          o.frameCount = frames.length;
        } else {
          // cached strip: recover frame count from the file dimensions
          const meta = await sharp(filePath).metadata();
          o.frameCount = Math.max(1, Math.round(meta.height / frameH));
          o.frameMs = o.frameMs || 80;
        }
        o.stripFile = fileName;
        o.frameW = frameW;
        o.frameH = frameH;
        delete o.src;
      } catch (e) {
        console.error("gif strip failed (" + (o.src || "").slice(0, 80) + "):", e.message);
        o.skip = true;
      }
    }
    return overlays.filter((o) => !o.skip);
  },
};

// Add future handlers here (countdown, photos, video) - one object each,
// and a matching entry in the Roku app's m.overlayRegistry.
module.exports = { handlers: [clockHandler, gifHandler] };
