// An animated sprite that also travels (Flying Santa, the witch and her
// spiders). Port of SpriteMover.brs: constant speed per axis, reflecting
// off the screen edges; facing switches with a pre-mirrored sheet
// (stripFileFlipped), spiders additionally rotate to face their
// direction, and an optional companion (the witch's bats) rides at an
// offset that mirrors when she turns.
//
// Roku computes the bounce leg-by-leg; with constant per-axis speeds
// that path IS two independent triangle waves, so this renders position
// analytically from elapsed time - same trajectory, no leg bookkeeping.

import SwiftUI

struct SpriteMoverView: View {
    let cfg: [String: Any]
    let assetBase: String

    @State private var sheet: UIImage?
    @State private var sheetFlipped: UIImage?
    @State private var compSheet: UIImage?
    @State private var compFlipped: UIImage?
    @State private var epoch = Date()

    var body: some View {
        let frameW = JSON.double(cfg["frameW"]) ?? 0
        let frameH = JSON.double(cfg["frameH"]) ?? 0
        let frameCount = max(1, JSON.int(cfg["frameCount"]) ?? 1)
        let cols = max(1, JSON.int(cfg["cols"]) ?? 1)
        let rows = max(1, JSON.int(cfg["rows"]) ?? ((frameCount + cols - 1) / cols))
        let frameMs = JSON.double(cfg["frameMs"]) ?? 90
        TimelineView(.animation) { tl in
            Canvas { ctx, _ in
                guard let base = sheet else { return }
                let t = tl.date.timeIntervalSince(epoch)
                let (x, dirX) = Self.axis(start: JSON.double(cfg["startX"]) ?? 0,
                                          dir: JSON.double(cfg["startDirX"]) ?? 1,
                                          speed: JSON.double(cfg["speedX"]) ?? 120,
                                          maxV: 1920 - frameW, t: t)
                let (y, dirY) = Self.axis(start: JSON.double(cfg["startY"]) ?? 50,
                                          dir: JSON.double(cfg["startDirY"]) ?? 1,
                                          speed: JSON.double(cfg["speedY"]) ?? 30,
                                          maxV: 1080 - frameH, t: t)
                var c = ctx
                c.translateBy(x: x, y: y)
                if JSON.truthy(cfg["rotateOnTurn"]) {
                    // the spiders' 90-degree turn (SpriteMover applyFacing)
                    let deg: Double = dirX > 0 ? (dirY < 0 ? -90 : 90) : (dirY < 0 ? 90 : -90)
                    c.translateBy(x: frameW / 2, y: frameH / 2)
                    c.rotate(by: .degrees(deg))
                    c.translateBy(x: -frameW / 2, y: -frameH / 2)
                }
                let flip = JSON.truthy(cfg["flipOnTurn"]) && dirX < 0
                let img = flip ? (sheetFlipped ?? base) : base
                let frame = EffectUtil.frameIndex(at: tl.date, frameMs: frameMs, frameCount: frameCount)
                EffectUtil.drawSheetFrame(c, sheet: c.resolve(Image(uiImage: img)),
                                          frame: frame, cols: cols, rows: rows,
                                          frameW: frameW, frameH: frameH, at: .zero)
                // companion (bats trailing the witch), mirrored on turn
                if let comp = JSON.obj(cfg["companion"]), let compBase = compSheet {
                    let cw = JSON.double(comp["frameW"]) ?? 0
                    let ch = JSON.double(comp["frameH"]) ?? 0
                    let cCols = max(1, JSON.int(comp["cols"]) ?? 1)
                    let cCount = max(1, JSON.int(comp["frameCount"]) ?? 1)
                    let cRows = max(1, JSON.int(comp["rows"]) ?? ((cCount + cCols - 1) / cCols))
                    let offsetX = JSON.double(comp["offsetX"]) ?? 0
                    let ox = dirX < 0 ? frameW - offsetX - cw : offsetX
                    let cImg = flip ? (compFlipped ?? compBase) : compBase
                    let cFrame = EffectUtil.frameIndex(at: tl.date, frameMs: frameMs, frameCount: cCount)
                    EffectUtil.drawSheetFrame(c, sheet: c.resolve(Image(uiImage: cImg)),
                                              frame: cFrame, cols: cCols, rows: cRows,
                                              frameW: cw, frameH: ch,
                                              at: CGPoint(x: ox, y: JSON.double(comp["offsetY"]) ?? 0))
                }
            }
        }
        .allowsHitTesting(false)
        .task(id: JSON.str(cfg["stripFile"])) {
            epoch = Date()
            func load(_ name: Any?) async -> UIImage? {
                guard let s = name as? String, let u = EffectUtil.assetURL(s, assetBase: assetBase) else { return nil }
                return await ImageCache.shared.image(at: u, timeout: 12)
            }
            sheet = await load(cfg["stripFile"])
            if sheet == nil { NSLog("[Mango] spritemover sheet failed: %@", JSON.str(cfg["stripFile"])) }
            sheetFlipped = await load(cfg["stripFileFlipped"])
            if let comp = JSON.obj(cfg["companion"]) {
                compSheet = await load(comp["stripFile"])
                compFlipped = await load(comp["stripFileFlipped"])
            }
        }
    }

    /// constant-speed bounce inside [0, maxV] as a triangle wave;
    /// returns position and current direction sign
    static func axis(start: Double, dir: Double, speed: Double, maxV: Double, t: Double) -> (Double, Double) {
        guard maxV > 0, speed > 0 else { return (max(0, min(maxV, start)), dir) }
        let s = max(0, min(maxV, start))
        let unfolded = dir >= 0 ? s : 2 * maxV - s
        var m = (unfolded + speed * t).truncatingRemainder(dividingBy: 2 * maxV)
        if m < 0 { m += 2 * maxV }
        return m <= maxV ? (m, 1) : (2 * maxV - m, -1)
    }
}
