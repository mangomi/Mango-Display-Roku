// The measured-label machinery shared by the clock and countdown overlays
// (port of the identical makeLabel() in ClockOverlay.brs and
// CountdownOverlay.brs): the render service hid a piece of text in the
// captured image and tells us its exact rect, alignment, color, family and
// pixel size; the device re-draws that text live, changing NOTHING about
// its styling. All rects are canvas coordinates (1920x1080).

import SwiftUI

/// One hidden text element from a clock/countdown manifest entry.
struct LabelSpec {
    let rect: CGRect
    let align: Alignment
    let color: Color
    let font: Font
    let raw: [String: Any]

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
            .frame(width: spec.rect.width, height: spec.rect.height,
                   alignment: Alignment(horizontal: spec.align.horizontal, vertical: .center))
            .position(x: spec.rect.midX, y: spec.rect.midY)
    }
}
