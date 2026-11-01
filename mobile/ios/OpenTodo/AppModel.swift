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
    /// The home-screen shortcut's "Change server", which wipes data and therefore asks first.
    @Published var changeServerRequested = false

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
        prefs.systemBars = nil
        // The http warning belonged to the old address; the next one is checked afresh.
        prefs.insecureLocalServer = false
        origin = nil
    }

    /// `opentodo://task/<id>`, `opentodo://reminder/<id>?action=snooze`,
    /// `opentodo://share?files=1` from the share extension. Any app may open these, so the
    /// values are treated as data and never pasted into a path.
    func handle(url: URL) {
        guard url.scheme?.lowercased() == "opentodo" else { return }
        let id = url.lastPathComponent
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        switch url.host?.lowercased() {
        case "task" where !id.isEmpty:
            show(task: id)
        case "reminder" where !id.isEmpty:
            show(reminder: id, action: query.first { $0.name == "action" }?.value)
        case "share":
            pendingPath = ShareInbox.read().map { ShareMap.path(title: $0.title, text: $0.text, url: $0.url, withFiles: !$0.files.isEmpty) } ?? "/share"
        case "add":
            show(add: query.first { $0.name == "text" }?.value ?? "")
        default:
            break
        }
    }

    /// `/?task=<id>`: a reminder tap opens the task it belongs to. An empty id (the test
    /// notification carries one) only brings the app forward.
    func show(task id: String) {
        guard !id.isEmpty else { return }
        pendingPath = path([URLQueryItem(name: "task", value: id)])
    }

    /// `/?reminder=<id>&action=snooze|dismiss`: the web app's own reminder operations.
    func show(reminder id: String, action: String?) {
        guard !id.isEmpty else { return }
        var items = [URLQueryItem(name: "reminder", value: id)]
        if let action = action?.lowercased(), action == "snooze" || action == "dismiss" {
            items.append(URLQueryItem(name: "action", value: action))
        }
        pendingPath = path(items)
    }

    /// `/?add=<text>`: quick capture from another app.
    func show(add text: String) { pendingPath = path([URLQueryItem(name: "add", value: text)]) }

    /// Values are percent-encoded to unreserved characters only, so a `+`, an `&` or a
    /// non-ASCII letter cannot turn into a separator or a space on the other side.
    private static let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    private func path(_ items: [URLQueryItem]) -> String {
        let query = items.map { item in
            let value = (item.value ?? "").addingPercentEncoding(withAllowedCharacters: Self.unreserved) ?? ""
            return "\(item.name)=\(value)"
        }
        return "/?" + query.joined(separator: "&")
    }

    /// The app's own web storage: sessions, the cached web app and its IndexedDB.
    private func webDataCleanup() {
        let store = WKWebsiteDataStore.default()
        store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {}
    }
}
