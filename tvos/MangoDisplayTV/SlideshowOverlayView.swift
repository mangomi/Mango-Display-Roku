// Photo slideshow widget AND rotating page background (the manifest's
// `slideshow` and `background` types both land here, like Roku's overlay
// registry). Port of SlideshowOverlay.brs: steps through the manifest's
// image URL list on the widget's own interval with the widget's own
// transition, clipped to the widget rect; failed loads skip ahead; the
// first reveal always fades (nothing meaningful to slide from); position
// persists across page rotations via the controller's overlay-state map
// (Roku: lastIndex/startIndex through MainScene.overlayState), advancing
// one on re-entry so it feels fresh.
//
// Memory discipline: photos are fetched directly and DOWNSAMPLED to the
// widget rect at decode (Roku's loadWidth cap) - only the on-screen A/B
// pair stays resident. A 60-photo background list must never sit in the
// shared cache; that is exactly the slow famine the contract warns about.

import ImageIO
import SwiftUI

struct SlideshowOverlayView: View {
    let cfg: [String: Any]
    /// reports the shown index for cross-rotation persistence
    let onAdvance: (Int) -> Void

    private struct Layer: Identifiable {
        let id = UUID()
        var image: UIImage
        var flipSquash = false
    }

    @State private var layers: [Layer] = []   // <= 2, last is front
    @State private var index = 0
    @State private var pending = false        // a load/swap is in flight
    @State private var revealed = false       // first photo has fully faded in

    var body: some View {
        // fewer than 2 images: draw nothing - the service keeps
        // single-image widgets baked in the capture (fleet rule), so a
        // lone URL here would double-draw
        if let images = JSON.arr(cfg["images"]) as? [String], images.count >= 2 {
            let rect = Self.rect(cfg)
            let brightness = JSON.double(cfg["brightness"]) ?? 1
            ZStack {
                // page color sits under the photos (the layered page
                // render is transparent where this widget shows through)
                if let pc = cfg["pageColor"] as? String, let color = Self.cssColor(pc) {
                    color
                }
                ForEach(layers) { layer in
                    Image(uiImage: layer.image)
                        .resizable()
                        .aspectRatio(contentMode: JSON.truthy(cfg["cropToFill"]) ? .fill : .fit)
                        .frame(width: rect.width, height: rect.height)
                        // the portal dims via filter:brightness(n); black
                        // at (1-n) multiplies the same way Roku's gray
                        // blendColor does
                        .overlay(brightness < 1 ? Color.black.opacity(1 - max(0, brightness)) : nil)
                        .scaleEffect(x: layer.flipSquash ? 0.0001 : 1, y: 1)
                        // the modifier's value at INSERT time decides the
                        // animation, so `revealed` flips only after the
                        // first fade-in completes
                        .transition(transitionFor(firstReveal: !revealed))
                }
            }
            .frame(width: rect.width, height: rect.height)
            .clipped()
            .position(x: rect.midX, y: rect.midY)
            .task(id: JSON.str(cfg["widgetSettingId"]) + "_" + JSON.str(cfg["page"])) {
                await run(images: images, rect: rect)
            }
        }
    }

    /// page backgrounds carry no rect - they fill the canvas
    private static func rect(_ cfg: [String: Any]) -> CGRect {
        if let r = JSON.obj(cfg["rect"]),
           let x = JSON.double(r["x"]), let y = JSON.double(r["y"]),
           let w = JSON.double(r["w"]), let h = JSON.double(r["h"]) {
            return CGRect(x: x, y: y, width: w, height: h)
        }
        return CGRect(x: 0, y: 0, width: 1920, height: 1080)
    }

    private func transitionFor(firstReveal: Bool) -> AnyTransition {
        if firstReveal { return .opacity }
        switch cfg["transition"] as? String {
        case "slideleft":  return .move(edge: .trailing)
        case "slideright": return .move(edge: .leading)
        case "slideup":    return .move(edge: .bottom)
        case "slidedown":  return .move(edge: .top)
        default:           return .opacity
        }
    }

    private func run(images: [String], rect: CGRect) async {
        // resume where this widget left off last time its page showed;
        // startIndex is injected by the controller from its state map
        if let resume = JSON.int(cfg["startIndex"]) {
            index = (resume + 1) % images.count
        } else {
            index = 0
        }
        onAdvance(index)
        await advance(to: index, images: images, rect: rect, firstReveal: true)

        var interval = JSON.double(cfg["intervalSeconds"]) ?? 60
        if interval < 3 { interval = 3 }
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(interval))
            guard !Task.isCancelled else { return }
            if pending { continue }
            index = (index + 1) % images.count
            onAdvance(index)
            await advance(to: index, images: images, rect: rect, firstReveal: false)
        }
    }

    private func advance(to i: Int, images: [String], rect: CGRect, firstReveal: Bool) async {
        pending = true
        guard let url = URL(string: images[i]),
              let image = await Self.fetchDownsampled(url, maxPixel: max(rect.width, rect.height)) else {
            NSLog("[Mango] slideshow image failed, skipping: %@", images[i])
            // advance past the broken URL on the next tick
            index = (index + 1) % images.count
            onAdvance(index)
            pending = false
            return
        }
        let isFlip = !firstReveal && (cfg["transition"] as? String) == "flip"
        if isFlip {
            // squash the front to zero width, then expand the new photo -
            // the same 3s two-phase card flip the pages use
            withAnimation(.easeIn(duration: 1.5)) {
                if !layers.isEmpty { layers[layers.count - 1].flipSquash = true }
            }
            try? await Task.sleep(for: .seconds(1.5))
            var layer = Layer(image: image)
            layer.flipSquash = true
            layers = [layer]
            withAnimation(.easeOut(duration: 1.5), completionCriteria: .logicallyComplete) {
                layers[0].flipSquash = false
            } completion: {
                pending = false
            }
        } else {
            let layer = Layer(image: image)
            let anim: Animation = firstReveal
                ? .easeInOut(duration: 1.0)
                : .timingCurve(0.645, 0.045, 0.355, 1.0, duration: 3.0)
            withAnimation(anim, completionCriteria: .logicallyComplete) {
                layers.append(layer)
            } completion: {
                if layers.count > 1 { layers.removeFirst(layers.count - 1) }
                revealed = true
                pending = false
            }
        }
    }

    /// Fetch + decode capped at the display rect (Roku loadWidth parity):
    /// a 4000px photo decodes to widget size, not native size.
    static func fetchDownsampled(_ url: URL, maxPixel: Double) async -> UIImage? {
        let req = URLRequest(url: url, timeoutInterval: 20)
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        guard let src = CGImageSourceCreateWithData(data as CFData, nil),
              let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else {
            return UIImage(data: data)   // decode failed to thumbnail: fall back
        }
        return UIImage(cgImage: cg)
    }

    /// "#RGB" / "#RRGGBB" / "#RRGGBBAA" / "rgb(r,g,b)" (SlideshowOverlay's
    /// cssColorToRokuHex, minus the Roku hex format).
    static func cssColor(_ s: String) -> Color? {
        let t = s.trimmingCharacters(in: .whitespaces)
        if t.hasPrefix("#") {
            var hex = String(t.dropFirst())
            if hex.count == 3 { hex = hex.map { "\($0)\($0)" }.joined() }
            return LabelSpec.parseColor("#" + hex)
        }
        guard let open = t.firstIndex(of: "("), let close = t.firstIndex(of: ")"), open < close else { return nil }
        let parts = t[t.index(after: open)..<close].split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
        guard parts.count >= 3 else { return nil }
        return Color(.sRGB,
                     red: min(255, max(0, parts[0])) / 255,
                     green: min(255, max(0, parts[1])) / 255,
                     blue: min(255, max(0, parts[2])) / 255,
                     opacity: parts.count >= 4 ? min(1, max(0, parts[3])) : 1)
    }
}
