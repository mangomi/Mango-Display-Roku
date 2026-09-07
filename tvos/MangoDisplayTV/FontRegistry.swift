// The portal's Google Fonts catalog on tvOS. Roku bundles the TTFs that
// tools/fetch-roku-fonts.sh downloads into fonts/gf/ plus the Source Sans
// Pro fallback pair; this app bundles the SAME folder (a folder reference
// to ../fonts, so the two clients literally share the files) and registers
// every face at launch with CTFontManager.
//
// Families map to files via fontMap.json, emitted by the same generator
// run as source/fontMap.brs so the two clients can never disagree. The
// catalog is regular weight only, by design (Dave 2026-08-24) - the
// portal's "bold" for these families is browser-synthesized and neither
// TV client reproduces it. Unknown family -> Source Sans Pro, exactly like
// rokuFontFile()'s empty-string fallback.

import CoreText
import SwiftUI

// CDN fonts (Roku cd80449 / 050c1d8): the Roku no longer bundles the
// catalog (8.5MB blew its 4MB package limit) and fetches the files a
// manifest names from `fontBase` into its cache before applying pages.
// tvOS has no such limit, so it KEEPS the bundle as the instant path and
// adds the same fetch for any family the bundle lacks - a family added to
// the portal after this build then works without an app update. Fetched
// files live in Caches/fonts/ and are re-registered at every launch.

final class FontRegistry {
    static let shared = FontRegistry()

    /// portal family name -> registered PostScript name
    private var familyToPostScript: [String: String] = [:]
    /// portal family name -> file under fonts/ ("gf/Lato.ttf"), the whole
    /// catalog from fontMap.json whether bundled or not
    private var familyToFile: [String: String] = [:]
    private var fallbackRegular = "SourceSansPro-Regular"
    private var fallbackBold = "SourceSansPro-Bold"

    private static var cacheRoot: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("fonts", isDirectory: true)
    }

    /// Call once at launch, before any overlay renders.
    func registerAll() {
        guard let fontsRoot = Bundle.main.resourceURL?.appendingPathComponent("fonts") else { return }
        // relative path under fonts/ (e.g. "gf/Lato.ttf") -> PostScript name
        var fileToPostScript: [String: String] = [:]
        for root in [fontsRoot, Self.cacheRoot] {
            guard let files = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { continue }
            for case let url as URL in files {
                let ext = url.pathExtension.lowercased()
                guard ext == "ttf" || ext == "otf" else { continue }
                let rel = url.path.replacingOccurrences(of: root.path + "/", with: "")
                if let ps = Self.register(url) { fileToPostScript[rel] = ps }
            }
        }
        if let ps = fileToPostScript["SourceSansPro-Regular.otf"] { fallbackRegular = ps }
        if let ps = fileToPostScript["SourceSansPro-Bold.otf"] { fallbackBold = ps }
        if let mapURL = Bundle.main.url(forResource: "fontMap", withExtension: "json"),
           let data = try? Data(contentsOf: mapURL),
           let map = (try? JSONSerialization.jsonObject(with: data)) as? [String: String] {
            familyToFile = map
            for (family, file) in map {
                if let ps = fileToPostScript[file] { familyToPostScript[family] = ps }
            }
        }
        NSLog("[Mango] fonts: %d faces registered, %d families mapped", fileToPostScript.count, familyToPostScript.count)
    }

    /// Register one face for this process and return its PostScript name -
    /// read from the FILE, never guessed from the filename (Font.custom
    /// needs the registered name).
    @discardableResult
    private static func register(_ url: URL) -> String? {
        // .process scope: visible to this app for its lifetime, no
        // entitlements involved
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        guard let descs = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor],
              let first = descs.first else { return nil }
        return CTFontDescriptorCopyAttribute(first, kCTFontNameAttribute) as? String
    }

    /// The catalog files a manifest needs that are neither bundled nor
    /// cached yet (families the map does not know fall back to Source
    /// Sans Pro and are not fetched, like rokuFontFile()'s "").
    func missingFiles(for families: Set<String>) -> [String] {
        families.compactMap { fam in
            guard familyToPostScript[fam] == nil, let file = familyToFile[fam] else { return nil }
            return file
        }
    }

    /// Fetch `<base><file>` for each file into the cache and register it.
    /// Reports done whether or not every fetch succeeded (Roku FontTask):
    /// a bad network can only cost the fallback face, never the page.
    func fetch(files: [String], base: String) async {
        let root = Self.cacheRoot
        let prefix = base.hasSuffix("/") ? base : base + "/"
        for file in files {
            let dest = root.appendingPathComponent(file)
            if FileManager.default.fileExists(atPath: dest.path) {
                registerCached(dest, file: file)
                continue
            }
            guard let url = URL(string: prefix + file) else { continue }
            do {
                let (tmp, resp) = try await URLSession.shared.download(from: url)
                guard (resp as? HTTPURLResponse)?.statusCode == 200 else {
                    NSLog("[Mango] font fetch failed: %@ (falls back to Source Sans Pro)", file)
                    continue
                }
                try FileManager.default.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
                try? FileManager.default.removeItem(at: dest)
                try FileManager.default.moveItem(at: tmp, to: dest)
                registerCached(dest, file: file)
                NSLog("[Mango] font fetched: %@", file)
            } catch {
                NSLog("[Mango] font fetch failed: %@ (%@)", file, error.localizedDescription)
            }
        }
    }

    private func registerCached(_ url: URL, file: String) {
        guard let ps = Self.register(url) else { return }
        for (family, f) in familyToFile where f == file {
            familyToPostScript[family] = ps
        }
    }

    /// The overlay-label font rule shared by ClockOverlay.brs and
    /// CountdownOverlay.brs: the user's family when the catalog has it;
    /// otherwise Source Sans Pro, bold only in that fallback.
    func font(family: String?, bold: Bool, sizePx: Double) -> Font {
        if let family, let ps = familyToPostScript[family] {
            return .custom(ps, fixedSize: sizePx)
        }
        return .custom(bold ? fallbackBold : fallbackRegular, fixedSize: sizePx)
    }
}
