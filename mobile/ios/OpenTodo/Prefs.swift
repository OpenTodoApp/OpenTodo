import Foundation

/// What the shell remembers between launches. Only the server address is stored here;
/// sessions, tasks and settings live in the web app's own storage on the server.
@MainActor
final class Prefs {
    static let shared = Prefs()

    private let defaults = UserDefaults.standard
    private static let serverKey = "server.origin"

    var serverOrigin: String? {
        get { defaults.string(forKey: Self.serverKey) }
        set {
            if let newValue { defaults.set(newValue, forKey: Self.serverKey) } else { defaults.removeObject(forKey: Self.serverKey) }
        }
    }

    /// True when the server is plain http on this device or the local network (accepted with a warning).
    var insecureLocalServer: Bool {
        get { defaults.bool(forKey: "server.insecure") }
        set { defaults.set(newValue, forKey: "server.insecure") }
    }

    /// Set by the first-run screen, deep links and the tests: `-OPENTODO_SERVER http://…`
    /// (a launch argument, so it also arrives through `UserDefaults`) or `OPENTODO_SERVER`.
    var addressOverride: String? {
        defaults.string(forKey: "OPENTODO_SERVER") ?? ProcessInfo.processInfo.environment["OPENTODO_SERVER"]
    }
}
