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
            // night mode: black video under the (transparent) page layer
            if controller.night {
                NightVideoView().ignoresSafeArea()
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
                        .position(controller.busyAt ?? controller.canvas.center)
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

/// Composes content in CANVAS coordinates - the manifest's own space,
/// the display's resolution, portrait when rotated - and puts it on the
/// screen as ONE unit (MainScene applyCanvas + the `stage` group):
/// scaled by the long side (a portrait canvas is the landscape one
/// turned, so its long side is still the screen's width), centred on the
/// screen centre, and turned by `rotation` clockwise about that centre.
/// Nothing inside is rotated individually. The 1:1 mapping on an FHD
/// screen with a 1920x1080 canvas is a coincidence nothing relies on.
struct CanvasSpace<Content: View>: View {
    @EnvironmentObject var controller: DisplayController
    @ViewBuilder let content: Content

    var body: some View {
        GeometryReader { geo in
            let c = controller.canvas
            let long = max(c.width, c.height)
            let scale = max(geo.size.width, geo.size.height) / max(1, long)
            let turned = c.rotation == 90 || c.rotation == 270
            // SwiftUI's positive rotation is clockwise on screen, the
            // manifest's "clockwise as the viewer sees it" - no sign flip
            // (Roku negates because SceneGraph's positive is CCW)
            let angle = Angle.degrees(turned ? (c.rotation == 90 ? 90 : -90) : 0)
            ZStack(alignment: .topLeading) { content }
                .frame(width: c.width, height: c.height)
                .scaleEffect(scale)
                .rotationEffect(angle)
                .position(x: geo.size.width / 2, y: geo.size.height / 2)
        }
    }
}

private struct SlotView: View {
    let slot: DisplayController.PageSlot
    @EnvironmentObject var controller: DisplayController

    var body: some View {
        CanvasSpace {
            // draw order is the contract: under-layers, then the page
            // image (transparent PNG for layered pages, exactly
            // canvas-sized), then the live widgets the service hid
            ForEach(slot.under) { OverlayItemView(item: $0) }
            Image(uiImage: slot.image)
                .resizable()
                .frame(width: controller.canvas.width, height: controller.canvas.height)
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
        case "scroll":
            if let strip = item.strip {
                ScrollOverlayView(strip: strip, assetBase: item.assetBase)
            }
        case "motion":
            MotionOverlayView(cfg: item.raw, assetBase: item.assetBase)
        default:
            EmptyView()
        }
    }
}
