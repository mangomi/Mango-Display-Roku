// Environment configuration - the tvOS analogue of source/env.brs.
//
// The Roku channel compiles its environment in via package.sh, and the
// checked-in copy is ALWAYS the test one so a naive build can never touch
// production. Same posture here: this file targets TEST; production will
// arrive as a dedicated build configuration defining the MANGO_PROD
// compilation condition, and until the prod fleet + DNS exist
// (roku-control.mangodisplay.com is not stood up yet, APPLE_TV.md §1)
// asking for prod is a compile error rather than a silent misroute.
//
// Codes registered on one backend can only be claimed from the matching
// webapp, and the control endpoint must serve the same environment the
// device paired against.

import Foundation

#if MANGO_PROD
#error("No production environment is wired up yet: the prod control fleet/DNS does not exist (APPLE_TV.md §1). Build without MANGO_PROD.")
#else
enum Env {
    static let name = "test"
    /// Backend REST API (pairing/registration). v1.0.5 is the version the
    /// Tizen app and the Roku channel speak (Dave's decision 2026-08-26).
    static let apiBase = URL(string: "https://testapi.mangomirror.com/v1.0.5/")!
    /// Shown on the pairing screen - where the user claims the code.
    static let setupHost = "testapp.mangodisplay.com"
    /// The render service control endpoint (render-service/fleet.js):
    /// /wait, /version, /interact. HTTPS matters - the control reply
    /// carries the display's asset prefix, the only secret protecting a
    /// household's rendered content.
    static let controlBase = URL(string: "https://roku-control-test.mangodisplay.com")!
}
#endif
