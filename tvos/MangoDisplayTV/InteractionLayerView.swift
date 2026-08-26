// The visible half of the interaction layer, in canvas coordinates:
// natively drawn checkboxes (the render hides the portal's own), the
// green outline around whatever the pointer is over, and the pointer
// itself - the same 20px red dot with a 2px white ring every other
// platform draws. Z-order matches MainScene.xml: boxes, then highlight,
// then the dot on top.

import SwiftUI

struct InteractionLayerView: View {
    @ObservedObject var interaction: InteractionController

    private static let highlightColor = Color(.sRGB, red: 0x86 / 255.0, green: 0xE3 / 255.0, blue: 0x9A / 255.0)

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(interaction.boxes) { box in
                if let img = box.checked ? interaction.spriteChecked : interaction.spriteEmpty {
                    Image(uiImage: img)
                        .resizable()
                        .frame(width: box.rect.width, height: box.rect.height)
                        .position(x: box.rect.midX, y: box.rect.midY)
                }
            }
            if let r = interaction.highlightRect {
                Rectangle()
                    .stroke(Self.highlightColor, lineWidth: 4)
                    .frame(width: r.width, height: r.height)
                    .position(x: r.midX, y: r.midY)
            }
            if interaction.pointerActive {
                ZStack {
                    Circle().fill(Color(.sRGB, red: 0.87, green: 0.11, blue: 0.11))
                        .frame(width: 20, height: 20)
                    Circle().stroke(Color.white, lineWidth: 2)
                        .frame(width: 22, height: 22)
                }
                .position(interaction.pointer)
            }
        }
        .allowsHitTesting(false)
    }
}
