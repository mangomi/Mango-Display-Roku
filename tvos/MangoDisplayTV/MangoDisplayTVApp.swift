// App entry. One deliberate platform divergence from the Roku channel
// (APPLE_TV.md §3): there is NO keep-alive video hack here. Roku force-
// closes idle channels after 2h and only muted looping video resets that
// clock; tvOS has a documented API for exactly our case - an always-on
// ambient display - so the whole concern reduces to isIdleTimerDisabled.
// The user's own TV/HDMI-CEC sleep settings still apply, same as Roku.

import SwiftUI

@main
struct MangoDisplayTVApp: App {
    @StateObject private var controller = DisplayController()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(controller)
                .onAppear { controller.start() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                // re-asserted on every foreground; the flag is not
                // persistent across backgrounding
                UIApplication.shared.isIdleTimerDisabled = true
            }
        }
    }
}
