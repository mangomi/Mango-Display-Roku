// Native clock: draws the time (and date) lines the render service hid,
// at the exact rects/styles it measured. Port of ClockOverlay.brs - the
// composition rules are verbatim, because they encode a hard lesson: the
// device composes only the VALUES; every format decision (12/24h, whether
// the meridiem shows at all, its localized strings and position, the
// date's word order and names in the display's language) arrives in the
// manifest, taken from the user's own settings. The English literals here
// are ONLY the fallback for manifests that predate those fields.
//
// Ticks every 5s like the Roku; shows the DISPLAY's timezone via
// tzOffsetMinutes from the manifest (falls back to device-local time).

import SwiftUI

struct ClockOverlayView: View {
    let cfg: [String: Any]

    private var timeSpec: LabelSpec? { LabelSpec(JSON.obj(JSON.obj(cfg["elements"])?["time"])) }
    private var dateSpec: LabelSpec? { LabelSpec(JSON.obj(JSON.obj(cfg["elements"])?["date"])) }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 5)) { ctx in
            let c = Self.displayComponents(cfg, at: ctx.date)
            // one explicit ZStack: multiple positioned children directly
            // in a TimelineView get implicitly STACKED, which displaced
            // every label after the first by a share of the canvas
            ZStack(alignment: .topLeading) {
                if let spec = timeSpec {
                    OverlayLabelView(spec: spec, text: Self.timeText(spec.raw, c))
                }
                if let spec = dateSpec {
                    OverlayLabelView(spec: spec, text: Self.dateText(spec.raw, c))
                }
            }
        }
    }

    /// Current time shifted into the display's timezone (manifest offset
    /// from UTC, in minutes); absent offset -> device-local.
    static func displayComponents(_ cfg: [String: Any], at date: Date) -> DateComponents {
        var cal = Calendar(identifier: .gregorian)
        if let off = JSON.int(cfg["tzOffsetMinutes"]), let tz = TimeZone(secondsFromGMT: off * 60) {
            cal.timeZone = tz
        }
        return cal.dateComponents([.hour, .minute, .weekday, .month, .day], from: date)
    }

    /// JSON null parses to NSNull, but Roku's ParseJson turns null into
    /// invalid - so "present" must mean present-and-not-null to keep the
    /// legacy-fallback branch behavior identical.
    private static func present(_ v: Any?) -> Bool { v != nil && !(v is NSNull) }

    static func timeText(_ f: [String: Any], _ c: DateComponents) -> String {
        let h = c.hour ?? 0
        var mm = String(c.minute ?? 0)
        if mm.count < 2 { mm = "0" + mm }
        if JSON.truthy(f["is24h"]) {
            var hh = String(h)
            if JSON.truthy(f["padHour"]) && hh.count < 2 { hh = "0" + hh }
            return hh + ":" + mm
        }
        var h12 = h % 12
        if h12 == 0 { h12 = 12 }
        var hh = String(h12)
        if JSON.truthy(f["padHour"]) && hh.count < 2 { hh = "0" + hh }
        var txt = hh + ":" + mm
        if present(f["showMeridiem"]) {
            // the settings decide: shown only when the user enabled it,
            // with the language's own strings on the language's own side
            if JSON.truthy(f["showMeridiem"]) {
                let mer = h < 12 ? f["am"] as? String : f["pm"] as? String
                if let mer {
                    let sp = JSON.truthy(f["meridiemSpaced"]) ? " " : ""
                    txt = JSON.truthy(f["meridiemPrefix"]) ? mer + sp + txt : txt + sp + mer
                }
            }
        } else {
            // legacy manifest: old English-suffix behavior
            var mer = h >= 12 ? " PM" : " AM"
            if !JSON.truthy(f["upperMeridiem"]) { mer = mer.lowercased() }
            txt += mer
        }
        return txt
    }

    static func dateText(_ d: [String: Any], _ c: DateComponents) -> String {
        // weekday: Calendar is 1=Sunday, Roku's GetDayOfWeek is 0=Sunday;
        // the manifest's arrays are Sunday-first either way
        let wdIndex = (c.weekday ?? 1) - 1
        let moIndex = (c.month ?? 1) - 1
        let day = c.day ?? 1
        if let pattern = JSON.arr(d["pattern"]),
           let weekdays = JSON.arr(d["weekdays"]) as? [String], weekdays.count == 7,
           let months = JSON.arr(d["months"]) as? [String], months.count == 12 {
            var txt = ""
            for tokAny in pattern {
                guard let tok = JSON.obj(tokAny) else { continue }
                switch tok["t"] as? String {
                case "weekday": txt += weekdays[wdIndex]
                case "month": txt += months[moIndex]
                case "day": txt += String(day)
                default: if let v = tok["v"] as? String { txt += v }
                }
            }
            return txt
        }
        // legacy manifest: English fallback
        let wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        let mo = ["January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"]
        return wd[wdIndex] + ", " + mo[moIndex] + " " + String(day)
    }
}
