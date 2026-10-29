// `gif` overlay: animated GIFs and stickers, and the weather icons (and
// rotating icon layers, MANIFEST.md `motion`) the service films. Port of
// GifOverlay.brs / GifOverlayView.swift: the render service decodes the
// animation into a cols x rows sprite sheet; the device shows ONE frame
// of it through a clipped window at `rect` and steps the sheet.
//
// The manifest also carries `source` (the original GIF/SVG) for clients
// that can decode it. Not this one: Amazon says not to rely on animated
// GIFs in an APL Image, so the sheet is the only path, as on the Roku.
//
// It all runs on the Echo, like the clock. The window holds the frame
// number (mmGifFrame); a tick handler sets it from the document's
// elapsedTime at the sheet's cadence, and the sheet's transform is a
// binding on it, so one handler per GIF does the whole animation - no
// command per frame. The frame is derived from the clock, not counted up
// (tvOS's lesson): every sheet at the same frameMs stays in step, and a
// tick the device runs late does not slow the animation down. Tick
// handlers run in fast mode, which is fine: SetValue is all they do.
//
// The sheet is stretched to cols x frameW by rows x frameH, the contract
// (MANIFEST.md "Animated overlays"; GifOverlay.brs sizes its strip
// exactly so): big stickers are filmed at a reduced texture size and the
// client scales them back up. tvOS's 1:1 native-grid draw (which avoids a
// 0.999x resample) has no APL equivalent - the Echo scales canvas px to
// dp anyway.

const MIN_FRAME_MS = 33; // ~30fps cap, as on the Roku and tvOS
const DEFAULT_FRAME_MS = 100;

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const count = (v, d) => Math.max(1, Math.floor(num(v, d)));
const r2 = (v) => Math.round(v * 100) / 100; // dp, as written into expressions

/** APL components for one `gif` overlay. */
function build(cfg, ctx) {
  const rect = cfg && cfg.rect;
  if (!rect || typeof cfg.stripFile !== "string" || !cfg.stripFile) return [];
  const { place } = ctx;
  // frameW/H: the on-screen frame size in canvas px (tvOS falls back to
  // the rect for sheets that omit them)
  const fw = r2(place.len(num(cfg.frameW, rect.w)));
  const fh = r2(place.len(num(cfg.frameH, rect.h)));
  const frameCount = count(cfg.frameCount, 1);
  const cols = count(cfg.cols, 1);
  const rows = count(cfg.rows, Math.ceil(frameCount / cols));
  const ms = Math.max(MIN_FRAME_MS, Math.round(num(cfg.frameMs, DEFAULT_FRAME_MS)));
  const at = place.rect({ x: rect.x, y: rect.y, w: 0, h: 0 });

  const sheet = {
    type: "Image",
    position: "absolute", left: 0, top: 0, width: cols * fw, height: rows * fh,
    source: ctx.assetBase + cfg.stripFile,
    scale: "fill",
  };
  // The window is one frame big and clips the sheet to it - the Roku's
  // clippingRect. APL has no clip property: a parent clipping its
  // children is the renderer's behaviour (Android's default), not a
  // documented promise. Hardware check.
  const win = {
    type: "Container",
    id: "mm" + ctx.idPrefix + "Gif",
    position: "absolute", left: at.x, top: at.y, width: fw, height: fh,
    items: [sheet],
  };
  if (frameCount > 1) {
    win.bind = [{ name: "mmGifFrame", value: 0 }];
    // one transform shape for every sheet: a single-column sheet just
    // never moves sideways
    sheet.transform = [
      { translateX: "${-(mmGifFrame % " + cols + ") * " + fw + "}" },
      { translateY: "${-Math.floor(mmGifFrame / " + cols + ") * " + fh + "}" },
    ];
    win.handleTick = [{
      minimumDelay: ms,
      commands: [{ type: "SetValue", property: "mmGifFrame", value: "${Math.floor(elapsedTime / " + ms + ") % " + frameCount + "}" }],
    }];
  }
  return [win];
}

module.exports = { build, MIN_FRAME_MS };
