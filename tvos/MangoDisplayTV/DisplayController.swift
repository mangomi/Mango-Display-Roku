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
    }

    // MARK: - internals

    private let cache = ImageCache()
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
        // drop cached images no current page names
        let keep = Set(pages.compactMap { pageURL($0)?.absoluteString })
        Task { await cache.prune(keep: keep) }
        // quiet refresh of the current page, no transition. (imageOnly
        // additionally means "swap the image under live overlay layers";
        // until overlays exist the effect is the same in-place swap.)
        loadPage(pageIndex, animated: false)
    }

    // MARK: - page loading and display (MainScene loadPage/finalizeSwap)

    /// Load-then-swap, never show a loading blank. An unchanged URL is
    /// served from ImageCache without a fetch or a decode.
    private func loadPage(_ index: Int, animated: Bool) {
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
                show(pg, index: idx, image: image, animated: animated)
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

    private func show(_ pg: Page, index: Int, image: UIImage, animated: Bool) {
        phase = .display
        pageIndex = index
        if animated, !slots.isEmpty {
            // a page TURN: the incoming page animates in on top, the
            // outgoing one stays put underneath and is dropped once the
            // transition completes
            animating = true
            let slot = PageSlot(pageIndex: index, image: image, transition: pg.transition)
            withAnimation(.easeInOut(duration: 0.5), completionCriteria: .logicallyComplete) {
                slots.append(slot)
            } completion: { [weak self] in
                guard let self else { return }
                if self.slots.count > 1 { self.slots.removeFirst(self.slots.count - 1) }
                self.animating = false
                self.armRotation()
                self.maybeApplyPages()
            }
        } else {
            // a REFRESH: swap pixels in place with no transition - fresh
            // data arriving in the background must not flash the screen
            if slots.isEmpty {
                slots = [PageSlot(pageIndex: index, image: image, transition: nil)]
            } else {
                slots[slots.count - 1].pageIndex = index
                slots[slots.count - 1].image = image
            }
            armRotation()
            maybeApplyPages()
        }
        updateSpinner()
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
