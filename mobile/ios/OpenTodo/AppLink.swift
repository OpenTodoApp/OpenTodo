import Foundation

/// Links to other apps (OpenSpec change app-links, design D6): a link such as
/// zotero://select/items/ABC is handed to the system only when its scheme is on the
/// list the page passes (the viewer's own) and not on this shell's own deny list.
/// The rules of internal/origin/applink.go and web/src/lib/appLinkGrammar.ts, pinned
/// by the shared bridge fixture app-links.json (the shared vectors).
enum AppLink {
    static let capability = "app-links"
    private static let maxURL = 2048
    private static let denied: Set<String> = ["javascript", "data", "vbscript", "file", "blob", "about", "filesystem", "view-source", "intent", "opentodo"]
    private static let ownRules: Set<String> = ["http", "https", "mailto"]
    private static let linkPattern = try! NSRegularExpression(pattern: "^([A-Za-z][A-Za-z0-9+.-]{0,31}):(.+)$", options: [.dotMatchesLineSeparators])
    private static let entryPattern = try! NSRegularExpression(pattern: "^([a-z][a-z0-9+.-]{0,31})(?::([a-z0-9][a-z0-9-]{0,31}))?$")

    private static func groups(_ re: NSRegularExpression, _ s: String) -> [String]? {
        let range = NSRange(s.startIndex..., in: s)
        guard let m = re.firstMatch(in: s, range: range), m.range == range else { return nil }
        return (0..<m.numberOfRanges).map { i in Range(m.range(at: i), in: s).map { String(s[$0]) } ?? "" }
    }

    /// The lower-cased scheme when `url` is a link into another app, else nil.
    static func scheme(_ url: String) -> String? {
        guard !url.isEmpty, url.utf8.count <= maxURL else { return nil }
        guard !url.unicodeScalars.contains(where: { $0.value <= 0x20 || $0.value == 0x7f }) else { return nil }
        guard let g = groups(linkPattern, url) else { return nil }
        let s = g[1].lowercased()
        return denied.contains(s) || ownRules.contains(s) ? nil : s
    }

    /// Whether `entry` may be on a person's list.
    static func validEntry(_ entry: String) -> Bool {
        guard let g = groups(entryPattern, entry) else { return false }
        return !denied.contains(g[1]) && !ownRules.contains(g[1])
    }

    /// Whether `list` lets `url` open: its scheme, or `scheme:action` matching the part before `?`, `/` or `#`.
    static func allows(_ list: [String], _ url: String) -> Bool {
        guard let s = scheme(url) else { return false }
        var rest = String(url.dropFirst(s.count + 1))
        if rest.hasPrefix("//") { rest = String(rest.dropFirst(2)) }
        let action = String(rest.prefix { $0 != "?" && $0 != "/" && $0 != "#" }).lowercased()
        return list.contains { e in
            guard validEntry(e) else { return false }
            let parts = e.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
            return parts[0] == s && (parts.count == 1 || parts[1] == action)
        }
    }

    /// The page's list (a JSON array of strings); empty when it does not parse.
    static func list(_ json: String) -> [String] {
        guard let data = json.data(using: .utf8), let a = try? JSONSerialization.jsonObject(with: data) as? [Any] else { return [] }
        return a.compactMap { $0 as? String }
    }
}
