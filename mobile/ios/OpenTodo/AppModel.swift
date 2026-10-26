import Foundation
import WebKit

/// Which screen the shell shows and which server it talks to.
@MainActor
final class AppModel: ObservableObject {
    /// The one model the window shows; the home-screen shortcut needs to reach it too.
    static let shared = AppModel()

    /// The server origin the web app runs against; `nil` while the first-run screen is up.
    @Published private(set) var origin: URL?
    /// A path the web app should open once it is loaded (`/?task=…` from a notification).
    @Published var pendingPath: String?

    private let prefs = Prefs.shared

    init() {
        #if DEBUG
        // The UI tests start from a clean install every run.
        if ProcessInfo.processInfo.arguments.contains("-OPENTODO_RESET") {
            prefs.serverOrigin = nil
            prefs.insecureLocalServer = false
        }
        #endif
        if let override = prefs.addressOverride, case let .ok(origin, _) = ServerAddress.parse(override), let url = URL(string: origin) {
            self.origin = url
        } else if let saved = prefs.serverOrigin {
            self.origin = URL(string: saved)
        }
    }

    func connect(_ origin: String) {
        prefs.serverOrigin = origin
        self.origin = URL(string: origin)
    }

    /// Back to the first-run screen, keeping the address to edit; the old server's
    /// storage, schedule, widget data and biometric key go with it.
    func forgetServer() {
        webDataCleanup()
        Task { await Reminders.shared.clear() }
        WidgetPublication.publish("{\"updatedAt\":0,\"locked\":false,\"count\":0,\"overdue\":0,\"tasks\":[]}")
        ShareInbox.clear()
        BiometricKeyStore.forget()
        prefs.serverOrigin = nil
        origin = nil
    }

    /// `opentodo://task/<id>`, `opentodo://reminder/<id>?action=snooze`,
    /// `opentodo://share?files=1` from the share extension.
    func handle(url: URL) {
        guard url.scheme?.lowercased() == "opentodo" else { return }
        let id = url.lastPathComponent
        switch url.host?.lowercased() {
        case "task" where !id.isEmpty:
            pendingPath = "/?task=\(id)"
        case "reminder" where !id.isEmpty:
            let action = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first { $0.name == "action" }?.value
            pendingPath = "/?reminder=\(id)" + (action.map { "&action=\($0)" } ?? "")
        case "share":
            pendingPath = ShareInbox.read().map { ShareMap.path(title: $0.title, text: $0.text, withFiles: !$0.files.isEmpty) } ?? "/share"
        case "add":
            let text = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first { $0.name == "text" }?.value ?? ""
            pendingPath = "/?add=\(text.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? text)"
        default:
            break
        }
    }

    /// Only the shell's own cookie and website data, not the whole app's storage.
    private func webDataCleanup() {
        let store = WKWebsiteDataStore.default()
        store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {}
    }
}
