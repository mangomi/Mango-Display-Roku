// Remote key capture. The app bypasses the tvOS focus engine (full-screen
// canvas + custom pointer, like a game), so raw presses are taken from
// UIKit's pressesBegan/pressesEnded - the equivalent of MainScene's
// onKeyEvent(key, press). Arrows and Select are consumed; MENU IS NEVER
// TOUCHED: at the top level it must return to the home screen or App
// Review rejects (APPLE_TV.md section 6).
//
// DEBUG builds also listen for Darwin notifications
// (com.mangodisplay.key.<up|down|left|right|OK>.<press|release>) so a
// test harness can drive the pointer headlessly:
//   xcrun simctl spawn <udid> notifyutil -p com.mangodisplay.key.right.press

import SwiftUI
import UIKit

struct RemoteInputView: UIViewRepresentable {
    let onKey: (String, Bool) -> Void

    func makeUIView(context: Context) -> RemoteInputUIView {
        let v = RemoteInputUIView()
        v.onKey = onKey
        return v
    }

    func updateUIView(_ uiView: RemoteInputUIView, context: Context) {
        uiView.onKey = onKey
    }
}

final class RemoteInputUIView: UIView {
    var onKey: ((String, Bool) -> Void)?

    override var canBecomeFocused: Bool { true }

    private func keyName(_ press: UIPress) -> String? {
        switch press.type {
        case .upArrow: return "up"
        case .downArrow: return "down"
        case .leftArrow: return "left"
        case .rightArrow: return "right"
        case .select: return "OK"
        default: return nil   // menu, playPause, ... stay with the system
        }
    }

    override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        var unhandled = Set<UIPress>()
        for press in presses {
            if let key = keyName(press) {
                onKey?(key, true)
            } else {
                unhandled.insert(press)
            }
        }
        if !unhandled.isEmpty { super.pressesBegan(unhandled, with: event) }
    }

    override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        var unhandled = Set<UIPress>()
        for press in presses {
            if let key = keyName(press) {
                onKey?(key, false)
            } else {
                unhandled.insert(press)
            }
        }
        if !unhandled.isEmpty { super.pressesEnded(unhandled, with: event) }
    }

    override func pressesCancelled(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        // a cancelled press must still release the glide hold
        for press in presses {
            if let key = keyName(press) { onKey?(key, false) }
        }
        super.pressesCancelled(presses, with: event)
    }
}

#if DEBUG
enum DebugRemote {
    private static var handler: ((String, Bool) -> Void)?

    static func install(_ h: @escaping (String, Bool) -> Void) {
        handler = h
        let callback: CFNotificationCallback = { _, _, name, _, _ in
            guard let raw = name?.rawValue as String? else { return }
            let parts = raw.split(separator: ".")
            guard parts.count >= 5 else { return }
            let key = String(parts[3])
            let phase = String(parts[4])
            DispatchQueue.main.async {
                // "tap" is press+release in one notification: Darwin
                // notifications are lossy under rapid fire, and a lost
                // release once left the glide running to the screen edge
                if phase == "tap" {
                    DebugRemote.handler?(key, true)
                    DebugRemote.handler?(key, false)
                } else {
                    DebugRemote.handler?(key, phase == "press")
                }
            }
        }
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        for key in ["up", "down", "left", "right", "OK"] {
            for phase in ["press", "release", "tap"] {
                CFNotificationCenterAddObserver(
                    center, nil, callback,
                    "com.mangodisplay.key.\(key).\(phase)" as CFString,
                    nil, .deliverImmediately)
            }
        }
    }
}
#endif
