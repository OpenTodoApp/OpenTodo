import SwiftUI
import UIKit
import WebKit

/// The app itself: a full-screen web view on the configured origin, with the bridge, the
/// share hand-over and nothing else. Everything that needs a screen is the web app's;
/// what only the platform can do goes through `Bridge`.
@MainActor
final class ShellController: NSObject, ObservableObject {
    struct Failure: Equatable {
        enum Kind { case offline, cancelled, untrusted, other }
        let kind: Kind
        let detail: String
    }

    let origin: URL
    let webView: WKWebView
    @Published var failure: Failure?
    @Published private(set) var loaded = false
    private var bridge: Bridge?
    private let refresher = UIRefreshControl()
    private var barsObserver: NSObjectProtocol?

    init(origin: URL) {
        self.origin = origin
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.limitsNavigationsToAppBoundDomains = AppBoundDomains.limitsNavigation(to: origin)
        // The bridge goes in before the web view is created: WebKit copies the
        // configuration, so a script added afterwards may never run.
        let bridge = Bridge(origin: origin, actions: BridgeHost(interactive: true))
        bridge.install(into: config.userContentController,
                       app: Version.app,
                       capabilities: Bridge.capabilities(biometric: BiometricKeyStore.available, share: true))
        self.webView = WKWebView(frame: .zero, configuration: config)
        self.bridge = bridge
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        // Pull to refresh: the gesture every iOS person tries when a page looks stale.
        refresher.addTarget(self, action: #selector(pulledToRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refresher
        // The last bars the app asked for, before the page draws (theme-engine D8).
        if let json = Prefs.shared.systemBars, let bars = SystemBars.parse(json) { apply(bars) }
        barsObserver = NotificationCenter.default.addObserver(forName: SystemBars.changed, object: nil, queue: .main) { [weak self] note in
            guard let json = note.userInfo?["json"] as? String, let bars = SystemBars.parse(json) else { return }
            MainActor.assumeIsolated { self?.apply(bars) }
        }
        #if DEBUG
        webView.isInspectable = true
        #endif
    }

    /// The theme's bar colour behind the page: the status bar area, the first frame and the overscroll.
    func apply(_ bars: SystemBars) {
        let color = bars.color
        webView.isOpaque = false
        webView.backgroundColor = color
        webView.scrollView.backgroundColor = color
        webView.underPageBackgroundColor = color
    }

    @objc private func pulledToRefresh() {
        webView.reload()
    }

    func load() {
        var request = URLRequest(url: origin)
        request.cachePolicy = .useProtocolCachePolicy
        webView.load(request)
    }

    /// Opens a path of the web app in the same web view, e.g. `/?task=…` from a widget or a reminder.
    func open(path: String) {
        guard let url = URL(string: path, relativeTo: origin)?.absoluteURL else { return }
        webView.load(URLRequest(url: url))
    }

    /// The domain is one the build declares, so the app-bound rules allow navigation only
    /// within it; anything else is refused before it is even loaded.
    private func allowed(_ url: URL) -> Bool {
        let scheme = (url.scheme ?? "").lowercased()
        if scheme == "about" || scheme == "" { return true }
        return Origin.same(url, origin)
    }

    private func record(_ error: Error) {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
        failure = Failure(kind: Self.kind(of: nsError), detail: nsError.localizedDescription)
    }

    private static func kind(of error: NSError) -> Failure.Kind {
        switch error.code {
        case NSURLErrorServerCertificateUntrusted, NSURLErrorServerCertificateHasBadDate,
             NSURLErrorServerCertificateHasUnknownRoot, NSURLErrorServerCertificateNotYetValid,
             NSURLErrorSecureConnectionFailed, NSURLErrorAppTransportSecurityRequiresSecureConnection,
             NSURLErrorClientCertificateRejected, NSURLErrorClientCertificateRequired:
            return .untrusted
        case NSURLErrorCancelled:
            return .cancelled
        case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorCannotFindHost,
             NSURLErrorCannotConnectToHost, NSURLErrorDNSLookupFailed, NSURLErrorTimedOut,
             NSURLErrorDataNotAllowed, NSURLErrorInternationalRoamingOff:
            return .offline
        default:
            return .other
        }
    }

    /// The share extension left files in the container: hand them over the way the browser
    /// extension does, once, and only on the capture screen that asked for them (`files=1`).
    private func handOverShareIfNeeded() {
        guard let url = webView.url,
              URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.contains(where: { $0.name == "files" && $0.value == "1" }) == true,
              let entry = ShareInbox.read(), let message = ShareInbox.message(entry) else { return }
        webView.evaluateJavaScript(ShareMap.handoverScript(message)) { [weak self] _, _ in
            ShareInbox.clear()
            self?.objectWillChange.send()
        }
    }
}

extension ShellController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        let scheme = (url.scheme ?? "").lowercased()
        if scheme == "about" || scheme == "data" || scheme == "blob" { return decisionHandler(.allow) }
        // A new window (target="_blank") and any other origin belong in the system browser,
        // with the same schemes the bridge allows — the page shows other people's content.
        if action.targetFrame == nil || !allowed(url) {
            if Bridge.safeExternal(url.absoluteString) { UIApplication.shared.open(url) }
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loaded = true
        failure = nil
        refresher.endRefreshing()
        handOverShareIfNeeded()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { record(error) }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        loaded = false
        refresher.endRefreshing()
        record(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
}

extension ShellController: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, Bridge.safeExternal(url.absoluteString) { UIApplication.shared.open(url) }
        return nil
    }
}

struct ShellView: View {
    @EnvironmentObject private var model: AppModel
    @StateObject private var shell: ShellController

    init(origin: URL) {
        _shell = StateObject(wrappedValue: ShellController(origin: origin))
    }

    var body: some View {
        WebViewContainer(webView: shell.webView)
            .ignoresSafeArea()
            .overlay {
                if let failure = shell.failure, !shell.loaded { FailureView(failure: failure) { shell.load() } }
            }
            .onAppear { if shell.webView.url == nil { shell.load() } }
            .onChange(of: model.pendingPath) { path in
                guard let path else { return }
                shell.open(path: path)
                model.pendingPath = nil
            }
    }
}

struct FailureView: View {
    let failure: ShellController.Failure
    let retry: () -> Void

    private var message: (title: String, body: String) {
        switch failure.kind {
        case .offline: return ("No connection to your server.", "Check the address and your network, then try again.")
        case .untrusted: return ("That server's certificate is not trusted.", "Install your server's certificate on this device, or use an address with a trusted certificate.")
        case .cancelled, .other: return ("The app could not be loaded.", failure.detail)
        }
    }

    var body: some View {
        VStack(spacing: 12) {
            Text(message.title).font(.headline)
            Text(message.body).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            Button("Try again", action: retry).buttonStyle(.borderedProminent).padding(.top, 4)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }
}

struct WebViewContainer: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
