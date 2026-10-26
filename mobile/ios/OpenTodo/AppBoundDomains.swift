import Foundation

/// App-Bound Domains (ios-shell design D2): a service worker, and with it the
/// precache and the offline start, exists only for a host the app declares at build
/// time. The portable build declares none and needs the network; the one-server build
/// sets `OPENTODO_APP_BOUND_HOST` and gets the installed web app's offline behaviour.
enum AppBoundDomains {
    /// The build's declared hosts, without the placeholder a portable build carries.
    static var configured: [String] {
        let hosts = Bundle.main.object(forInfoDictionaryKey: "WKAppBoundDomains") as? [String] ?? []
        return hosts.map { $0.trimmingCharacters(in: .whitespaces).lowercased() }.filter { !$0.isEmpty && !$0.hasPrefix("none.") }
    }

    /// Whether the web view may restrict navigation to the app-bound hosts: only when the
    /// server the user entered is one of them, because the restriction blocks every other.
    static func limitsNavigation(to origin: URL) -> Bool {
        guard let host = origin.host?.lowercased() else { return false }
        return configured.contains(host)
    }
}
