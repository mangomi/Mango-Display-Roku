// Why did the PREVIOUS run of this app end? Roku asks the OS afterwards
// (GetLastExitInfo) because it offers no shutdown hook; tvOS is the
// opposite - no exit-info API at all, so this app leaves breadcrumbs on
// the way down (lifecycle notifications, persisted immediately) and reads
// them at the next launch. The answer rides the launch poll as
// `&lastexit=&lastexitat=`, exactly where the service expects Roku's
// (VersionTask launchInfo), logged next to the session's start/duration.
//
// Interpretation of the marker the previous run left behind:
//   "terminate"  - willTerminate fired: a clean shutdown
//   "background" - the user left to the home screen / app switcher and
//                  the run ended there (OS reclaim, or swipe-kill while
//                  suspended - tvOS cannot tell those apart)
//   "running"    - no lifecycle notice at all: a crash or a hard kill
//                  while foreground; reported as "killed"
//
// MetricKit (APPLE_TV.md hoped for crash diagnostics) turned out to be a
// dead end on tvOS: the framework imports, but MXMetricManagerSubscriber
// and the diagnostic payload types are marked unavailable for the
// platform (verified against the tvOS 26.5 SDK, 2026-08-26). The
// breadcrumbs above are the whole story; the service's own
// missed-poll inference covers the rest, as it does for Roku.

import UIKit

enum ExitReport {
    private static let stateKey = "sessionState"
    private static let atKey = "sessionStateAt"

    /// Observe the lifecycle for the rest of this run. Call once at start.
    static func install() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: UIApplication.didEnterBackgroundNotification,
                       object: nil, queue: .main) { _ in mark("background") }
        nc.addObserver(forName: UIApplication.willEnterForegroundNotification,
                       object: nil, queue: .main) { _ in mark("running") }
        nc.addObserver(forName: UIApplication.willTerminateNotification,
                       object: nil, queue: .main) { _ in mark("terminate") }
    }

    private static func mark(_ state: String) {
        let d = UserDefaults.standard
        d.set(state, forKey: stateKey)
        d.set(Int(Date().timeIntervalSince1970), forKey: atKey)
    }

    /// The previous run's exit, as a ready-to-append query fragment ("" on
    /// the first run ever). Also stamps this run as "running".
    static func launchQuery() -> String {
        let d = UserDefaults.standard
        let prev = d.string(forKey: stateKey)
        let at = d.integer(forKey: atKey)
        mark("running")
        guard let prev else { return "" }
        let reason: String
        switch prev {
        case "terminate": reason = "terminate"
        case "background": reason = "background"
        default: reason = "killed"
        }
        var q = "&lastexit=" + sanitize(reason)
        if at > 0 { q += "&lastexitat=" + sanitize(String(at)) }
        NSLog("[Mango] previous session exit: %@", q)
        return q
    }

    /// query-safe subset only, capped at 64 (MainScene.sanitizeParam)
    static func sanitize(_ v: String) -> String {
        let out = String(v.map { c in
            c.isLetter || c.isNumber || c == "_" || c == "-" || c == "." || c == ":" ? c : "_"
        })
        return String(out.prefix(64))
    }
}

