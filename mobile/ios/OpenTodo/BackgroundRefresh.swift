import BackgroundTasks
import Foundation
import UIKit
import WebKit

/// The background refresh (ios-shell design D3): iOS decides when it runs, so a reminder
/// created on another device may arrive late. The hidden web view runs the web app for at
/// most `budget` seconds, which re-publishes reminders and widget data through the bridge.
/// The run ends when the web app says `backgroundDone` (shell-reminders-on D4); a web app
/// that never says it is given until `patience`.
@MainActor
enum BackgroundRefresh {
    static let identifier = "app.opentodo.refresh"
    static let interval: TimeInterval = 60 * 60
    static let budget: TimeInterval = 30
    /// How long a loaded page is waited for to say it is done, from the start of the run:
    /// inside `budget`, so a web app that does not know `backgroundDone` still ends well.
    static let patience: TimeInterval = 25
    /// The least time a loaded page gets for its effects to publish.
    static let settle: TimeInterval = 5

    /// How long to wait for `backgroundDone` once the page loaded, `elapsed` seconds into
    /// the run: until `patience`, and never less than `settle`. The shell cannot tell a web
    /// app that knows the capability from one that does not, so both get the same wait.
    static func wait(loadedAfter elapsed: TimeInterval) -> TimeInterval {
        max(settle, patience - max(0, elapsed))
    }

    /// The next run: an hour from now, which iOS treats as a hint, not a promise.
    static func request(now: Date = Date()) -> BGAppRefreshTaskRequest {
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = now.addingTimeInterval(interval)
        return request
    }

    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
            guard let refresh = task as? BGAppRefreshTask else { return task.setTaskCompleted(success: false) }
            Task { @MainActor in
                scheduleNext()
                guard let origin = Prefs.shared.serverOrigin.flatMap(URL.init(string:)) else {
                    return refresh.setTaskCompleted(success: false)
                }
                let run = HiddenRun.shared(for: origin)
                refresh.expirationHandler = { Task { @MainActor in run.stop() } }
                // Ticks on the Today widget go with the hourly run (ios-widget-complete D3).
                let ok = await run.start(budget: budget, path: run.busy ? nil : WidgetPublication.takeCompletePath())
                refresh.setTaskCompleted(success: ok)
            }
        }
        scheduleNext()
    }

    static func scheduleNext() {
        guard Prefs.shared.serverOrigin != nil else { return }
        try? BGTaskScheduler.shared.submit(request())
    }
}

/// The Today widget's ticks (ios-widget-complete D3): a widget cannot start the app, so the
/// queue waits for it, and the web app completes each task as its own op in a hidden run at
/// `/?complete=…`. The visible app never applies that address (it lists no `background`).
@MainActor
enum WidgetCompletions {
    /// Takes the queue and runs it, unless a run is going: that one is never replaced, and
    /// the ticks queued meanwhile follow it. Called when the app becomes active.
    static func apply() {
        guard let origin = Prefs.shared.serverOrigin.flatMap(URL.init(string:)) else { return }
        let run = HiddenRun.shared(for: origin)
        guard !run.busy, let path = WidgetPublication.takeCompletePath() else { return }
        // Leaving the app at once must not cut the run short; when iOS ends the extra time,
        // the run stops (what it stored goes out with the next sync).
        let background = BackgroundTask()
        background.id = UIApplication.shared.beginBackgroundTask(withName: "widget-complete") {
            // UIKit calls the expiration handler on the main thread.
            MainActor.assumeIsolated {
                run.stop()
                background.end()
            }
        }
        Task { @MainActor in
            _ = await run.start(budget: BackgroundRefresh.budget, path: path)
            background.end()
            apply()
        }
    }

    /// The extra time asked for, ended once.
    @MainActor
    final class BackgroundTask {
        var id: UIBackgroundTaskIdentifier = .invalid

        func end() {
            guard id != .invalid else { return }
            UIApplication.shared.endBackgroundTask(id)
            id = .invalid
        }
    }
}

/// The web app in a web view that is never shown: enough to let the app publish its
/// reminders and Today list, no screen and no prompts.
@MainActor
final class HiddenRun: NSObject, WKNavigationDelegate, WKUIDelegate {
    /// One web view for every run: it shares the cookie and storage store with the shown
    /// app anyway, so a new one each hour would only cost memory beside the live screen.
    private static var cached: HiddenRun?

    static func shared(for origin: URL) -> HiddenRun {
        if let cached, cached.origin == origin { return cached }
        let run = HiddenRun(origin: origin)
        cached = run
        return run
    }

    private let origin: URL
    private var webView: WKWebView?
    private var finish: ((Bool) -> Void)?
    /// Identifies the run a timer belongs to, so a leftover timer cannot end the next run.
    private var run: UUID?
    /// When the run began, for the wait after the page loaded.
    private var started: Date?
    /// The run's own page is in the web view: a message before that is the page of the run
    /// before, which stays loaded between runs.
    private var committed = false

    init(origin: URL) {
        self.origin = origin
        super.init()
    }

    /// A run is going; a new one would be refused.
    var busy: Bool { finish != nil }

    /// The app's address for a `path` of it (`/?complete=…`, ios-widget-complete D3), the start page without one.
    nonisolated static func address(origin: URL, path: String?) -> URL {
        path.flatMap { URL(string: $0, relativeTo: origin)?.absoluteURL } ?? origin
    }

    /// True when the page loaded; the web app publishes from its own effects. `path`: an
    /// address of the app to run at instead of its start page.
    func start(budget: TimeInterval, path: String? = nil) async -> Bool {
        // A slow run that is still going must not be replaced by a second one.
        guard finish == nil else { return false }
        let webView = self.webView ?? makeWebView()
        self.webView = webView
        let token = UUID()
        run = token
        started = Date()
        committed = false
        return await withCheckedContinuation { continuation in
            finish = { ok in
                guard let finish = self.finish else { return }
                self.finish = nil
                self.run = nil
                continuation.resume(returning: ok)
                _ = finish
            }
            webView.load(URLRequest(url: Self.address(origin: origin, path: path)))
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: UInt64(budget * 1_000_000_000))
                guard self.run == token else { return }
                self.finish?(false)
            }
        }
    }

    private func makeWebView() -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.limitsNavigationsToAppBoundDomains = AppBoundDomains.limitsNavigation(to: origin)
        // Weak: the web view holds the bridge, the bridge its host, and the run the web view.
        let host = BridgeHost(interactive: false, backgroundDone: { [weak self] in self?.done() })
        Bridge(origin: origin, actions: host)
            .install(into: config.userContentController, app: Version.app, capabilities: Bridge.backgroundCapabilities)
        // No screen: the background run refuses the page's requests for the position (as
        // everywhere, except through a frame's first empty document; see WebLocation).
        WebLocation.install(into: config.userContentController, allowing: nil)
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        return webView
    }

    func stop() {
        finish?(false)
        webView?.stopLoading()
    }

    /// The web app synced and handed over what follows from it (`backgroundDone`,
    /// shell-reminders-on D4): the run ends now, not at its limit.
    func done() {
        guard committed else { return }
        finish?(true)
    }

    /// No screen, so no capture of any kind, and nobody is asked.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.deny)
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        if run != nil { committed = true }
    }

    /// The background run never leaves the server and never opens a browser: a login wall's
    /// redirect is simply not followed, and the run ends without effect.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        let scheme = (url.scheme ?? "").lowercased()
        let stays = scheme == "about" || scheme == "data" || scheme == "blob" || Origin.same(url, origin)
        decisionHandler(stays ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // The web app says when it is done; one that does not is given until `patience`,
        // which is long enough for a sync that outlasts the page load. The budget caps it.
        let token = run
        let wait = BackgroundRefresh.wait(loadedAfter: Date().timeIntervalSince(started ?? Date()))
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            guard self.run == token else { return }
            self.finish?(true)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish?(false)
    }
}
