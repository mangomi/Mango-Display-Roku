// The pairing screen, mirroring MainScene.xml's pairingGroup (itself a
// mirror of the Tizen app's): logo, heading, code, setup line in a
// centered column. Laid out in the 1920-wide design space and converted
// to THIS screen's pixels - never scaled as a group, which resamples the
// glyphs and smears them (Roku 050c1d8: Source Sans Pro at 40/72/28,
// column at y=230 with 70/36/90 spacings). The copy is activation-only
// on purpose - steering to external signup violates store policy on both
// platforms (App Review 3.1.1 here).

import SwiftUI

struct PairingView: View {
    let code: String
    /// The claim has landed but the first page has not: the phone said
    /// "success" while this screen still showed the code for the 10-15s
    /// the service takes to boot the portal and publish the first page,
    /// which read as "nothing happened" (Apple review, 2026-09-25). Say
    /// so the moment the backend reports the claim - heading "Connected",
    /// "Loading your display..." in the code's place, a spinner below,
    /// no instructions line - exactly as MainScene.onPaired (Roku
    /// c305f78). Deliberately no fallback or patience text and no timeout
    /// (Dave). The first page replaces this whole screen.
    let connected: Bool

    var body: some View {
        GeometryReader { geo in
            let k = geo.size.width / 1920
            ZStack(alignment: .top) {
                VStack(spacing: 0) {
                    Image("Logo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 560 * k, height: 136 * k)
                        .padding(.bottom, 70 * k)
                    Text(connected ? "Connected" : "Display Device Code")
                        .font(FontRegistry.shared.font(family: nil, bold: true, sizePx: 40 * k))
                        .foregroundStyle(.white)
                        .padding(.bottom, 36 * k)
                    Text(connected ? "Loading your display..." : code)
                        .font(FontRegistry.shared.font(family: nil, bold: false, sizePx: 72 * k))
                        .foregroundStyle(.white)
                        .padding(.bottom, 90 * k)
                    if !connected {
                        Text("Setup at \(Env.setupHost) using any browser")
                            .font(FontRegistry.shared.font(family: nil, bold: false, sizePx: 28 * k))
                            .foregroundStyle(Color(white: 0.8))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 230 * k)
                if connected {
                    // below the text, not over it (Roku busyAt at 78% of
                    // the screen height)
                    ProgressView()
                        .scaleEffect(2)
                        .tint(.white)
                        .position(x: geo.size.width / 2, y: geo.size.height * 0.78)
                }
            }
        }
        .ignoresSafeArea()
    }
}
