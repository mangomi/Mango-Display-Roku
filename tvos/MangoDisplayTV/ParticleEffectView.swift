// Native particle engine (balloons/snow/leaves/hearts - same model,
// different sprites and direction). Port of ParticleEffect.brs: each
// particle travels edge-to-edge with sine drift, fading in over its first
// stretch, growing slightly, re-randomizing every completed trip so the
// motion never repeats; a few are seeded mid-path so the screen is never
// empty at start. Config fields and defaults mirror the .brs exactly
// (sizeRange 30-70, speedRange 12-42 px/s, drift 20-60px over 4.2-12.6s,
// fadeInPx 100 capped at 40% of the trip, growthFactor 1.25, maxCount 12,
// spawnEverySeconds 1.6, spinTurnsRange for leaves).

import SwiftUI

struct ParticleEffectView: View {
    let cfg: [String: Any]
    let assetBase: String

    private struct Particle {
        var start: Date
        var duration: Double
        var startProgress: Double
        var remaining: Double
        var startX: Double
        var amp: Double
        var period: Double
        var fullDuration: Double
        var phase: Double
        var size: Double
        var aspect: Double
        var growth: Double
        var fadeFrac: Double
        var spinTurns: Double?
        var down: Bool
        var spriteIndex: Int
    }

    @State private var sprites: [UIImage?] = []
    @State private var particles: [Particle] = []

    var body: some View {
        TimelineView(.animation) { tl in
            Canvas { ctx, _ in
                for p in particles {
                    guard p.spriteIndex < sprites.count, let ui = sprites[p.spriteIndex] else { continue }
                    let f = min(1, max(0, tl.date.timeIntervalSince(p.start) / p.duration))
                    let t = p.startProgress + f * p.remaining
                    let h = p.size * p.aspect
                    let travel = 1080 + h * 2
                    let y = p.down ? -h + travel * t : 1080 + h - travel * t
                    let x = p.startX + p.amp * sin(t * p.fullDuration * (2 * .pi / p.period) + p.phase)
                    let scale = (1 + (p.growth - 1) * p.startProgress)
                        + ((p.growth) - (1 + (p.growth - 1) * p.startProgress)) * f
                    var c = ctx
                    c.opacity = p.startProgress > 0.02 ? 1 : (f < p.fadeFrac ? f / max(p.fadeFrac, 0.0001) : 1)
                    let cx = x + p.size / 2
                    let cy = y + h / 2
                    if let turns = p.spinTurns {
                        c.translateBy(x: cx, y: cy)
                        c.rotate(by: .radians(turns * 2 * .pi * p.remaining * f))
                        c.translateBy(x: -cx, y: -cy)
                    }
                    let w = p.size * scale
                    let hh = h * scale
                    c.draw(ctx.resolve(Image(uiImage: ui)),
                           in: CGRect(x: cx - w / 2, y: cy - hh / 2, width: w, height: hh))
                }
            }
        }
        .allowsHitTesting(false)
        .task(id: JSON.str(cfg["type"])) { await run() }
    }

    private func run() async {
        // sprites carry their real aspect (h/w) so the art is never
        // squashed; entries may be bare URLs or {url, aspect}
        let defs: [(url: String, aspect: Double)] = (JSON.arr(cfg["sprites"]) ?? []).compactMap {
            if let d = JSON.obj($0), let u = d["url"] as? String {
                return (u, JSON.double(d["aspect"]) ?? 1.3)
            }
            if let s = $0 as? String { return (s, 1.3) }
            return nil
        }
        guard !defs.isEmpty else { return }
        var loaded: [UIImage?] = Array(repeating: nil, count: defs.count)
        for (i, d) in defs.enumerated() {
            if let url = EffectUtil.assetURL(d.url, assetBase: assetBase) {
                loaded[i] = await ImageCache.shared.image(at: url, timeout: 12)
            }
        }
        sprites = loaded

        let maxCount = JSON.int(cfg["maxCount"]) ?? 12
        let spawnEvery = JSON.double(cfg["spawnEverySeconds"]) ?? 1.6
        // seed a few immediately, staggered along their path
        particles = (0..<4).map { _ in makeParticle(defs, progress: Double.random(in: 0...0.7)) }
        var sinceSpawn = 0.0
        while !Task.isCancelled {
            try? await Task.sleep(for: .milliseconds(250))
            let now = Date()
            for i in particles.indices where now.timeIntervalSince(particles[i].start) >= particles[i].duration {
                // trip complete: re-randomize and send it again
                particles[i] = makeParticle(defs, progress: 0)
            }
            sinceSpawn += 0.25
            if sinceSpawn >= spawnEvery {
                sinceSpawn = 0
                if particles.count < maxCount {
                    particles.append(makeParticle(defs, progress: 0))
                }
            }
        }
    }

    private func pick(_ key: String, _ lo: Double, _ hi: Double) -> Double {
        if let r = JSON.arr(cfg[key]), r.count == 2,
           let a = JSON.double(r[0]), let b = JSON.double(r[1]) {
            return Double.random(in: min(a, b)...max(a, b))
        }
        return Double.random(in: lo...hi)
    }

    private func makeParticle(_ defs: [(url: String, aspect: Double)], progress: Double) -> Particle {
        let idx = Int.random(in: 0..<defs.count)
        let size = pick("sizeRange", 30, 70)
        let aspect = defs[idx].aspect
        let speed = pick("speedRange", 12, 42)
        let travel = 1080 + size * aspect * 2
        let fullDuration = max(4, travel / speed)
        let remaining = max(0.15, 1 - progress)
        let fadeInPx = JSON.double(cfg["fadeInPx"]) ?? 100
        var spin: Double?
        if cfg["spinTurnsRange"] != nil { spin = pick("spinTurnsRange", -1, 1) }
        return Particle(
            start: Date(),
            duration: fullDuration * remaining,
            startProgress: progress,
            remaining: remaining,
            startX: Double.random(in: 0...1920),
            amp: pick("driftAmplitudeRange", 20, 60),
            period: pick("driftPeriodRange", 4.2, 12.6),
            fullDuration: fullDuration,
            phase: Double.random(in: 0...(2 * .pi)),
            size: size,
            aspect: aspect,
            growth: JSON.double(cfg["growthFactor"]) ?? 1.25,
            fadeFrac: min(0.4, (fadeInPx / travel) / remaining),
            spinTurns: spin,
            down: (cfg["direction"] as? String) == "down",
            spriteIndex: idx
        )
    }
}
