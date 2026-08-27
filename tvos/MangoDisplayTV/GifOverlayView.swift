// Animated GIF/sticker widget: the render service decodes the GIF into an
// alpha-preserving sprite sheet (cols x rows grid, capped at 2048px per
// side for Roku's GPU); this view shows one frame through a clipped window
// and steps the sheet on a fixed cadence. Port of GifOverlay.brs.
//
// The manifest also carries `source` (the original GIF URL) for clients
// that can decode GIFs natively - tvOS could, but the sheet player is
// needed for the effects pipeline regardless (all effect art is
// sheet-only), so v1 uses one code path for both. Revisit only if sheet
// quality/cadence ever visibly lags a native decode.
//
// Frame index derives from the wall clock, not an accumulating timer, so
// every sheet at the same frameMs stays in step and a SwiftUI rebuild
// (page turn, imageOnly refresh) never restarts the animation - the tvOS
// equivalent of the Roku scar where rebuilt overlays froze on frame 0.

import SwiftUI

struct GifOverlayView: View {
    let cfg: [String: Any]
    let assetBase: String

    @State private var sheet: UIImage?

    var body: some View {
        if let rect = JSON.obj(cfg["rect"]),
           let x = JSON.double(rect["x"]), let y = JSON.double(rect["y"]),
           let stripFile = cfg["stripFile"] as? String, !stripFile.isEmpty {
            let frameW = JSON.double(cfg["frameW"]) ?? (JSON.double(rect["w"]) ?? 0)
            let frameH = JSON.double(cfg["frameH"]) ?? (JSON.double(rect["h"]) ?? 0)
            let frameCount = max(1, JSON.int(cfg["frameCount"]) ?? 1)
            let cols = max(1, JSON.int(cfg["cols"]) ?? 1)
            let rows = max(1, JSON.int(cfg["rows"]) ?? ((frameCount + cols - 1) / cols))
            Group {
                if let sheet {
                    SpriteSheetView(sheet: sheet, cols: cols, rows: rows, frameCount: frameCount,
                                    frameW: frameW, frameH: frameH,
                                    frameMs: JSON.double(cfg["frameMs"]) ?? 100)
                } else {
                    Color.clear
                }
            }
            .frame(width: frameW, height: frameH, alignment: .topLeading)
            .clipped()
            .position(x: x + frameW / 2, y: y + frameH / 2)
            .task {
                if sheet == nil, let url = URL(string: assetBase + stripFile) {
                    sheet = await ImageCache.shared.image(at: url, timeout: 12)
                    if sheet == nil { NSLog("[Mango] gif strip failed: %@", url.absoluteString) }
                }
            }
        }
    }
}

/// The shared sheet-player primitive (one frame of a cols x rows grid,
/// stepped on a fixed cadence). The effects players reuse this.
struct SpriteSheetView: View {
    let sheet: UIImage
    let cols: Int
    let rows: Int
    let frameCount: Int
    let frameW: Double
    let frameH: Double
    let frameMs: Double

    var body: some View {
        // ~30fps cap, same clamp as the Roku player
        let period = max(frameMs, 33) / 1000
        // Sample by the sheet's REAL packed grid, not the manifest's
        // frameW: the service composites frames at integer pixel
        // positions (it films at the ROUNDED element size), while
        // frameW is the fractional on-screen width. Stepping by the
        // fractional value drifted the sample window ~0.16px per frame
        // and snapped back ~1.7px at every row wrap - a horizontal
        // sawtooth that read as jerky motion on the cell-weather icons
        // (sheet 1956px wide, 12 cols: 163.0 packed vs 162.84 declared).
        // Drawing at native sheet size also skips a 0.999x resample
        // that softened every frame.
        let strideX = (sheet.size.width / CGFloat(max(1, cols))).rounded()
        let strideY = (sheet.size.height / CGFloat(max(1, rows))).rounded()
        TimelineView(.periodic(from: .now, by: period)) { ctx in
            let idx = frameCount > 1 ? Int(ctx.date.timeIntervalSinceReferenceDate / period) % frameCount : 0
            let col = idx % cols
            let row = idx / cols
            Image(uiImage: sheet)
                .resizable()
                .frame(width: sheet.size.width, height: sheet.size.height)
                .offset(x: -CGFloat(col) * strideX, y: -CGFloat(row) * strideY)
        }
    }
}
