// The Roku client parses every reply dynamically (ParseJson + guards)
// because the backend's field types wobble: booleans arrive as "true",
// numbers as strings, and vice versa. These helpers port PairingTask.brs's
// isTruthy/toS so this client is exactly as tolerant - a type wobble must
// degrade one field, never throw away a whole reply.

import Foundation

enum JSON {
    static func truthy(_ v: Any?) -> Bool {
        switch v {
        case let b as Bool: return b
        case let s as String: return s.lowercased() == "true"
        case let n as NSNumber: return n.intValue != 0
        default: return false
        }
    }

    /// Numbers render without a trailing ".0" - these values (major/minor)
    /// go straight into URLs the service parses as integers.
    static func str(_ v: Any?) -> String {
        switch v {
        case let s as String: return s
        case let n as NSNumber:
            if n.doubleValue == n.doubleValue.rounded() { return String(n.intValue) }
            return n.stringValue
        default: return ""
        }
    }

    static func int(_ v: Any?) -> Int? {
        switch v {
        case let n as NSNumber: return n.intValue
        case let s as String: return Int(s)
        default: return nil
        }
    }

    static func double(_ v: Any?) -> Double? {
        switch v {
        case let n as NSNumber: return n.doubleValue
        case let s as String: return Double(s)
        default: return nil
        }
    }

    static func obj(_ v: Any?) -> [String: Any]? { v as? [String: Any] }
    static func arr(_ v: Any?) -> [Any]? { v as? [Any] }
}
