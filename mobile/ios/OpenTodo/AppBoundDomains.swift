import Foundation

/// App-Bound Domains (ios-shell design D2, ios-bridge-portable): a service worker, and
/// with it the precache and the offline start, exists only for a host the app declares
/// at build time. The portable build (the store's) declares no `WKAppBoundDomains` at all,
/// because the key alone switches off the bridge's script and message handler on every
/// other server. The one-server build sets `OPENTODO_APP_BOUND_HOST`, its "App-bound
/// domains" build phase adds the key, and it gets the installed web app's offline start.
enum AppBoundDomains {
    /// The build's declared hosts; none in the portable build.
    static var configured: [String] {
        let hosts = Bundle.main.object(forInfoDictionaryKey: "WKAppBoundDomains") as? [String] ?? []
        return hosts.map { $0.trimmingCharacters(in: .whitespaces).lowercased() }.filter { !$0.isEmpty }
    }

    /// Whether the web view may restrict navigation to the app-bound hosts: only when the
    /// server the user entered is one of them, because the restriction blocks every other.
    static func limitsNavigation(to origin: URL) -> Bool {
        guard let host = origin.host?.lowercased() else { return false }
        return configured.contains(host)
    }
}
