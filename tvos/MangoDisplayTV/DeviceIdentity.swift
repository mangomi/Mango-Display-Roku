// The display's permanent identity: "ATV" + 9 digits, generated once and
// kept forever. Roku persists its code in roRegistry (survives channel
// updates); the tvOS equivalent that additionally survives a delete +
// reinstall is the Keychain (APPLE_TV.md §1.1) - a re-installed display
// keeps its place in the user's webapp instead of minting a ghost device.

import Foundation
import Security

enum DeviceIdentity {
    private static let service = "com.mangodisplay.tv"
    private static let account = "displayCode"

    static func getOrCreateCode() -> String {
        if let existing = read(), !existing.isEmpty { return existing }
        let code = generate()
        write(code)
        return code
    }

    /// Dev helper (Roku's hidden `*` key): discard the identity and mint
    /// a fresh code. The old code's claim in the webapp is orphaned - the
    /// display must be re-claimed.
    static func regenerate() -> String {
        SecItemDelete(baseQuery() as CFDictionary)
        return getOrCreateCode()
    }

    /// "ATV" + 9 random digits 1-9. The prefix is the ONLY backend-visible
    /// difference from a Roku (confirmed by Dave 2026-08-26); the digit
    /// range mirrors the Roku/Tizen generator (BrightScript Rnd(9) yields
    /// 1..9, so codes never contain a zero).
    private static func generate() -> String {
        "ATV" + (0..<9).map { _ in String(Int.random(in: 1...9)) }.joined()
    }

    private static func read() -> String? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func write(_ code: String) {
        var attrs = baseQuery()
        attrs[kSecValueData as String] = Data(code.utf8)
        // tvOS has no user unlock; AfterFirstUnlock keeps the item readable
        // however early in boot the app launches
        attrs[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let status = SecItemAdd(attrs as CFDictionary, nil)
        if status == errSecDuplicateItem {
            SecItemUpdate(baseQuery() as CFDictionary,
                          [kSecValueData as String: Data(code.utf8)] as CFDictionary)
        }
    }

    private static func baseQuery() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }
}
