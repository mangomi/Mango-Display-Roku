// Environment configuration - the tvOS analogue of source/env.brs.
//
// The Roku channel compiles its environment in via package.sh, and the
// checked-in copy is ALWAYS the test one so a naive build can never touch
// production; `./package.sh prod` regenerates it for that build alone.
// Same posture here, as a build configuration rather than a runtime
// switch: Debug and Release target TEST; only the "Production" build
// configuration (its own scheme, used to archive) defines the MANGO_PROD
// compilation condition and gets the production hosts. Nothing at
// runtime can flip it.
//
// Codes registered on one backend can only be claimed from the matching
// webapp, and the control endpoint must serve the same environment the
// device paired against. The two control names share one load balancer
// that routes by HOST HEADER - the hostname is the contract, never the
// balancer's address or an IP (anything else answers 404).

import Foundation

#if MANGO_PROD
enum Env {
    static let name = "production"
    /// Device-facing API version v1.0.5 - what Tizen and the Roku speak
    /// (Dave's decision 2026-08-26; the webapp itself is on v1.0.16).
    static let apiBase = URL(string: "https://api.mangomirror.com/v1.0.5/")!
    static let setupHost = "app.mangodisplay.com"
    /// production render service, live 2026-09-07
    static let controlBase = URL(string: "https://roku-control.mangodisplay.com")!
}
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
