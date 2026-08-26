// Spiders descending on threads (part of the Flying Witch set). Port of
// DropperEffect.brs: several spiders drop from the top on 2px threads,
// swaying as they go, then reel back up, endlessly alternating. Spiders
// start at random points in the cycle so the screen is populated
// immediately; all sheets step the same frame together (one shared tick,
// fixed at the .brs XML's 100ms - the config's frameMs is ignored there
// and so it is here).

import SwiftUI

struct DropperEffectView: View {
    let cfg: [String: Any]
    let assetBase: String

    private struct Spider {
        var baseX: Double
        var cycleOffset: Double   // seconds into the down/up cycle at epoch
    }

    @State private var sheet: UIImage?
    @State private var spiders: [Spider] = []
    @State private var epoch = Date()

    var body: some View {
        let frameW = JSON.double(cfg["frameW"]) ?? 0
        let frameH = JSON.double(cfg["frameH"]) ?? 0
        let frameCount = max(1, JSON.int(cfg["frameCount"]) ?? 1)
        let cols = max(1, JSON.int(cfg["cols"]) ?? 1)
        let rows = max(1, JSON.int(cfg["rows"]) ?? ((frameCount + cols - 1) / cols))
        let speed = JSON.double(cfg["speed"]) ?? 36
        let maxY = JSON.double(cfg["maxY"]) ?? 960
        let sway = JSON.double(cfg["swayAmplitude"]) ?? 22.5
        let swayPeriod = (JSON.double(cfg["swayPeriodMs"]) ?? 3770) / 1000
        let threadColor = EffectUtil.rokuHexColor(JSON.str(cfg["threadColor"]))
            ?? Color(.sRGB, red: 0.784, green: 0.784, blue: 0.784, opacity: 0.8)
        TimelineView(.animation) { tl in
            Canvas { ctx, _ in
                guard let ui = sheet, maxY > 0, speed > 0 else { return }
                let legDur = maxY / speed
                let resolved = ctx.resolve(Image(uiImage: ui))
                let frame = EffectUtil.frameIndex(at: tl.date, frameMs: 100, frameCount: frameCount)
                let elapsed = tl.date.timeIntervalSince(epoch)
                for s in spiders {
                    var cyc = (s.cycleOffset + elapsed).truncatingRemainder(dividingBy: 2 * legDur)
                    if cyc < 0 { cyc += 2 * legDur }
                    let down = cyc < legDur
                    let legElapsed = down ? cyc : cyc - legDur
                    let t = legElapsed / legDur
                    let y = down ? maxY * t : maxY * (1 - t)
                    let x = s.baseX + sway * sin(legElapsed * (2 * .pi / swayPeriod))
                    // thread hangs from the top down to the spider
                    ctx.fill(Path(CGRect(x: x, y: 0, width: 2, height: y + 1)), with: .color(threadColor))
                    EffectUtil.drawSheetFrame(ctx, sheet: resolved,
                                              frame: frame, cols: cols, rows: rows,
                                              frameW: frameW, frameH: frameH,
                                              at: CGPoint(x: x - frameW / 2, y: y))
                }
            }
        }
        .allowsHitTesting(false)
        .task(id: JSON.str(cfg["stripFile"])) {
            let count = max(1, JSON.int(cfg["count"]) ?? 6)
            let legDur = max(0.1, maxY / max(1, speed))
            let spacing = 1920.0 / Double(count)
            epoch = Date()
            spiders = (0..<count).map { i in
                var baseX = spacing * Double(i) + spacing / 2 + (Double.random(in: 0...1) - 0.5) * spacing * 0.4
                baseX = min(1860, max(60, baseX))
                return Spider(baseX: baseX, cycleOffset: Double.random(in: 0..<1) * legDur)
            }
            if let strip = cfg["stripFile"] as? String,
               let url = EffectUtil.assetURL(strip, assetBase: assetBase) {
                sheet = await ImageCache.shared.image(at: url, timeout: 12)
            }
        }
    }
}
