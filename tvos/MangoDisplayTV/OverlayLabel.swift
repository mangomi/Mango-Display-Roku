// The measured-label machinery shared by the clock and countdown overlays
// (port of the identical makeLabel() in ClockOverlay.brs and
// CountdownOverlay.brs): the render service hid a piece of text in the
// captured image and tells us its exact rect, alignment, color, family and
// pixel size; the device re-draws that text live, changing NOTHING about
// its styling. All rects are canvas coordinates (1920x1080).

import SwiftUI

/// One hidden text element from a clock/countdown manifest entry.
struct LabelSpec {
    var rect: CGRect
    let align: Alignment
    let color: Color
    let font: Font
    let raw: [String: Any]
    /// false = never ellipsize: the text may overflow its frame instead
    /// (Roku `ellipsisText = ""`)
    var truncates = true

    /// The portal's box is exactly as wide as the text it holds, measured
    /// with sub-pixel advances; a native label of that exact width can
    /// ellipsize the same digits to "..." when the platform's glyph
    /// advances round up (a tester saw a countdown's minutes as three
    /// dots, 2026-09-05). A font-size of slack on the aligned side(s),
    /// and no truncation. (Roku 7fdc46c, CountdownOverlay.makeLabel)
    func withSlack(_ pad: Double) -> LabelSpec {
        var s = self
        var x = rect.minX
        if align == .center { x -= pad / 2 }
        if align == .trailing { x -= pad }
        s.rect = CGRect(x: x, y: rect.minY, width: rect.width + pad, height: rect.height)
        s.truncates = false
        return s
    }

    init?(_ el: [String: Any]?) {
        guard let el, let r = JSON.obj(el["rect"]),
              let x = JSON.double(r["x"]), let y = JSON.double(r["y"]),
              let w = JSON.double(r["w"]), let h = JSON.double(r["h"]) else { return nil }
        rect = CGRect(x: x, y: y, width: w, height: h)
        // vertAlign is always center; horizAlign defaults center with
        // left/start and right/end variants (makeLabel parity)
        switch el["align"] as? String {
        case "left", "start": align = .leading
        case "right", "end": align = .trailing
        default: align = .center
        }
        color = Self.parseColor(JSON.str(el["color"])) ?? .white
        font = FontRegistry.shared.font(
            family: el["fontFamily"] as? String,
            bold: JSON.truthy(el["bold"]),
            sizePx: JSON.double(el["fontSizePx"]) ?? 16
        )
        raw = el
    }

    /// "#RRGGBB" / "#RRGGBBAA" (the manifest's CSS-derived colors).
    static func parseColor(_ s: String) -> Color? {
        var hex = s
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6 || hex.count == 8, let v = UInt64(hex, radix: 16) else { return nil }
        let hasAlpha = hex.count == 8
        let r = Double((v >> (hasAlpha ? 24 : 16)) & 0xFF) / 255
        let g = Double((v >> (hasAlpha ? 16 : 8)) & 0xFF) / 255
        let b = Double((v >> (hasAlpha ? 8 : 0)) & 0xFF) / 255
        let a = hasAlpha ? Double(v & 0xFF) / 255 : 1
        return Color(.sRGB, red: r, green: g, blue: b, opacity: a)
    }
}

/// Draws a LabelSpec's text at its measured canvas rect. Meant for use
/// inside the slot's 1920x1080 canvas coordinate space.
struct OverlayLabelView: View {
    let spec: LabelSpec
    let text: String

    var body: some View {
        Text(text)
            .font(spec.font)
            .foregroundStyle(spec.color)
            .lineLimit(1)
            // fixedSize keeps the text at its natural width so it can
            // overflow the frame rather than be ellipsized
            .fixedSize(horizontal: !spec.truncates, vertical: false)
            .frame(width: spec.rect.width, height: spec.rect.height,
                   alignment: Alignment(horizontal: spec.align.horizontal, vertical: .center))
            .position(x: spec.rect.midX, y: spec.rect.midY)
    }
}
