import BackgroundTasks
import Foundation
import UIKit
import WebKit

/// The background refresh (ios-shell design D3): iOS decides when it runs, so a reminder
/// created on another device may arrive late. The hidden web view runs the web app for at
/// most `budget` seconds, which re-publishes reminders and widget data through the bridge.
@MainActor
enum BackgroundRefresh {
    static let identifier = "app.opentodo.refresh"
    static let interval: TimeInterval = 60 * 60
    static let budget: TimeInterval = 30

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
                let ok = await run.start(budget: budget)
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

/// The web app in a web view that is never shown: enough to let the app publish its
/// reminders and Today list, no screen and no prompts.
@MainActor
final class HiddenRun: NSObject, WKNavigationDelegate {
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

    init(origin: URL) {
        self.origin = origin
        super.init()
    }

    /// True when the page loaded; the web app publishes from its own effects.
    func start(budget: TimeInterval) async -> Bool {
        // A slow run that is still going must not be replaced by a second one.
        guard finish == nil else { return false }
        let webView = self.webView ?? makeWebView()
        self.webView = webView
        let token = UUID()
        run = token
        return await withCheckedContinuation { continuation in
            finish = { ok in
                guard let finish = self.finish else { return }
                self.finish = nil
                self.run = nil
                continuation.resume(returning: ok)
                _ = finish
            }
            webView.load(URLRequest(url: origin))
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
        Bridge(origin: origin, actions: BridgeHost(interactive: false))
            .install(into: config.userContentController, app: Version.app, capabilities: ["reminders", "widgets"])
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: config)
        webView.navigationDelegate = self
        return webView
    }

    func stop() {
        finish?(false)
        webView?.stopLoading()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // A few seconds for the app's effects to publish, then done; the budget caps it.
        let token = run
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            guard self.run == token else { return }
            self.finish?(true)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish?(false)
    }
}
