// Native countdown: renders the day/hour/minute/second NUMBERS the render
// service hid (box chrome, unit labels and event name stay baked), at the
// measured rects/styles. Port of CountdownOverlay.brs: pure epoch math
// against the manifest's absolute target - timezone-free. Matches the
// portal: units compute with fixed modulo regardless of which boxes are
// enabled, and the visible value runs one second ahead (the portal
// subtracts 1s before display). Ticks every second.

import SwiftUI

struct CountdownOverlayView: View {
    let cfg: [String: Any]

    private static let units = ["day", "hour", "minute", "second"]

    var body: some View {
        if let target = JSON.double(cfg["targetEpochSeconds"]), let elements = JSON.obj(cfg["elements"]) {
            TimelineView(.periodic(from: .now, by: 1)) { ctx in
                let remain = max(0, Int(target) - Int(ctx.date.timeIntervalSince1970) - 1)
                let values = [
                    "day": remain / 86400,
                    "hour": (remain % 86400) / 3600,
                    "minute": (remain % 3600) / 60,
                    "second": remain % 60,
                ]
                // explicit ZStack for the same reason as the clock: bare
                // positioned children of a TimelineView stack implicitly
                ZStack(alignment: .topLeading) {
                    ForEach(Self.units, id: \.self) { unit in
                        if let spec = LabelSpec(JSON.obj(elements[unit])) {
                            OverlayLabelView(spec: spec, text: String(values[unit] ?? 0))
                        }
                    }
                }
            }
        }
    }
}
