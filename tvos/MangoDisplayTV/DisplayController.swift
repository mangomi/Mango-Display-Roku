// The device's whole runtime: pairing -> /wait long-poll -> page display.
// Ports components/VersionTask.brs (the control loop, verbatim semantics)
// and the page half of components/MainScene.brs (A/B slots, load-then-swap,
// rotation, busy spinner). Overlays, effects, interaction and celebrations
// are parity-phase work and deliberately absent here (tvos/PARITY.md).

import SwiftUI
import UIKit

@MainActor
final class DisplayController: ObservableObject {

    // MARK: - state the views draw

    enum Phase { case pairing, display }
    @Published private(set) var phase: Phase = .pairing
    @Published private(set) var code = ""
    /// At most two entries; the LAST is the front page. During an animated
    /// page turn the outgoing page stays underneath until the transition
    /// completes - the SwiftUI shape of MainScene's slotA/slotB pair.
    @Published private(set) var slots: [PageSlot] = []
    /// "Your change is being applied": raised only while the service says
    /// busy AND pages exist, so it never spins over the pairing screen.
    @Published private(set) var showSpinner = false

    struct PageSlot: Identifiable {
        let id = UUID()
        var pageIndex: Int
        var image: UIImage
        var transition: String?
        /// live layers drawn OVER the page image, in manifest order
        var over: [OverlayItem] = []
        /// layers drawn UNDER it (rotating page backgrounds; the page
        /// image is a transparent PNG then - draw order is the contract)
        var under: [OverlayItem] = []
        /// fingerprint of the overlay set this slot was built from
        var overlaysKey: String = ""
        /// mid-flip squash state (the flip transition animates the
        /// outgoing slot to zero width before the incoming one expands)
        var flipSquash = false
    }

    /// One overlay instance riding inside a page slot. assetBase is
    /// captured at build time (Roku sets node.assetBase before config for
    /// the same reason: sprite URLs resolve against it).
    struct OverlayItem: Identifiable {
        let id: String
        let type: String
        let raw: [String: Any]
        let assetBase: String
    }

    /// manifest overlay types this client can draw (Roku's
    /// overlayRegistry); unknown types are skipped, same as a registry
    /// miss. slideshow/background still pending - tvos/PARITY.md.
    private static let overTypes: Set<String> = ["clock", "countdown", "gif"]
    private static let underTypes: Set<String> = []

    // MARK: - internals

    private let cache = ImageCache.shared
    private var identity = ""      // "&device=..&major=..&minor=..&w=..&h=.."
    private var screenW = 1920
    private var screenH = 1080
    private var assetBase = ""     // learned from the control reply, never compiled in
    private var pages: [Page] = []
    private var latestManifest: DisplayManifest?  // arrived mid-load/mid-animation
    private var pageIndex = 0
    private var contentTag = 0     // fallback cache key for hash-less manifests
    private var busy = false
    private var memLevel = "normal"
    private var loading = false    // Roku's m.pendingLoad: one load at a time
    private var animating = false  // Roku's m.activeAnim
    private var runTask: Task<Void, Never>?
    private var rotateTask: Task<Void, Never>?
    private var spinnerWatchdog: Task<Void, Never>?

    func start() {
        guard runTask == nil else { return }
        // what THIS device renders at, re-read each boot; rides on every
        // control request so the service can match output per display.
        // (tvOS UI space is 1920x1080 points on every Apple TV; the OS
        // scales to the panel, like the portal's fixed canvas.)
        let bounds = UIScreen.main.bounds
        screenW = Int(bounds.width)
        screenH = Int(bounds.height)
        code = DeviceIdentity.getOrCreateCode()
        phase = .pairing
        // The closest tvOS offers to Roku's per-poll GetGeneralMemoryLevel:
        // after a pressure warning, every subsequent poll reports mem=low -
        // the service logs it as the flight recorder that separates an OS
        // memory kill from a crash (displayWorker.js:270).
        NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.memLevel = "low" }
        }
        runTask = Task { await run() }
    }

    private func run() async {
        guard let paired = await Backend.runPairing(code: code, screenW: screenW, screenH: screenH) else { return }
        // identity begins with "&": every URL it joins already has a "?"
        identity = "&device=\(code)&major=\(paired.major)&minor=\(paired.minor)&w=\(screenW)&h=\(screenH)"
        await waitLoop()
    }

    // MARK: - the /wait long-poll (VersionTask.runVersionLoop)

    private func waitLoop() async {
        let base = Env.controlBase.absoluteString
        NSLog("[Mango] version long-poll: %@", base)
        var ver = 0
        // The first successful poll of this app run announces the launch:
        // the service raises the busy spinner in that very reply and
        // recaptures every page, so stale cached screens are visibly
        // "loading" instead of silently old. Cleared only once a reply
        // arrives, so a failed first request re-announces on retry.
        // (No &lastexit= yet: tvOS has no GetLastExitInfo equivalent -
        // lifecycle/MetricKit reporting is parity-phase work.)
        var launchPending = true
        var loggedReply = false
        while !Task.isCancelled {
            let launch = launchPending ? "&launch=1" : ""
            let url = URL(string: "\(base)/wait?since=\(ver)&busy=\(busy ? "1" : "0")&mem=\(memLevel)\(launch)\(identity)")!
            // server holds up to 50s; give it 55 then re-arm
            if let reply = await getJSON(url, timeout: 55) {
                launchPending = false
                if !loggedReply {
                    loggedReply = true
                    NSLog("[Mango] control reply: version=%@ busy=%@", JSON.str(reply["version"]), JSON.str(reply["busy"]))
                }
                // busy updates on EVERY reply, including same-version ones -
                // the server flushes waiters the moment a user edit starts
                setBusy(JSON.truthy(reply["busy"]))
                // where to fetch assets from is served, not compiled in:
                // the per-display prefix must not be public, and moving to
                // a custom domain later must not need an app update
                let ab = JSON.str(reply["assetBase"])
                if !ab.isEmpty {
                    let normalized = ab.hasSuffix("/") ? ab : ab + "/"
                    if normalized != assetBase {
                        NSLog("[Mango] asset base: %@", normalized)
                        assetBase = normalized
                    }
                }
                if let v = JSON.int(reply["version"]), v != ver {
                    // any CHANGE is an update, not just a higher number: a
                    // restarted render service can come back with a lower
                    // version, and requiring ">" left the Roku deaf until
                    // reinstall (VersionTask.brs:127)
                    ver = v
                    NSLog("[Mango] new render version: %d", ver)
                    // the manifest rides inline in the /wait reply (the
                    // service knows our since differs); fall back to
                    // fetching display.json so older services keep working
                    var man = JSON.obj(reply["manifest"]).flatMap(DisplayManifest.init)
                    if man == nil { man = await fetchManifest(ver) }
                    if let man { apply(man) }
                }
            } else {
                NSLog("[Mango] version wait failed, checking directly")
                if let hb = await heartbeat(), hb != ver {
                    ver = hb
                    NSLog("[Mango] heartbeat found version: %d", ver)
                    if let man = await fetchManifest(ver) { apply(man) }
                }
                try? await Task.sleep(for: .seconds(5))
            }
            try? await Task.sleep(for: .milliseconds(250))
        }
    }

    /// A long-poll connection can die silently (service restart, NAT drop):
    /// the server writes into a dead socket and the TV waits on nothing.
    /// This plain GET runs whenever the poll fails, so a wedged connection
    /// can never leave the display stale for long.
    private func heartbeat() async -> Int? {
        let url = URL(string: Env.controlBase.absoluteString + "/version?v=1" + identity)!
        guard let json = await getJSON(url, timeout: 8) else { return nil }
        return JSON.int(json["version"])
    }

    private func fetchManifest(_ ver: Int) async -> DisplayManifest? {
        guard !assetBase.isEmpty, let url = URL(string: assetBase + "display.json?t=\(ver)") else { return nil }
        guard let json = await getJSON(url, timeout: 8) else {
            NSLog("[Mango] manifest fetch failed")
            return nil
        }
        return DisplayManifest(json)
    }

    private func getJSON(_ url: URL, timeout: TimeInterval) async -> [String: Any]? {
        var req = URLRequest(url: url, timeoutInterval: timeout)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    // MARK: - applying manifests (MainScene onVersionChange/maybeApplyPages)

    private func apply(_ man: DisplayManifest) {
        if man.schema > DisplayManifest.knownSchema {
            // future contract: keep showing what we already have rather
            // than guess - a stale screen beats a wrong one (MANIFEST.md)
            NSLog("[Mango] manifest schema %d > known %d - holding current content", man.schema, DisplayManifest.knownSchema)
            return
        }
        NSLog("[Mango] display.json: %d page(s)", man.pages.count)
        latestManifest = man
        maybeApplyPages()
    }

    /// Never apply a manifest mid-transition or mid-load; the newest one
    /// waits and is applied when the in-flight work completes.
    private func maybeApplyPages() {
        guard let man = latestManifest, !loading, !animating else { return }
        latestManifest = nil
        pages = man.pages
        // new manifest = pixels may have changed under the stable file
        // names. Hash-carrying manifests make cache keys precise per page;
        // the tag is only the fallback when a hash is missing - and it
        // bumps per applied manifest, never per load, because a page turn
        // must not mint a new URL for pixels the device already holds.
        contentTag += 1
        if pageIndex >= pages.count { pageIndex = 0 }
        // busy may have arrived while no page was up yet (app launch)
        updateSpinner()
        // drop cached images nothing current names - pages AND their
        // overlay sprite sheets (evicting live sheets would refetch every
        // strip on each manifest apply)
        var keep = Set(pages.compactMap { pageURL($0)?.absoluteString })
        for pg in pages {
            for ov in pg.overlays {
                if let strip = ov["stripFile"] as? String, !strip.isEmpty {
                    keep.insert(assetBase + strip)
                }
            }
        }
        Task { await cache.prune(keep: keep) }
        // quiet refresh of the current page, no transition. imageOnly is
        // a swipe's answer landing: swap the image UNDER the live overlay
        // layers rather than rebuilding them - a rebuild restarts every
        // GIF and reads as the screen freezing (MainScene's forceInPlace).
        loadPage(pageIndex, animated: false, forceInPlace: man.imageOnly)
    }

    // MARK: - page loading and display (MainScene loadPage/finalizeSwap)

    /// Load-then-swap, never show a loading blank. An unchanged URL is
    /// served from ImageCache without a fetch or a decode.
    private func loadPage(_ index: Int, animated: Bool, forceInPlace: Bool = false) {
        guard !pages.isEmpty else { return }
        let idx = index >= pages.count ? 0 : index
        let pg = pages[idx]
        guard let url = pageURL(pg) else { return }
        loading = true
        Task {
            // the 12s request timeout doubles as Roku's loadWatchdog:
            // nothing may leave a load pending forever, or the display
            // silently stops accepting updates
            let image = await cache.image(at: url, timeout: 12)
            loading = false
            if let image {
                show(pg, index: idx, image: image, animated: animated, forceInPlace: forceInPlace)
            } else {
                NSLog("[Mango] image load failed: %@", url.absoluteString)
                // a newer manifest may be waiting with a corrected URL
                maybeApplyPages()
            }
        }
    }

    private func pageURL(_ pg: Page) -> URL? {
        guard !assetBase.isEmpty else { return nil }
        let tag = pg.imageHash ?? "v\(contentTag)"
        return URL(string: assetBase + pg.image + "?t=" + tag)
    }

    /// The transition timing the portal uses and Roku matches
    /// (buildTransition: 3.0s, inOutCubic).
    private static let turnDuration = 3.0
    private static let turnCurve = Animation.timingCurve(0.645, 0.045, 0.355, 1.0, duration: turnDuration)

    private func builtOverlays(_ pg: Page) -> (over: [OverlayItem], under: [OverlayItem]) {
        var over: [OverlayItem] = []
        var under: [OverlayItem] = []
        for (i, ov) in pg.overlays.enumerated() {
            guard let type = ov["type"] as? String else { continue }
            // ids stay stable for an unchanged overlay set, so SwiftUI
            // keeps view identity across slot rebuilds of the same page
            let item = OverlayItem(
                id: "\(i)_\(type)_\(JSON.str(ov["widgetSettingId"]))_\(JSON.str(ov["page"]))",
                type: type, raw: ov, assetBase: assetBase
            )
            if Self.underTypes.contains(type) {
                under.append(item)
            } else if Self.overTypes.contains(type) {
                over.append(item)
            }
        }
        return (over, under)
    }

    private func show(_ pg: Page, index: Int, image: UIImage, animated: Bool, forceInPlace: Bool = false) {
        phase = .display
        // An in-place swap keeps the LIVE overlay layers running and only
        // exchanges the pixels beneath them (MainScene loadPage's
        // forceInPlace/overlaysUnchanged path): allowed when nothing
        // animates, the page is the one already showing, and either the
        // manifest was imageOnly or the overlay set is unchanged.
        if !animated, let front = slots.last, index == front.pageIndex,
           forceInPlace || pg.overlaysKey == front.overlaysKey {
            slots[slots.count - 1].image = image
            pageIndex = index
            armRotation()
            maybeApplyPages()
            updateSpinner()
            return
        }
        pageIndex = index
        var slot = PageSlot(pageIndex: index, image: image, transition: pg.transition)
        (slot.over, slot.under) = builtOverlays(pg)
        slot.overlaysKey = pg.overlaysKey
        if animated, !slots.isEmpty {
            if pg.transition == "flip" {
                startFlip(slot)
            } else {
                // the incoming page animates in on top over 3s; the
                // outgoing one stays put underneath and is dropped once
                // the transition completes
                animating = true
                withAnimation(Self.turnCurve, completionCriteria: .logicallyComplete) {
                    slots.append(slot)
                } completion: { [weak self] in
                    self?.finishTurn()
                }
            }
        } else {
            // page (re)build without a transition: replace outright
            slots = [slot]
            armRotation()
            maybeApplyPages()
        }
        updateSpinner()
    }

    /// Roku has no 3D transforms and approximates the card flip as a
    /// horizontal squash-and-expand, half the duration each way, on the
    /// WHOLE slot (overlays included) - reproduced literally so the two
    /// clients look the same.
    private func startFlip(_ incoming: PageSlot) {
        animating = true
        withAnimation(.easeIn(duration: Self.turnDuration / 2)) {
            slots[slots.count - 1].flipSquash = true
        }
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.turnDuration / 2))
            guard let self else { return }
            var slot = incoming
            slot.flipSquash = true
            self.slots = [slot]   // outgoing is at zero width; no visible pop
            withAnimation(.easeOut(duration: Self.turnDuration / 2), completionCriteria: .logicallyComplete) {
                self.slots[0].flipSquash = false
            } completion: { [weak self] in
                self?.finishTurn()
            }
        }
    }

    private func finishTurn() {
        if slots.count > 1 { slots.removeFirst(slots.count - 1) }
        animating = false
        armRotation()
        maybeApplyPages()
    }

    // MARK: - rotation (MainScene armPageTimer/onPageTimer)

    /// Dwell then advance, per the page on screen: delaySeconds (min 3,
    /// default 60), only pages with autoRotate, only when 2+ pages exist.
    private func armRotation() {
        rotateTask?.cancel()
        rotateTask = nil
        guard pages.count >= 2, pageIndex < pages.count else { return }
        let pg = pages[pageIndex]
        guard pg.autoRotate else { return }
        let dwell = max(3, pg.delaySeconds ?? 60)
        let next = (pageIndex + 1) % pages.count
        rotateTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(dwell))
            guard !Task.isCancelled, let self else { return }
            // turning mid-load/mid-transition would fight the work in
            // flight; the show() that ends it re-arms rotation anyway
            guard !self.loading, !self.animating else { return }
            self.loadPage(next, animated: true)
        }
    }

    // MARK: - busy spinner (MainScene onBusyChange + watchdog)

    private func setBusy(_ next: Bool) {
        guard busy != next else { return }
        busy = next
        NSLog("[Mango] busy=%@", next ? "true" : "false")
        updateSpinner()
    }

    private func updateSpinner() {
        let show = busy && !slots.isEmpty
        guard show != showSpinner else { return }
        showSpinner = show
        spinnerWatchdog?.cancel()
        spinnerWatchdog = nil
        if show {
            // safety net: never leave a spinner on screen if a busy=false
            // is ever missed (75s, matching Roku's spinnerWatchdog)
            spinnerWatchdog = Task { [weak self] in
                try? await Task.sleep(for: .seconds(75))
                guard !Task.isCancelled else { return }
                NSLog("[Mango] spinner watchdog - forcing hide")
                self?.showSpinner = false
            }
        }
    }
}
