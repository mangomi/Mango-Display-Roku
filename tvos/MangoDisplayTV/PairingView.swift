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

    var body: some View {
        GeometryReader { geo in
            let k = geo.size.width / 1920
            VStack(spacing: 0) {
                Image("Logo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 560 * k, height: 136 * k)
                    .padding(.bottom, 70 * k)
                Text("Display Device Code")
                    .font(FontRegistry.shared.font(family: nil, bold: true, sizePx: 40 * k))
                    .foregroundStyle(.white)
                    .padding(.bottom, 36 * k)
                Text(code)
                    .font(FontRegistry.shared.font(family: nil, bold: false, sizePx: 72 * k))
                    .foregroundStyle(.white)
                    .padding(.bottom, 90 * k)
                Text("Setup at \(Env.setupHost) using any browser")
                    .font(FontRegistry.shared.font(family: nil, bold: false, sizePx: 28 * k))
                    .foregroundStyle(Color(white: 0.8))
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.top, 230 * k)
        }
        .ignoresSafeArea()
    }
}
