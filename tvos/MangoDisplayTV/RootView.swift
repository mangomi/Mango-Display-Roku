import SwiftUI

struct RootView: View {
    @EnvironmentObject var controller: DisplayController

    var body: some View {
        ZStack {
            // the display is a black canvas regardless of TV theme
            Color.black.ignoresSafeArea()
            switch controller.phase {
            case .pairing:
                PairingView(code: controller.code)
            case .display:
                DisplayView()
            }
        }
        // A full-screen canvas bypassing the focus engine is allowed
        // (games do it), but Menu/Back must NOT be trapped: at top level
        // it has to return to the tvOS home screen or App Review rejects
        // (APPLE_TV.md §6.3). We add no button handling at all, so the
        // system default - exit to home - stands.
    }
}
