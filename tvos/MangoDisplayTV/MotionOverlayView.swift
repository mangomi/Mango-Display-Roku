// Natively animated weather icon. Port of MotionOverlay.brs: the icon's
// SVG moves its parts with a few primitives - rotate about a point,
// translate, scale, fade - and the render service ships each moving part
// ONCE as a transparent PNG (the whole box) together with exactly that
// motion as keyframe tracks. This view reproduces it every display frame
// in a Canvas: no filmed sheet, no frame cadence at all.
//
// Tracks: { prop, cycleMs, delayMs, keys[0..1], values, center }. Values
// interpolate linearly between keys, hold the last value to the end of
// the cycle, repeat forever, and wait delayMs before the first loop
// (holding the layer's initial state - a delayed raindrop waits
// invisible at its declared `opacity`). `chain` lists outer motions
// applied on top of the layer's own, outermost first: one nested
// transform per level. The box clips, as the portal's does (a drop's
// travel starts above the strip). Rotation values are degrees CLOCKWISE
// as the viewer sees it - which is SwiftUI's own sign in a y-down
// canvas, so no flip (Roku negates for SceneGraph's CCW-positive).

import SwiftUI

struct MotionOverlayView: View {
    let cfg: [String: Any]
    let assetBase: String

    private struct Track {
        let prop: String
        let cycle: TimeInterval
        let delay: TimeInterval
        let keys: [Double]
        let values: [Any]
        let center: CGPoint?
    }

    private struct Layer {
        let file: String
        let opacity: Double
        let tracks: [Track]
        let chain: [[Track]]   // outermost first
    }

    @State private var images: [UIImage?] = []
    @State private var epoch = Date()

    var body: some View {
        if let r = JSON.obj(cfg["rect"]),
           let x = JSON.double(r["x"]), let y = JSON.double(r["y"]),
           let w = JSON.double(r["w"]), let h = JSON.double(r["h"]) {
            let layers = Self.parseLayers(cfg)
            TimelineView(.animation) { tl in
                Canvas { ctx, _ in
                    let t = tl.date.timeIntervalSince(epoch)
                    var base = ctx
                    base.clip(to: Path(CGRect(x: 0, y: 0, width: w, height: h)))
                    for (i, layer) in layers.enumerated() {
                        guard i < images.count, let ui = images[i] else { continue }
                        var c = base
                        var opacity = layer.opacity
                        // outer chain levels first, each wrapping the next
                        for level in layer.chain {
                            opacity *= Self.apply(level, to: &c, at: t)
                        }
                        opacity *= Self.apply(layer.tracks, to: &c, at: t)
                        c.opacity = max(0, min(1, opacity))
                        c.draw(ctx.resolve(Image(uiImage: ui)), in: CGRect(x: 0, y: 0, width: w, height: h))
                    }
                }
            }
            .frame(width: w, height: h)
            .position(x: x + w / 2, y: y + h / 2)
            .allowsHitTesting(false)
            .task(id: JSON.str(cfg["widgetSettingId"]) + "_" + (layers.first?.file ?? "")) {
                epoch = Date()
                var loaded: [UIImage?] = []
                for layer in layers {
                    if let url = URL(string: assetBase + layer.file) {
                        loaded.append(await ImageCache.shared.image(at: url, timeout: 12))
                    } else {
                        loaded.append(nil)
                    }
                }
                images = loaded
            }
        }
    }

    /// Apply one group's tracks to the context (translation, then
    /// rotation about center, then scale about center - the SceneGraph
    /// node order) and return the group's opacity factor.
    private static func apply(_ tracks: [Track], to c: inout GraphicsContext, at t: TimeInterval) -> Double {
        var opacity = 1.0
        var translation = CGPoint.zero
        var rotation = 0.0
        var rotCenter = CGPoint.zero
        var scale = CGPoint(x: 1, y: 1)
        var scaleCenter = CGPoint.zero
        for tr in tracks {
            let phase = t - tr.delay
            switch tr.prop {
            case "rotation":
                if phase >= 0 { rotation = sample1(tr, phase) }
                rotCenter = tr.center ?? .zero
            case "translation":
                if phase >= 0 { translation = sample2(tr, phase) }
            case "scale":
                if phase >= 0 { scale = sample2(tr, phase) }
                scaleCenter = tr.center ?? .zero
            case "opacity":
                if phase >= 0 { opacity = sample1(tr, phase) }
            default:
                break
            }
        }
        c.translateBy(x: translation.x, y: translation.y)
        if rotation != 0 {
            c.translateBy(x: rotCenter.x, y: rotCenter.y)
            c.rotate(by: .degrees(rotation))
            c.translateBy(x: -rotCenter.x, y: -rotCenter.y)
        }
        if scale.x != 1 || scale.y != 1 {
            c.translateBy(x: scaleCenter.x, y: scaleCenter.y)
            c.scaleBy(x: scale.x, y: scale.y)
            c.translateBy(x: -scaleCenter.x, y: -scaleCenter.y)
        }
        return opacity
    }

    /// position within the cycle: 0..1, repeating; the last value holds
    /// through any gap after the final key
    private static func cyclePos(_ tr: Track, _ phase: TimeInterval) -> Double {
        guard tr.cycle > 0 else { return 1 }
        let f = phase / tr.cycle
        return f - floor(f)
    }

    private static func sample1(_ tr: Track, _ phase: TimeInterval) -> Double {
        let vals = tr.values.compactMap { JSON.double($0) }
        guard vals.count == tr.keys.count, !vals.isEmpty else { return 0 }
        return EffectUtil.piecewise(cyclePos(tr, phase), keys: tr.keys, values: vals)
    }

    private static func sample2(_ tr: Track, _ phase: TimeInterval) -> CGPoint {
        let pairs: [(Double, Double)] = tr.values.compactMap { v in
            guard let a = JSON.arr(v), a.count >= 2, let x = JSON.double(a[0]), let y = JSON.double(a[1]) else { return nil }
            return (x, y)
        }
        guard pairs.count == tr.keys.count, !pairs.isEmpty else { return .zero }
        let f = cyclePos(tr, phase)
        return CGPoint(x: EffectUtil.piecewise(f, keys: tr.keys, values: pairs.map { $0.0 }),
                       y: EffectUtil.piecewise(f, keys: tr.keys, values: pairs.map { $0.1 }))
    }

    private static func parseTracks(_ any: Any?) -> [Track] {
        (JSON.arr(any) ?? []).compactMap { t in
            guard let d = JSON.obj(t), let prop = d["prop"] as? String,
                  let keys = JSON.arr(d["keys"])?.compactMap({ JSON.double($0) }), !keys.isEmpty,
                  let values = JSON.arr(d["values"]), values.count == keys.count else { return nil }
            var center: CGPoint?
            if let c = JSON.arr(d["center"]), c.count >= 2, let cx = JSON.double(c[0]), let cy = JSON.double(c[1]) {
                center = CGPoint(x: cx, y: cy)
            }
            return Track(prop: prop,
                         cycle: (JSON.double(d["cycleMs"]) ?? 0) / 1000,
                         delay: (JSON.double(d["delayMs"]) ?? 0) / 1000,
                         keys: keys, values: values, center: center)
        }
    }

    private static func parseLayers(_ cfg: [String: Any]) -> [Layer] {
        (JSON.arr(cfg["layers"]) ?? []).compactMap { l in
            guard let d = JSON.obj(l), let file = d["file"] as? String, !file.isEmpty else { return nil }
            let chain = (JSON.arr(d["chain"]) ?? []).map { parseTracks(JSON.obj($0)?["tracks"]) }
            return Layer(file: file,
                         opacity: JSON.double(d["opacity"]) ?? 1,
                         tracks: parseTracks(d["tracks"]),
                         chain: chain)
        }
    }
}
