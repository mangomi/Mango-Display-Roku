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
const WX_MAX_SHOTS = 100;

// pull animation timing out of the SVG source: SMIL dur="9s" attributes
// and CSS animation/animation-duration declarations. Longest one wins -
// filming exactly one full cycle makes the loop wrap seamless (the sun
// finishes its rotation instead of snapping back).
function parseAnimationPeriodSeconds(svgText) {
  const times = [];
  for (const m of svgText.matchAll(/dur="([\d.]+)\s*(ms|s)"/g)) {
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
  async process(overlays) {
    const bySrc = {};
    for (const o of overlays) {
      if (!(o.src in bySrc)) {
        if (/\.(gif|webp)(\?|$)/i.test(o.src)) {
          bySrc[o.src] = { animated: true, period: null };
        } else {
          try {
            const t = await (await fetch(o.src)).text();
            const animated = /<animate|animateTransform|animateMotion|@keyframes|animation\s*:/i.test(t);
            const period = animated ? parseAnimationPeriodSeconds(t) : null;
            bySrc[o.src] = { animated, period };
            if (animated) {
              console.log(
                "wx icon:",
                o.src.split("/").pop().slice(0, 40),
                "period:",
                period ? period + "s" : "unknown",
              );
            }
          } catch (e) {
            bySrc[o.src] = { animated: false, period: null };
          }
        }
      }
      if (!bySrc[o.src].animated) {
        o.skip = true;
      } else {
        const p = bySrc[o.src].period;
        o.period = p ? Math.min(Math.max(p, 1), WX_PERIOD_CAP_S) : null;
      }
    }
    return overlays.filter((o) => !o.skip);
  },

  // nothing hidden: the frozen icon stays in the image as the fallback
  async hide() {},

  async captureAfter(page, frame, items, ctx) {
    const live = items.filter((i) => i.liveCapture);
    if (!live.length) return items;
    const sharp = require("sharp");
    await ctx.reenableAnimations();

    // film long enough to cover the longest icon cycle, sampling finely
    // enough that the shortest cycle still gets ~12 frames
    const periods = live.map((o) => o.period || WX_DEFAULT_WINDOW_S);
    const windowS = Math.min(WX_PERIOD_CAP_S, Math.max(...periods));
    const targetDt = Math.min(0.2, Math.max(0.08, Math.min(...periods) / 12));

    const shots = [];
    const stamps = [];
    const t0 = Date.now();
    while (Date.now() - t0 < windowS * 1000 && shots.length < WX_MAX_SHOTS) {
      stamps.push(Date.now() - t0);
      shots.push(await page.screenshot({ type: "png" }));
      await page.waitForTimeout(targetDt * 1000);
    }
    const realGapMs =
      shots.length > 1 ? (stamps[stamps.length - 1] - stamps[0]) / (shots.length - 1) : 200;

    // stale capture sheets from previous renders (keep ~10 min for the
    // manifest still live on devices)
    for (const f of fsHandlers.readdirSync(ctx.outDir)) {
      if (!f.startsWith("overlay_wx_")) continue;
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
        const fileName = "overlay_wx_" + o.widgetSettingId + "_" + Date.now() + ".png";
        await sharp({
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
          .toFile(pathHandlers.join(ctx.outDir, fileName));

        o.stripFile = fileName;
        o.frameW = o.rect.w;
        o.frameH = o.rect.h;
        o.frameCount = frames.length;
        o.cols = cols;
        o.rows = rows;
        o.frameMs = Math.max(60, Math.round(realGapMs * stride));
        console.log(
          "wx sheet:",
          o.widgetSettingId,
          (o.src || "").split("/").pop().slice(0, 30),
          frames.length + "f @" + o.frameMs + "ms, cycle " + Math.round(periodMs / 100) / 10 + "s",
        );
        delete o.liveCapture;
        delete o.period;
        delete o.src;
      } catch (e) {
        console.error("weather icon capture failed:", e.message);
        o.skip = true;
      }
    }
    return items.filter((o) => !o.skip);
  },
};

// Add future handlers here (countdown, photos, video) - one object each,
// and a matching entry in the Roku app's m.overlayRegistry.
module.exports = { handlers: [clockHandler, gifHandler, weatherIconHandler] };
