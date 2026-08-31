// Remote interaction: a pointer the user steers with the D-pad, plus the
// task checkboxes drawn natively (the render hides the real ones). Port
// of InteractionLayer.brs; the flow mirrors the portal's own
// remotePointer directive, which is what the other TV platforms run:
//
//   - OK reveals the pointer; the press that reveals it does nothing else
//   - OK again taps whatever sits under the pointer
//   - arrows do nothing until the pointer is up, then move it 10px a
//     step; holding one glides it at ~250px/s after a 0.35s pause
//   - 15s without input hides it again
//   - double-click left/right turns the page (whole-page, pointer not
//     required); double-click up/down over a calendar region swipes it
//     (aimed, pointer required). The double-click window is 450ms from
//     the first press's RELEASE, and a press that glided doesn't count.
//
// Pressing OK sends the gesture to the render service, which replays it
// into a live portal session; the tick is drawn immediately so the press
// feels instant while that round trip happens, and the local state is
// held across refreshes until the portal's own render agrees (or 180s
// pass - never pin a state that isn't real).

import SwiftUI

@MainActor
final class InteractionController: ObservableObject {
    struct TargetItem: Identifiable {
        let uid = UUID()
        var id: String { uid.uuidString }
        let taskId: String        // payload.id as string, "" when absent
        var rect: CGRect
        var checked: Bool
        let widget: String
        let project: String
        let kind: String
    }

    struct Region {
        let rect: CGRect
        let id: String
    }

    // what the view draws
    @Published private(set) var boxes: [TargetItem] = []
    @Published private(set) var spriteEmpty: UIImage?
    @Published private(set) var spriteChecked: UIImage?
    @Published private(set) var pointerActive = false
    @Published private(set) var pointer = CGPoint(x: 960, y: 540)
    @Published private(set) var highlightRect: CGRect?

    // wired by DisplayController
    var serviceBase = ""
    var identity = ""
    var assetBase = ""
    var pageIndex = 0
    var gestures: [String: Any] = [:]
    var pageTurn: ((Int) -> Void)?
    var busyAt: ((CGPoint) -> Void)?
    var celebrate: ((String, CGPoint) -> Void)?

    private var regions: [Region] = []
    /// taskId -> the user's own tick, held until the backend proves it
    private var overrides: [String: (checked: Bool, at: Date)] = [:]
    private var swipeBusy = false
    private var warmSent = false
    private var heldKey = ""
    /// A press only counts as a HOLD (and so cannot be half of a
    /// double-click) once it has glided the pointer a visible distance
    /// - 4 steps (~160ms of glide, ~40px). Treating the very first
    /// glide step as a hold made deliberate double-clicks nearly
    /// impossible (Dave, 2026-08-28: "the double-click needs to be
    /// really quick, otherwise it's just moving the mouse"); the
    /// portal's own remote never disqualifies a held press at all.
    /// (Roku 367a1de)
    private var glideSteps = 0
    private static let glideClickSteps = 4
    private var dblKey = ""
    private var hideTask: Task<Void, Never>?
    private var holdTask: Task<Void, Never>?
    private var dblTask: Task<Void, Never>?
    private var cooldownTask: Task<Void, Never>?

    // MARK: - targets (checkboxes)

    func setTargets(_ targets: [String: Any]?, regions rawRegions: [[String: Any]], pageIndex: Int) {
        self.pageIndex = pageIndex
        regions = rawRegions.compactMap { r in
            guard let rect = Self.rect(r["rect"]) else { return nil }
            return Region(rect: rect, id: JSON.str(r["id"]))
        }
        boxes = []
        guard let targets, let items = JSON.arr(targets["items"]),
              let sprites = JSON.obj(targets["sprites"]),
              let emptyFile = sprites["empty"] as? String,
              let checkedFile = sprites["checked"] as? String else {
            spriteEmpty = nil
            spriteChecked = nil
            updateHighlight()
            renderReturned()
            return
        }
        // both sprites up front, so the first press swaps instantly
        let base = assetBase
        Task { [weak self] in
            if let u = URL(string: base + emptyFile) {
                self?.spriteEmpty = await ImageCache.shared.image(at: u, timeout: 12)
            }
            if let u = URL(string: base + checkedFile) {
                self?.spriteChecked = await ImageCache.shared.image(at: u, timeout: 12)
            }
        }

        var seen = Set<String>()
        var built: [TargetItem] = []
        for itAny in items {
            guard let it = JSON.obj(itAny), let rect = Self.rect(it["rect"]) else { continue }
            let payload = JSON.obj(it["payload"]) ?? [:]
            let taskId = JSON.str(payload["id"])
            var checked = JSON.truthy(it["checked"])
            if !taskId.isEmpty {
                seen.insert(taskId)
                checked = resolveChecked(taskId, fromManifest: checked)
            }
            built.append(TargetItem(
                taskId: taskId, rect: rect, checked: checked,
                widget: JSON.str(it["widgetSettingId"]),
                project: JSON.str(payload["projectId"]),
                kind: JSON.str(it["kind"])
            ))
        }
        boxes = built
        // a target that has left the page - a completed chore dropping
        // out of the list - has nothing left to hold
        overrides = overrides.filter { seen.contains($0.key) }
        NSLog("[Mango] targets: %d box(es), %d held locally", boxes.count, overrides.count)
        updateHighlight()
        renderReturned()
    }

    /// the render came back, so an in-flight gesture is done with
    private func renderReturned() {
        if swipeBusy {
            swipeBusy = false
            cooldownTask?.cancel()
        }
    }

    /// The press is the user's truth until the backend's own refresh
    /// proves it landed (or 180s pass and it clearly never will).
    private func resolveChecked(_ id: String, fromManifest: Bool) -> Bool {
        guard let ov = overrides[id] else { return fromManifest }
        if ov.checked == fromManifest {
            overrides.removeValue(forKey: id)   // backend caught up
            return fromManifest
        }
        if Date().timeIntervalSince(ov.at) > 180 {
            overrides.removeValue(forKey: id)   // never landed
            return fromManifest
        }
        return ov.checked
    }

    /// The swipe's own manifest just applied - release the
    /// one-swipe-at-a-time lock now instead of waiting out the cooldown.
    func swipeApplied() {
        if swipeBusy {
            NSLog("[Mango] swipe manifest applied - gestures unlocked")
            swipeBusy = false
            cooldownTask?.cancel()
        }
    }

    // MARK: - keys

    func keyDown(_ key: String) {
        if key == "OK" {
            // the press that brings the pointer up does nothing else,
            // so nothing can be triggered blind
            if pointerActive {
                restartHide()
                activateUnderPointer()
            } else {
                showPointer()
            }
            return
        }

        // double-click left/right turns the page - whole-page, so it
        // works whether or not the pointer is showing
        if (key == "left" || key == "right") && key == dblKey {
            dblTask?.cancel()
            dblKey = ""
            if JSON.truthy(gestures["pageSwipe"]) {
                pageTurn?(key == "right" ? 1 : -1)
                return
            }
        }

        // double-click up/down over a calendar sends a swipe - aimed,
        // so it only counts while the pointer is showing. One swipe at
        // a time: a second sent while the first is coming back makes
        // the backend resend the dates already on screen.
        if (key == "up" || key == "down") && pointerActive && key == dblKey {
            dblTask?.cancel()
            dblKey = ""
            if let reg = regionUnderPointer(), JSON.truthy(gestures["calendarScroll"]), !swipeBusy {
                restartHide()
                swipeBusy = true
                cooldownTask?.cancel()
                cooldownTask = Task { [weak self] in
                    try? await Task.sleep(for: .seconds(8))
                    guard !Task.isCancelled else { return }
                    self?.swipeBusy = false
                }
                // spinner on the widget that is changing, not mid-screen
                busyAt?(CGPoint(x: reg.rect.midX, y: reg.rect.midY))
                sendAction(key == "up" ? "swipeup" : "swipedown", x: pointer.x, y: pointer.y, id: reg.id)
                return
            }
        }

        // arrows only steer a pointer that is already up
        guard pointerActive else { return }
        restartHide()
        if key == heldKey { return }   // system key repeat; the hold timer drives gliding
        heldKey = key
        movePointer(key)
        holdTask?.cancel()
        holdTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(0.35))
            guard !Task.isCancelled else { return }
            while !Task.isCancelled, let self, !self.heldKey.isEmpty {
                self.glideSteps += 1
                self.restartHide()
                self.movePointer(self.heldKey)
                try? await Task.sleep(for: .seconds(0.04))
            }
        }
    }

    func keyUp(_ key: String) {
        let glided = glideSteps >= Self.glideClickSteps
        if key == heldKey { stopHold() }
        // The double-click window arms from the RELEASE to the next
        // PRESS - 550ms, desktop double-click territory plus room for a
        // remote thumb (the portal's 250ms is release-to-release, so its
        // budget also covers the second press's own duration; ours does
        // not). A press that genuinely glided is excluded. (Roku 367a1de)
        if !glided {
            dblKey = key
            dblTask?.cancel()
            dblTask = Task { [weak self] in
                try? await Task.sleep(for: .seconds(0.55))
                guard !Task.isCancelled else { return }
                self?.dblKey = ""
            }
        }
    }

    private func stopHold() {
        heldKey = ""
        glideSteps = 0
        holdTask?.cancel()
    }

    // MARK: - pointer

    private func showPointer() {
        // always the middle of the screen: predictable, not wherever it
        // was last left
        if !pointerActive {
            pointer = CGPoint(x: 960, y: 540)
        }
        pointerActive = true
        updateHighlight()
        restartHide()
        // warm the portal session while the user is still aiming
        if !warmSent {
            warmSent = true
            sendAction("warm", x: 0, y: 0, id: "")
        }
    }

    private func restartHide() {
        hideTask?.cancel()
        hideTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(15))
            guard !Task.isCancelled else { return }
            self?.hidePointer()
        }
    }

    private func hidePointer() {
        pointerActive = false
        highlightRect = nil
        warmSent = false
        stopHold()
    }

    private func movePointer(_ key: String) {
        var p = pointer
        switch key {
        case "up": p.y -= 10
        case "down": p.y += 10
        case "left": p.x -= 10
        case "right": p.x += 10
        default: return
        }
        p.x = min(1908, max(12, p.x))
        p.y = min(1068, max(12, p.y))
        pointer = p
        updateHighlight()
    }

    private func regionUnderPointer() -> Region? {
        regions.first { $0.rect.contains(pointer) }
    }

    /// small forgiveness margin - the portal hits the exact point, but
    /// its checkbox has a label around it that ours doesn't
    private func itemIndexUnderPointer() -> Int? {
        boxes.firstIndex { $0.rect.insetBy(dx: -12, dy: -12).contains(pointer) }
    }

    /// Outline whatever the pointer is over - without this the pointer
    /// is a dot on a photo and nothing says what can be acted on.
    private func updateHighlight() {
        guard pointerActive else {
            highlightRect = nil
            return
        }
        if let reg = regionUnderPointer() {
            highlightRect = reg.rect
        } else if let i = itemIndexUnderPointer() {
            highlightRect = boxes[i].rect.insetBy(dx: -10, dy: -10)
        } else {
            highlightRect = nil
        }
    }

    // MARK: - activation

    /// Is every box in this task's LIST now checked? Todos group per
    /// project inside a widget (the portal's own rule), chores per widget.
    private func listComplete(_ hit: TargetItem) -> Bool {
        for it in boxes where it.widget == hit.widget {
            if hit.kind != "todo" || it.project == hit.project {
                if !it.checked { return false }
            }
        }
        return true
    }

    private func activateUnderPointer() {
        NSLog("[Mango] OK at %d,%d", Int(pointer.x), Int(pointer.y))
        guard let i = itemIndexUnderPointer() else { return }
        // tick now, ask later: the press paints locally and that state
        // is held across refreshes until the render agrees with it
        boxes[i].checked.toggle()
        let hit = boxes[i]
        if !hit.taskId.isEmpty {
            overrides[hit.taskId] = (hit.checked, Date())
        }
        NSLog("[Mango] tick %@ -> %@", hit.taskId, hit.checked ? "true" : "false")
        // celebrate exactly like the portal: a burst at the box for a
        // check-off, the full-display finale when its whole list is done
        if hit.checked {
            celebrate?(listComplete(hit) ? "finale" : "burst",
                       CGPoint(x: hit.rect.midX, y: hit.rect.midY))
        }
        sendAction("tap", x: hit.rect.midX, y: hit.rect.midY, id: hit.taskId)
    }

    // MARK: - service channel

    /// Identity travels with the gesture: the live page's task list can
    /// differ from the render the device is showing, so position alone
    /// can misfire. A tap re-renders the page in the live session, so
    /// the timeout allows for that.
    private func sendAction(_ kind: String, x: Double, y: Double, id: String) {
        let url = serviceBase + "/interact?type=\(kind)&page=\(pageIndex)&x=\(Int(x))&y=\(Int(y))&id=\(id)" + identity
        guard let u = URL(string: url) else { return }
        Task.detached {
            var req = URLRequest(url: u)
            req.timeoutInterval = 45
            do {
                let (_, resp) = try await URLSession.shared.data(for: req)
                if let code = (resp as? HTTPURLResponse)?.statusCode, code != 200 {
                    NSLog("[Mango] interact %@ failed: HTTP %d", kind, code)
                }
            } catch {
                NSLog("[Mango] interact %@ failed: %@", kind, error.localizedDescription)
            }
        }
    }

    private static func rect(_ v: Any?) -> CGRect? {
        guard let r = JSON.obj(v),
              let x = JSON.double(r["x"]), let y = JSON.double(r["y"]),
              let w = JSON.double(r["w"]), let h = JSON.double(r["h"]) else { return nil }
        return CGRect(x: x, y: y, width: w, height: h)
    }
}
