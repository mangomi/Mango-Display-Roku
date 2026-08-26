// Display-wide visual effects (snow, balloons, popups, movers, droppers,
// string-light strips): the manifest's `effects` array, drawn ABOVE the
// page slots so they keep flying through page transitions (MainScene's
// effectLayer). Rebuilt only when the effect set actually changes -
// otherwise every render would restart the balloons mid-flight.
//
// The tvOS players are ANALYTIC where Roku's are imperative: position,
// scale, opacity and frame index are pure functions of elapsed time,
// rendered into a Canvas each display frame via TimelineView(.animation).
// Same math, same config fields, no animation objects to leak or restart.

import SwiftUI

/// manifest effect type -> player (Roku MainScene.effectRegistry)
struct EffectItemView: View {
    let item: DisplayController.OverlayItem

    var body: some View {
        switch item.type {
        case "balloons", "snow", "leaves", "hearts":
            ParticleEffectView(cfg: item.raw, assetBase: item.assetBase)
        case "spritesheet":
            // an animated strip at a fixed rect (string lights) - the
            // same player as gif widget overlays, like Roku reusing
            // GifOverlay here
            GifOverlayView(cfg: item.raw, assetBase: item.assetBase)
        case "spritemover":
            SpriteMoverView(cfg: item.raw, assetBase: item.assetBase)
        case "popup":
            PopupEffectView(cfg: item.raw, assetBase: item.assetBase)
        case "dropper":
            DropperEffectView(cfg: item.raw, assetBase: item.assetBase)
        default:
            EmptyView()
        }
    }
}

enum EffectUtil {
    /// generated sprites arrive as bare filenames resolved against the
    /// asset base; everything else is an absolute URL (Roku resolveAsset)
    static func assetURL(_ name: String, assetBase: String) -> URL? {
        if name.lowercased().hasPrefix("http") { return URL(string: name) }
        return URL(string: assetBase + name)
    }

    /// All remote files an effect list references - the cache prune set
    /// must keep these alive alongside page images and widget strips.
    static func assetStrings(of effects: [[String: Any]], assetBase: String) -> [String] {
        var out: [String] = []
        func add(_ name: Any?) {
            if let s = name as? String, !s.isEmpty, let u = assetURL(s, assetBase: assetBase) {
                out.append(u.absoluteString)
            }
        }
        for e in effects {
            add(e["stripFile"]); add(e["stripFileFlipped"])
            if let comp = JSON.obj(e["companion"]) { add(comp["stripFile"]); add(comp["stripFileFlipped"]) }
            for spr in JSON.arr(e["sprites"]) ?? [] {
                if let d = JSON.obj(spr) { add(d["url"]); add(d["stripFile"]) } else { add(spr) }
            }
        }
        return out
    }

    /// "0xRRGGBBAA" (the Roku hex the service emits for threadColor)
    static func rokuHexColor(_ s: String) -> Color? {
        var hex = s
        if hex.hasPrefix("0x") || hex.hasPrefix("0X") { hex.removeFirst(2) }
        guard hex.count == 8, let v = UInt64(hex, radix: 16) else { return nil }
        return Color(.sRGB,
                     red: Double((v >> 24) & 0xFF) / 255,
                     green: Double((v >> 16) & 0xFF) / 255,
                     blue: Double((v >> 8) & 0xFF) / 255,
                     opacity: Double(v & 0xFF) / 255)
    }

    static func outQuad(_ f: Double) -> Double { 1 - (1 - f) * (1 - f) }
    static func inQuad(_ f: Double) -> Double { f * f }

    /// linear interpolation over keyframes, Roku interpolator style
    static func piecewise(_ f: Double, keys: [Double], values: [Double]) -> Double {
        guard let first = values.first, let last = values.last else { return 0 }
        if f <= keys[0] { return first }
        for i in 1..<keys.count where f <= keys[i] {
            let span = keys[i] - keys[i - 1]
            let local = span > 0 ? (f - keys[i - 1]) / span : 1
            return values[i - 1] + (values[i] - values[i - 1]) * local
        }
        return last
    }

    /// Draw one frame of a cols x rows sprite sheet with its top-left at
    /// `origin`, in the context's current transform.
    static func drawSheetFrame(_ ctx: GraphicsContext, sheet: GraphicsContext.ResolvedImage,
                               frame: Int, cols: Int, rows: Int,
                               frameW: Double, frameH: Double, at origin: CGPoint) {
        var c = ctx
        c.clip(to: Path(CGRect(x: origin.x, y: origin.y, width: frameW, height: frameH)))
        let col = frame % max(1, cols)
        let row = frame / max(1, cols)
        c.draw(sheet, in: CGRect(x: origin.x - Double(col) * frameW,
                                 y: origin.y - Double(row) * frameH,
                                 width: Double(cols) * frameW,
                                 height: Double(rows) * frameH))
    }

    /// wall-clock frame index: every player of the same sheet stays in
    /// step and view rebuilds never reset the animation
    static func frameIndex(at date: Date, frameMs: Double, frameCount: Int, minMs: Double = 40) -> Int {
        guard frameCount > 1 else { return 0 }
        let period = max(frameMs, minMs) / 1000
        return Int(date.timeIntervalSinceReferenceDate / period) % frameCount
    }
}
