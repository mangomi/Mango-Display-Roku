// The device contract (MANIFEST.md): display.json, whether fetched from
// the asset base or arriving inline in a /wait reply. Parsed tolerantly
// rather than with strict Codable, mirroring the BrightScript's dynamic
// access - an old service or a null must degrade a field, not the manifest.
//
// All geometry anywhere in the manifest is canvas coordinates (1920x1080,
// origin top-left) - the portal's layout space, NOT the device's. This
// simulator device happens to map 1:1, like a Roku running FHD; nothing
// else should assume that.

import Foundation

/// One entry of display.json `pages[]`. The spike consumes the image and
/// rotation fields; overlays/targets/regions ride along in `raw` for the
/// parity phase so the parsing layer will not need to change shape.
struct Page {
    let image: String
    let imageHash: String?
    let delaySeconds: Double?
    let transition: String?
    let autoRotate: Bool
    /// things the client can activate (task checkboxes), or nil
    let targets: [String: Any]?
    /// areas where a pointer gesture is live (calendar swipe surfaces)
    let regions: [[String: Any]]
    let overlays: [[String: Any]]
    /// Comparable fingerprint of this page's overlay set (Roku's
    /// overlayConfigKey/FormatJson): live layers are rebuilt only when it
    /// changes, because a rebuild restarts every animation. sortedKeys
    /// keeps it stable across parses.
    let overlaysKey: String
    let raw: [String: Any]

    init?(_ dict: [String: Any]) {
        guard let img = dict["image"] as? String, !img.isEmpty else { return nil }
        image = img
        let hash = JSON.str(dict["imageHash"])
        imageHash = hash.isEmpty ? nil : hash
        delaySeconds = JSON.double(dict["delaySeconds"])
        transition = dict["transition"] as? String
        autoRotate = JSON.truthy(dict["autoRotate"])
        targets = JSON.obj(dict["targets"])
        regions = (JSON.arr(dict["regions"]) ?? []).compactMap { JSON.obj($0) }
        overlays = (JSON.arr(dict["overlays"]) ?? []).compactMap { JSON.obj($0) }
        if !overlays.isEmpty,
           let data = try? JSONSerialization.data(withJSONObject: overlays, options: [.sortedKeys]) {
            overlaysKey = String(data: data, encoding: .utf8) ?? ""
        } else {
            overlaysKey = ""
        }
        raw = dict
    }
}

struct DisplayManifest {
    /// Highest contract version this client understands. The service
    /// publishes SCHEMA_VERSION from render-service/capture.js (1 today);
    /// per MANIFEST.md a schema is bumped only when a field is removed or
    /// changes meaning, so seeing a higher one means "keep showing what
    /// you already have" - a stale screen beats a wrong one.
    static let knownSchema = 1

    let schema: Int
    let updateReason: String
    let imageOnly: Bool
    /// display-wide decorative overlays (snow, balloons, ...) - NOT per
    /// page; they continue across page transitions
    let effects: [[String: Any]]
    /// which remote gestures the user enabled: { pageSwipe,
    /// calendarScroll } - the same switches the portal obeys
    let gestures: [String: Any]
    let pages: [Page]

    init?(_ dict: [String: Any]) {
        guard let rawPages = JSON.arr(dict["pages"]), !rawPages.isEmpty else { return nil }
        let parsed = rawPages.compactMap { JSON.obj($0).flatMap(Page.init) }
        guard !parsed.isEmpty else { return nil }
        pages = parsed
        schema = JSON.int(dict["schema"]) ?? 1
        updateReason = JSON.str(dict["updateReason"])
        imageOnly = JSON.truthy(dict["imageOnly"])
        effects = (JSON.arr(dict["effects"]) ?? []).compactMap { JSON.obj($0) }
        gestures = JSON.obj(dict["gestures"]) ?? [:]
    }
}
