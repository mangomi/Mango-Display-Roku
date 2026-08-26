// Pop-up characters (Disappearing Elf, Scary pop-ups, and the bundled
// firework / bursting-hearts burst sheets): one sprite from the pool
// appears at a random spot, plays for its dwell, pops out and returns
// somewhere else as a different character. Port of PopupEffect.brs -
// pop-in is the portal's scale 0 -> 1.5 -> 0.8 -> 1 with a half-turn
// (outQuad over popMs), pop-out is 0.4s inQuad to zero, dwell is random
// in dwellMsRange and never repeats the same sprite twice in a row.

import SwiftUI

struct PopupEffectView: View {
    let cfg: [String: Any]
    let assetBase: String

    private enum Phase { case popIn, dwell, popOut }
    private struct Current {
        var sheet: UIImage
        var meta: [String: Any]
        var pos: CGPoint
        var phase: Phase
        var phaseStart: Date
        var popDuration: Double
    }

    @State private var current: Current?
    @State private var lastIndex = -1

    var body: some View {
        TimelineView(.animation) { tl in
            Canvas { ctx, _ in
                guard let cur = current else { return }
                let frameW = JSON.double(cur.meta["frameW"]) ?? 0
                let frameH = JSON.double(cur.meta["frameH"]) ?? 0
                let frameCount = max(1, JSON.int(cur.meta["frameCount"]) ?? 1)
                let cols = max(1, JSON.int(cur.meta["cols"]) ?? 1)
                let rows = max(1, JSON.int(cur.meta["rows"]) ?? ((frameCount + cols - 1) / cols))
                let e = tl.date.timeIntervalSince(cur.phaseStart)
                var scale = 1.0
                var rotation = 0.0
                switch cur.phase {
                case .popIn:
                    let f = EffectUtil.outQuad(min(1, e / cur.popDuration))
                    scale = EffectUtil.piecewise(f, keys: [0, 0.5, 0.75, 1], values: [0, 1.5, 0.8, 1])
                    rotation = -Double.pi * (1 - f)
                case .dwell:
                    break
                case .popOut:
                    scale = 1 - EffectUtil.inQuad(min(1, e / 0.4))
                }
                guard scale > 0.001 else { return }
                var c = ctx
                c.translateBy(x: cur.pos.x + frameW / 2, y: cur.pos.y + frameH / 2)
                c.rotate(by: .radians(rotation))
                c.scaleBy(x: scale, y: scale)
                c.translateBy(x: -frameW / 2, y: -frameH / 2)
                let frame = EffectUtil.frameIndex(
                    at: tl.date, frameMs: JSON.double(cur.meta["frameMs"]) ?? 90, frameCount: frameCount)
                EffectUtil.drawSheetFrame(c, sheet: c.resolve(Image(uiImage: cur.sheet)),
                                          frame: frame, cols: cols, rows: rows,
                                          frameW: frameW, frameH: frameH, at: .zero)
            }
        }
        .allowsHitTesting(false)
        .task(id: JSON.str(cfg["popMs"]) + "_" + JSON.str(cfg["dwellMsRange"])) { await run() }
    }

    private func run() async {
        let sprites = (JSON.arr(cfg["sprites"]) ?? []).compactMap { JSON.obj($0) }
        guard !sprites.isEmpty else { return }
        let popMs = JSON.double(cfg["popMs"]) ?? 500
        var dwellLo = 4000.0
        var dwellHi = 6000.0
        if let r = JSON.arr(cfg["dwellMsRange"]), r.count == 2,
           let a = JSON.double(r[0]), let b = JSON.double(r[1]) {
            dwellLo = min(a, b); dwellHi = max(a, b)
        }
        while !Task.isCancelled {
            // avoid repeating the same character twice in a row
            var idx = Int.random(in: 0..<sprites.count)
            if sprites.count > 1 {
                var tries = 0
                while idx == lastIndex && tries < 6 { idx = Int.random(in: 0..<sprites.count); tries += 1 }
            }
            lastIndex = idx
            let meta = sprites[idx]
            guard let strip = meta["stripFile"] as? String,
                  let url = EffectUtil.assetURL(strip, assetBase: assetBase),
                  let sheet = await ImageCache.shared.image(at: url, timeout: 12) else {
                NSLog("[Mango] popup sheet failed: %@", JSON.str(meta["stripFile"]))
                try? await Task.sleep(for: .seconds(2))
                continue
            }
            let frameW = JSON.double(meta["frameW"]) ?? 0
            let frameH = JSON.double(meta["frameH"]) ?? 0
            let pos = CGPoint(x: Double.random(in: 0...max(0, 1920 - frameW)),
                              y: Double.random(in: 0...max(0, 1080 - frameH)))
            let popD = popMs / 1000
            current = Current(sheet: sheet, meta: meta, pos: pos,
                              phase: .popIn, phaseStart: Date(), popDuration: popD)
            try? await Task.sleep(for: .seconds(popD))
            guard !Task.isCancelled else { return }
            current?.phase = .dwell
            current?.phaseStart = Date()
            let dwell = Double.random(in: dwellLo...dwellHi) / 1000
            try? await Task.sleep(for: .seconds(dwell))
            guard !Task.isCancelled else { return }
            current?.phase = .popOut
            current?.phaseStart = Date()
            try? await Task.sleep(for: .seconds(0.4))
        }
    }
}
