// The page canvas. The last slot is the front page; during an animated
// page turn the outgoing page sits underneath until the transition
// completes (the SwiftUI shape of MainScene's A/B slots - the incoming
// slot always draws on top). Each slot composes in CANVAS coordinates
// (1920x1080, the portal's fixed layout space) and is scaled to the
// screen as one unit, so the page image and its live overlays move,
// fade and squash together - the whole reason overlays ride inside the
// slot rather than in a global layer.
//
// This simulator maps 1:1 like a Roku on FHD; the scale math stays
// because nothing else should assume that (MANIFEST.md).

import SwiftUI

struct DisplayView: View {
    @EnvironmentObject var controller: DisplayController

    var body: some View {
        ZStack {
            // raw remote presses (arrows/OK; Menu passes through untouched)
            RemoteInputView { key, press in
                controller.handleKey(key, press: press)
            }
            ForEach(controller.slots) { slot in
                SlotView(slot: slot)
                    // flip = horizontal squash/expand of the whole slot
                    .scaleEffect(x: slot.flipSquash ? 0.0001 : 1, y: 1)
                    .transition(Self.transition(slot.transition))
            }
            // display-wide effects fly ABOVE the page slots, so they keep
            // going through page transitions (Roku's effectLayer sibling)
            CanvasSpace {
                ForEach(controller.effects) { EffectItemView(item: $0) }
            }
            // pointer + checkboxes above effects, below the spinner
            // (MainScene.xml sibling order)
            CanvasSpace {
                InteractionLayerView(interaction: controller.interaction)
            }
            if controller.showSpinner {
                // on the widget a gesture acted on, else dead center
                CanvasSpace {
                    ProgressView()
                        .scaleEffect(2)
                        .tint(.white)
                        .position(controller.busyAt ?? CGPoint(x: 960, y: 540))
                }
            }
            // confetti on top of everything, like the portal's canvas at
            // zIndex 999 (MainScene.xml celebrationLayer, last child)
            CanvasSpace {
                CelebrationLayerView(bursts: controller.celebrationBursts)
            }
        }
        .ignoresSafeArea()
    }

    /// display.json transition names, played when ENTERING a page (Roku
    /// buildTransition parity; timing lives in DisplayController). flip
    /// is sequenced by the controller, not a transition here.
    static func transition(_ name: String?) -> AnyTransition {
        switch name {
        case "slideleft":  return .move(edge: .trailing)
        case "slideright": return .move(edge: .leading)
        case "slideup":    return .move(edge: .bottom)
        case "slidedown":  return .move(edge: .top)
        case "pop":        return .scale(scale: 0.3).combined(with: .opacity)
        case "rotate":     return .modifier(active: RotateFx(progress: 0), identity: RotateFx(progress: 1))
        default:           return .opacity   // fade + unknown names
        }
    }
}

/// Roku's "rotate" entrance: half-turn in with fade and growth
/// (rotation pi -> 0, opacity 0 -> 1, scale 0.3 -> 1).
struct RotateFx: ViewModifier {
    let progress: Double

    func body(content: Content) -> some View {
        content
            .rotationEffect(.radians(Double.pi * (1 - progress)))
            .scaleEffect(0.3 + 0.7 * progress)
            .opacity(progress)
    }
}

/// Composes content in CANVAS coordinates (1920x1080) and scales it to
/// the screen as one unit. Slots and the effect layer both live in this
/// space - the 1:1 mapping on this simulator is a coincidence nothing
/// here relies on (MANIFEST.md).
struct CanvasSpace<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        GeometryReader { geo in
            let scale = min(geo.size.width / 1920, geo.size.height / 1080)
            ZStack(alignment: .topLeading) { content }
                .frame(width: 1920, height: 1080)
                .scaleEffect(scale, anchor: .topLeading)
                .offset(x: (geo.size.width - 1920 * scale) / 2,
                        y: (geo.size.height - 1080 * scale) / 2)
        }
    }
}

private struct SlotView: View {
    let slot: DisplayController.PageSlot

    var body: some View {
        CanvasSpace {
            // draw order is the contract: under-layers, then the page
            // image (transparent PNG for layered pages), then the live
            // widgets the service hid from the capture
            ForEach(slot.under) { OverlayItemView(item: $0) }
            Image(uiImage: slot.image)
                .resizable()
                .frame(width: 1920, height: 1080)
            ForEach(slot.over) { OverlayItemView(item: $0) }
        }
    }
}

/// manifest overlay type -> view (Roku's overlayRegistry). Unknown types
/// were already filtered by the controller.
private struct OverlayItemView: View {
    let item: DisplayController.OverlayItem
    @EnvironmentObject var controller: DisplayController

    var body: some View {
        switch item.type {
        case "clock":
            ClockOverlayView(cfg: item.raw)
        case "countdown":
            CountdownOverlayView(cfg: item.raw)
        case "gif":
            GifOverlayView(cfg: item.raw, assetBase: item.assetBase)
        case "slideshow", "background":
            SlideshowOverlayView(cfg: item.raw) { [weak controller] idx in
                controller?.recordOverlayState(item.raw, index: idx)
            }
        default:
            EmptyView()
        }
    }
}
