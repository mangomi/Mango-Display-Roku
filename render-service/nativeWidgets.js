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
    const wxKey = (o) => {
      const w = Math.round(o.rect.w * ctx.outScale);
      const h = Math.round(o.rect.h * ctx.outScale);
      return crypto
        .createHash("md5")
        .update([o.src, w, h, o.period || 0].join("|"))
        .digest("hex")
        .slice(0, 16);
    };
    const cachedFor = (o) => {
      const key = wxKey(o);
      const sheet = pathHandlers.join(ctx.outDir, "overlay_wxc_" + key + ".png");
      const meta = sheet.replace(/\.png$/, ".json");
      if (!fsHandlers.existsSync(sheet) || !fsHandlers.existsSync(meta)) return null;
      try {
        return { key, file: "overlay_wxc_" + key + ".png", ...JSON.parse(fsHandlers.readFileSync(meta, "utf8")) };
      } catch (e) {
        return null;
      }
    };

    const hits = live.map(cachedFor);
    if (hits.every(Boolean)) {
      live.forEach((o, i) => {
        const c = hits[i];
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

    // film long enough to cover the longest icon cycle, sampling finely
    // enough that the shortest cycle still gets ~12 frames
    const periods = live.map((o) => o.period || WX_DEFAULT_WINDOW_S);
    const windowS = Math.min(WX_PERIOD_CAP_S, Math.max(...periods));
    const targetDt = Math.min(0.2, Math.max(0.08, Math.min(...periods) / 12));

    const shots = [];
    const stamps = [];
    const t0 = Date.now();
    // always alpha: the page is stripped to icons-only for filming, in
    // both layered and normal pages
    const shotOpts = { type: "png", omitBackground: true };
    while (Date.now() - t0 < windowS * 1000 && shots.length < WX_MAX_SHOTS) {
      stamps.push(Date.now() - t0);
      shots.push(await page.screenshot(shotOpts));
      await page.waitForTimeout(targetDt * 1000);
    }
    const realGapMs =
      shots.length > 1 ? (stamps[stamps.length - 1] - stamps[0]) / (shots.length - 1) : 200;

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
        // keyed by icon + size so the next render reuses it instead of
        // spending another animation cycle filming the same sun
        const fileName = "overlay_wxc_" + wxKey(o) + ".png";
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

// ---- photo slideshow (image widget) ------------------------------------
// The portal resolves every source (Unsplash/Google Photos/iCloud/S3)
// into $scope.imageWidgetList[n].images - a plain URL array. The overlay
// just carries that list + interval; the Roku crossfades through it
// natively. The currently-baked photo stays in the image as fallback.
// Single-image widgets stay baked (no overlay needed).
const slideshowHandler = {
  type: "slideshow",

  async extract(frame) {
    const raw = await frame.evaluate(() => {
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
              images: (d.images || []).slice(0, 60),
              intervalSeconds: parseInt(iws.imageDelayTime, 10) || 60,
              cropToFill: iws.isCropToFill === true,
              transition: iws.transition || "fade",
            });
          });
        } catch (e) {}
      });
      return out;
    });
    return raw.filter((o) => o.images && o.images.length > 1);
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
    return await frame.evaluate(() => {
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
          images: images.slice(0, 60),
          intervalSeconds: parseInt(obj.imageDelayTime, 10) || 60,
          cropToFill: obj.isCropToFill !== false,
          transition: obj.transition || "fade",
          brightness,
          pageColor,
        },
      ];
    });
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
async function hideEffects(frame) {
  // effects handled outside the particle table still have to be kept out
  // of the still (the Roku animates them natively)
  const ids = Object.values(EFFECTS)
    .flatMap((e) => e.domIds || [])
    .concat(["santa", "elf", "scaryelf", "witch", "bat", "spider", "spider3"]);
  const classes = Object.values(EFFECTS)
    .flatMap((e) => e.domClasses || [])
    // "spider" class = the dropping spiders, "web-line" = their threads
    .concat(["stringlight", "elf", "spider", "web-line"]);
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
  extractTargets,
  extractRegions,
  hideTargets,
  handlers: [
    clockHandler,
    gifHandler,
    weatherIconHandler,
    slideshowHandler,
    countdownHandler,
    backgroundHandler,
  ],
};
