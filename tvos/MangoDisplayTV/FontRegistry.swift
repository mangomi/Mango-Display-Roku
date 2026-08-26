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

final class FontRegistry {
    static let shared = FontRegistry()

    /// portal family name -> registered PostScript name
    private var familyToPostScript: [String: String] = [:]
    private var fallbackRegular = "SourceSansPro-Regular"
    private var fallbackBold = "SourceSansPro-Bold"

    /// Call once at launch, before any overlay renders.
    func registerAll() {
        guard let fontsRoot = Bundle.main.resourceURL?.appendingPathComponent("fonts") else { return }
        // relative path under fonts/ (e.g. "gf/Lato.ttf") -> PostScript name
        var fileToPostScript: [String: String] = [:]
        let fm = FileManager.default
        guard let files = fm.enumerator(at: fontsRoot, includingPropertiesForKeys: nil) else {
            NSLog("[Mango] fonts folder missing from bundle")
            return
        }
        for case let url as URL in files {
            let ext = url.pathExtension.lowercased()
            guard ext == "ttf" || ext == "otf" else { continue }
            // .process scope: visible to this app for its lifetime, no
            // entitlements involved
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            // the PostScript name is read from the FILE, never guessed
            // from the filename - Font.custom needs the registered name
            if let descs = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor],
               let first = descs.first,
               let ps = CTFontDescriptorCopyAttribute(first, kCTFontNameAttribute) as? String {
                let rel = url.path.replacingOccurrences(of: fontsRoot.path + "/", with: "")
                fileToPostScript[rel] = ps
            }
        }
        if let ps = fileToPostScript["SourceSansPro-Regular.otf"] { fallbackRegular = ps }
        if let ps = fileToPostScript["SourceSansPro-Bold.otf"] { fallbackBold = ps }
        if let mapURL = Bundle.main.url(forResource: "fontMap", withExtension: "json"),
           let data = try? Data(contentsOf: mapURL),
           let map = (try? JSONSerialization.jsonObject(with: data)) as? [String: String] {
            for (family, file) in map {
                if let ps = fileToPostScript[file] { familyToPostScript[family] = ps }
            }
        }
        NSLog("[Mango] fonts: %d faces registered, %d families mapped", fileToPostScript.count, familyToPostScript.count)
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
