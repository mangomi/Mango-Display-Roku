// Natively scrolled widget content (calendar cells, lists). Port of
// ScrollOverlay.brs: the render service captures the cell's content ONCE
// as a tall transparent strip (in <= 2048px segments) and the device
// does the motion - a linear, repeating, sub-pixel translation from
// fromY to toY over durationMs inside the clipped window. Checkboxes
// that live inside the content ride the strip (drawn INSIDE it, in strip
// coordinates) so they travel with their rows; the interaction layer
// reads the strip's live position to aim at and tick them, and holds the
// strip while one is aimed at.
//
// Position is analytic (a pure function of elapsed time minus time spent
// paused), so a SwiftUI rebuild never restarts a strip.

import SwiftUI

/// One scroll overlay's live state, shared between its view and the
/// interaction layer (the Roku pair of ScrollOverlay + InteractionLayer's
/// stripOverlays).
@MainActor
final class ScrollStripState: ObservableObject, Identifiable {
    struct Box {
        let rect: CGRect          // strip coordinates
        let taskId: String
        let widget: String
        let project: String
        let kind: String
        let manifestChecked: Bool
    }

    let id = UUID()
    let rect: CGRect
    let stripW: Double
    let stripH: Double
    let fromY: Double
    let toY: Double
    let duration: TimeInterval
    let loop: Bool
    let segments: [(file: String, h: Double)]
    let boxes: [Box]
    let spriteEmpty: String?
    let spriteChecked: String?

    /// held while the pointer is on one of its checkboxes
    @Published var paused = false {
        didSet {
            guard paused != oldValue else { return }
            if paused {
                pausedAt = Date()
            } else if let at = pausedAt {
                pausedAccum += Date().timeIntervalSince(at)
                pausedAt = nil
            }
        }
    }
    /// displayed checked state per box index (manifest value, or the
    /// user's own tick until the render agrees)
    @Published var checked: [Bool]

    private let epoch = Date()
    private var pausedAt: Date?
    private var pausedAccum: TimeInterval = 0

    init?(_ cfg: [String: Any]) {
        guard let r = JSON.obj(cfg["rect"]),
              let x = JSON.double(r["x"]), let y = JSON.double(r["y"]),
              let w = JSON.double(r["w"]), let h = JSON.double(r["h"]),
              let segs = JSON.arr(cfg["segments"]), !segs.isEmpty else { return nil }
        rect = CGRect(x: x, y: y, width: w, height: h)
        segments = segs.compactMap { s in
            guard let d = JSON.obj(s), let file = d["file"] as? String, let hh = JSON.double(d["h"]) else { return nil }
            return (file, hh)
        }
        stripW = JSON.double(cfg["stripW"]) ?? w
        stripH = JSON.double(cfg["stripH"]) ?? segments.reduce(0) { $0 + $1.h }
        fromY = JSON.double(cfg["fromY"]) ?? 0
        toY = JSON.double(cfg["toY"]) ?? -stripH
        duration = max(0.1, (JSON.double(cfg["durationMs"]) ?? 10000) / 1000)
        loop = !(cfg["loop"] != nil && !(cfg["loop"] is NSNull) && !JSON.truthy(cfg["loop"]))
        let sprites = JSON.obj(cfg["sprites"])
        spriteEmpty = sprites?["empty"] as? String
        spriteChecked = sprites?["checked"] as? String
        boxes = (JSON.arr(cfg["boxes"]) ?? []).compactMap { b in
            guard let d = JSON.obj(b), let bx = JSON.double(d["x"]), let by = JSON.double(d["y"]),
                  let bw = JSON.double(d["w"]), let bh = JSON.double(d["h"]) else { return nil }
            let payload = JSON.obj(d["payload"]) ?? [:]
            return Box(rect: CGRect(x: bx, y: by, width: bw, height: bh),
                       taskId: JSON.str(payload["id"]),
                       widget: JSON.str(d["widgetSettingId"]),
                       project: JSON.str(payload["projectId"]),
                       kind: (d["kind"] as? String) ?? "todo",
                       manifestChecked: JSON.truthy(d["checked"]))
        }
        checked = boxes.map { $0.manifestChecked }
    }

    /// running time: wall clock minus every paused stretch
    private func runTime(at date: Date) -> TimeInterval {
        var t = date.timeIntervalSince(epoch) - pausedAccum
        if let at = pausedAt { t -= date.timeIntervalSince(at) }
        return max(0, t)
    }

    /// the strip's translation inside the window right now (canvas px)
    func currentY(at date: Date = Date()) -> Double {
        var f = runTime(at: date) / duration
        f = loop ? f - floor(f) : min(1, f)
        return fromY + (toY - fromY) * f
    }

    /// a box's rect on the CANVAS right now (strip offset + box offset)
    func canvasRect(ofBox i: Int, at date: Date = Date()) -> CGRect {
        let b = boxes[i].rect
        return CGRect(x: rect.minX + b.minX, y: rect.minY + currentY(at: date) + b.minY,
                      width: b.width, height: b.height)
    }

    /// a strip box can only be aimed at while its row is inside the window
    func boxVisible(_ i: Int, at date: Date = Date()) -> Bool {
        let r = canvasRect(ofBox: i, at: date)
        return r.maxY > rect.minY && r.minY < rect.maxY
    }
}

struct ScrollOverlayView: View {
    @ObservedObject var strip: ScrollStripState
    let assetBase: String
    @EnvironmentObject var controller: DisplayController

    @State private var segmentImages: [UIImage?] = []
    @State private var spriteEmpty: UIImage?
    @State private var spriteChecked: UIImage?

    var body: some View {
        TimelineView(.animation(paused: strip.paused)) { tl in
            let y = strip.currentY(at: tl.date)
            ZStack(alignment: .topLeading) {
                // the strip: segments stacked top to bottom, drawn scaled
                // to their canvas size (the PNGs are at output scale)
                var top = 0.0
                ForEach(Array(strip.segments.enumerated()), id: \.offset) { i, seg in
                    let segTop = top
                    let _ = { top += seg.h }()
                    if i < segmentImages.count, let img = segmentImages[i] {
                        Image(uiImage: img)
                            .resizable()
                            .frame(width: strip.stripW, height: seg.h)
                            .position(x: strip.stripW / 2, y: y + segTop + seg.h / 2)
                    }
                }
                // checkboxes ride the strip, at their strip position
                ForEach(Array(strip.boxes.enumerated()), id: \.offset) { i, box in
                    let isChecked = i < strip.checked.count ? strip.checked[i] : box.manifestChecked
                    if let img = isChecked ? spriteChecked : spriteEmpty {
                        Image(uiImage: img)
                            .resizable()
                            .frame(width: box.rect.width, height: box.rect.height)
                            .position(x: box.rect.midX, y: y + box.rect.midY)
                    }
                }
            }
            .frame(width: strip.rect.width, height: strip.rect.height, alignment: .topLeading)
            .clipped()
            .position(x: strip.rect.midX, y: strip.rect.midY)
        }
        .allowsHitTesting(false)
        .task(id: strip.id) {
            // memory guard: under pressure, load no NEW strips - the cell
            // shows from the page image instead (strips already resident
            // keep running)
            if controller.lowMemory {
                NSLog("[Mango] low memory - scroll strip not loaded")
                return
            }
            var loaded: [UIImage?] = []
            for seg in strip.segments {
                if let url = URL(string: assetBase + seg.file) {
                    let img = await ImageCache.shared.image(at: url, timeout: 15)
                    if img == nil { NSLog("[Mango] scroll strip failed: %@", seg.file) }
                    loaded.append(img)
                } else {
                    loaded.append(nil)
                }
            }
            segmentImages = loaded
            if let e = strip.spriteEmpty, let u = URL(string: assetBase + e) {
                spriteEmpty = await ImageCache.shared.image(at: u, timeout: 12)
            }
            if let c = strip.spriteChecked, let u = URL(string: assetBase + c) {
                spriteChecked = await ImageCache.shared.image(at: u, timeout: 12)
            }
        }
    }
}
