// The portal's confetti, natively: a burst at the checked box; when a
// whole list completes, the volley the portal calls fireWorkConfetti -
// bursts from the left and right bands, staggered. Port of
// CelebrationBurst.brs + MainScene's onCelebrate/playFinale/spawnBurst.
// The painted portal suppresses its own canvas confetti so none is ever
// baked into a capture; the TV is the only one celebrating.
//
// The sheet is the SAME file the Roku bundles (images/celebrations/,
// shared by folder reference), filmed at build time from the portal's
// own tsparticles presets by tools/generate-celebrations.js, which
// emits celebrationMap.json for this app alongside the .brs map.

import SwiftUI

enum CelebrationMeta {
    struct Meta {
        let image: UIImage
        let frameCount: Int
        let cols: Int
        let rows: Int
        let frameMs: Double
    }

    static let burst: Meta? = {
        guard let mapURL = Bundle.main.url(forResource: "celebrationMap", withExtension: "json"),
              let data = try? Data(contentsOf: mapURL),
              let map = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let file = map["file"] as? String else {
            NSLog("[Mango] celebrationMap.json missing - celebrations disabled")
            return nil
        }
        let name = (file as NSString).deletingPathExtension
        let ext = (file as NSString).pathExtension
        guard let sheetURL = Bundle.main.url(forResource: name, withExtension: ext),
              let img = UIImage(contentsOfFile: sheetURL.path) else {
            NSLog("[Mango] celebration sheet missing from bundle: %@", file)
            return nil
        }
        return Meta(image: img,
                    frameCount: max(1, JSON.int(map["frameCount"]) ?? 1),
                    cols: max(1, JSON.int(map["cols"]) ?? 1),
                    rows: max(1, JSON.int(map["rows"]) ?? 1),
                    frameMs: JSON.double(map["frameMs"]) ?? 70)
    }()
}

/// One scheduled confetti burst (canvas coordinates).
struct CelebrationBurstSpec: Identifiable {
    let id = UUID()
    let x: Double
    let y: Double
    let size: Double
    let delay: Double     // seconds before the first frame
    let start = Date()    // spawn time; playback begins at start+delay
}

/// Confetti bursts land on top of everything, like the portal's canvas
/// at zIndex 999 (MainScene.xml's celebrationLayer, the last child).
struct CelebrationLayerView: View {
    let bursts: [CelebrationBurstSpec]

    var body: some View {
        ZStack(alignment: .topLeading) {
            if let meta = CelebrationMeta.burst {
                ForEach(bursts) { CelebrationBurstView(spec: $0, meta: meta) }
            }
        }
        .allowsHitTesting(false)
    }
}

/// One burst, played once and gone: frames step at the filmed cadence,
/// the whole sheet scaled so one frame fills `size`, clipped to a
/// size x size window centered on the point (CelebrationBurst.brs).
private struct CelebrationBurstView: View {
    let spec: CelebrationBurstSpec
    let meta: CelebrationMeta.Meta

    var body: some View {
        let period = meta.frameMs / 1000
        TimelineView(.animation) { tl in
            let elapsed = tl.date.timeIntervalSince(spec.start) - spec.delay
            let idx = Int(elapsed / period)
            if elapsed >= 0, idx < meta.frameCount {
                let col = idx % meta.cols
                let row = idx / meta.cols
                Image(uiImage: meta.image)
                    .resizable()
                    .frame(width: Double(meta.cols) * spec.size,
                           height: Double(meta.rows) * spec.size)
                    .offset(x: -Double(col) * spec.size, y: -Double(row) * spec.size)
                    .frame(width: spec.size, height: spec.size, alignment: .topLeading)
                    .clipped()
                    .position(x: spec.x, y: spec.y)
            }
        }
    }
}
