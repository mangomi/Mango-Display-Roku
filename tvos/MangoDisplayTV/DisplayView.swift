// The page canvas. The last slot is the front page; during an animated
// page turn the outgoing page sits underneath until the transition
// completes (the SwiftUI shape of MainScene's A/B slots - the incoming
// slot always draws on top). The centered spinner mirrors Roku's: shown
// only while a user edit renders, transient by design so nothing burns in.

import SwiftUI

struct DisplayView: View {
    @EnvironmentObject var controller: DisplayController

    var body: some View {
        ZStack {
            ForEach(controller.slots) { slot in
                Image(uiImage: slot.image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .transition(Self.transition(slot.transition))
            }
            if controller.showSpinner {
                ProgressView()
                    .scaleEffect(2)
                    .tint(.white)
            }
        }
        .ignoresSafeArea()
    }

    /// display.json transition names, played when ENTERING a page:
    /// fade | slideleft | slideright | slideup | slidedown | pop |
    /// rotate | flip. rotate and flip fall back to fade in the spike
    /// (noted in tvos/PARITY.md).
    static func transition(_ name: String?) -> AnyTransition {
        switch name {
        case "slideleft":  return .move(edge: .trailing)
        case "slideright": return .move(edge: .leading)
        case "slideup":    return .move(edge: .bottom)
        case "slidedown":  return .move(edge: .top)
        case "pop":        return .scale(scale: 0.6).combined(with: .opacity)
        default:           return .opacity
        }
    }
}
