// The pairing screen, mirroring MainScene.xml's pairingGroup (itself a
// mirror of the Tizen app's): logo, heading, code, setup line, centered
// column starting 250 canvas-px from the top with 70/45/110 spacings.
// The copy is activation-only on purpose - steering to external signup
// violates store policy on both platforms (App Review 3.1.1 here).

import SwiftUI

struct PairingView: View {
    let code: String

    var body: some View {
        VStack(spacing: 0) {
            Image("Logo")
                .resizable()
                .scaledToFit()
                .frame(width: 560)
                .padding(.bottom, 70)
            Text("Display Device Code")
                .font(.system(size: 47, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.bottom, 45)
            Text(code)
                .font(.system(size: 47).monospacedDigit())
                .foregroundStyle(.white)
                .padding(.bottom, 110)
            Text("Setup at \(Env.setupHost) using any browser")
                .font(.system(size: 30))
                .foregroundStyle(Color(white: 0.8))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .padding(.top, 250)
        .ignoresSafeArea()
    }
}
