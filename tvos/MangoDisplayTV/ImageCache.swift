// In-memory page image cache keyed by full URL. The URL embeds imageHash
// (MANIFEST.md: caches MUST key on content, not fetch time), so unchanged
// pixels keep an unchanged URL and a page rotation costs zero fetches and
// zero decodes. Memory on TV hardware is the scarcest thing the contract
// touches - hence prune(), the port of MainScene's releaseStale: the last
// reference is what keeps an old texture resident, and hours of retained
// stale versions is the slow famine that ends with the OS killing the app.

import UIKit

actor ImageCache {
    /// One cache for the whole app: page images, gif sheets, effect art
    /// all share it, so the prune set must name everything alive.
    static let shared = ImageCache()

    private var store: [String: UIImage] = [:]

    func image(at url: URL, timeout: TimeInterval) async -> UIImage? {
        if let hit = store[url.absoluteString] { return hit }
        var req = URLRequest(url: url, timeoutInterval: timeout)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200,
              let img = UIImage(data: data) else { return nil }
        store[url.absoluteString] = img
        return img
    }

    /// Drop everything no current page names.
    func prune(keep: Set<String>) {
        store = store.filter { keep.contains($0.key) }
    }

    /// Forget specific URLs so the next request re-fetches. Needed for
    /// effect sprites: the service regenerates them under FIXED filenames
    /// (unlike the content-hashed burst sheets), so a changed effects set
    /// must not trust bytes fetched for an earlier one - stale art
    /// otherwise lives as long as the app does.
    func evict(_ urls: Set<String>) {
        for u in urls { store.removeValue(forKey: u) }
    }
}
