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
        WidgetPublication.clearCompletions()
        WidgetPublication.publish("{\"updatedAt\":0,\"locked\":false,\"count\":0,\"overdue\":0,\"tasks\":[]}")
        ShareInbox.clear()
        BiometricKeyStore.forget()
        FocusLive.shared.clear()
        prefs.serverOrigin = nil
        prefs.systemBars = nil
        StatusBar.show(lightIcons: nil)
        // The http warning belonged to the old address; the next one is checked afresh.
        prefs.insecureLocalServer = false
        origin = nil
    }

    /// `opentodo://task/<id>`, `opentodo://reminder/<id>?action=done|snooze|dismiss`,
    /// `opentodo://focus[?action=pause|resume]` from the Focus Live Activity,
    /// `opentodo://share?files=1` from the share extension, `opentodo://add` and
    /// `opentodo://today` from the icon's quick actions. Any app may open these, so the
    /// values are treated as data and never pasted into a path.
    func handle(url: URL) {
        // ios-app-banner: Safari's banner on a task's page hands over that page's address.
        if let id = Self.taskID(webLink: url, server: origin) {
            show(task: id)
            return
        }
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
        case "focus":
            // focus-live-activity D4: the Live Activity's tap, Pause and Resume.
            pendingPath = FocusLink.path(action: query.first { $0.name == "action" }?.value)
        case "stats":
            // The Completed widget opens Statistics, as on Android.
            pendingPath = "/stats"
        case "today":
            pendingPath = "/today"
        default:
            break
        }
    }

    /// The task id of `<server>/task/<id>`, the address Safari's Smart App Banner hands over
    /// (ios-app-banner D5): only on the configured server's scheme, host and port, never another
    /// host's, and nil for any other address.
    nonisolated static func taskID(webLink url: URL, server: URL?) -> String? {
        guard let server, let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
              scheme == server.scheme?.lowercased(),
              let host = url.host?.lowercased(), host == server.host?.lowercased(),
              (url.port ?? (scheme == "https" ? 443 : 80)) == (server.port ?? (scheme == "https" ? 443 : 80))
        else { return nil }
        // The same paths as the server's and the worker's banner: no trailing slash, no "/" in the id.
        let parts = url.pathComponents
        guard !url.hasDirectoryPath, parts.count == 3, parts[1] == "task", !parts[2].isEmpty, !parts[2].contains("/") else { return nil }
        return parts[2]
    }

    /// The quick actions on the app icon (`UIApplicationShortcutItems` in project.yml): Add task
    /// and Today open the same addresses as the widgets; Change server asks first, because the
    /// reset discards the web app's storage, and that can hold ops which have not synced yet.
    /// Without a server the first-run screen is already up, so Change server does nothing.
    /// `atLaunch`: the dialog waits for `windowReady()`, since StatusBar replaces the window's
    /// root after the first pass and a dialog presented before would go with the old root.
    @discardableResult
    func perform(shortcut type: String, atLaunch: Bool = false) -> Bool {
        switch type {
        case "add-task": handle(url: URL(string: "opentodo://add")!)
        case "today": handle(url: URL(string: "opentodo://today")!)
        case "change-server":
            guard origin != nil else { return false }
            if atLaunch { changeServerAtLaunch = true } else { changeServerRequested = true }
        default: return false
        }
        return true
    }

    /// Change server chosen to launch the app, asked once the window's root is final.
    private var changeServerAtLaunch = false

    /// Called once StatusBar has installed its root controller (StatusBarInstaller).
    func windowReady() {
        guard changeServerAtLaunch else { return }
        changeServerAtLaunch = false
        changeServerRequested = true
    }

    /// `/?task=<id>`: a reminder tap opens the task it belongs to. An empty id (the test
    /// notification carries one) only brings the app forward.
    func show(task id: String) {
        guard !id.isEmpty else { return }
        pendingPath = path([URLQueryItem(name: "task", value: id)])
    }

    /// `/?reminder=<id>&action=done|snooze|dismiss`: the web app's own reminder operations.
    func show(reminder id: String, action: String?) {
        guard !id.isEmpty else { return }
        var items = [URLQueryItem(name: "reminder", value: id)]
        if let action = action?.lowercased(), Notifications.actions.contains(action) {
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
