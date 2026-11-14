import SwiftUI
import UIKit
import WebKit

/// The app itself: a full-screen web view on the configured origin, with the bridge, the
/// share hand-over and nothing else. Everything that needs a screen is the web app's;
/// what only the platform can do goes through `Bridge`.
@MainActor
final class ShellController: NSObject, ObservableObject {
    struct Failure: Equatable {
        enum Kind { case offline, cancelled, untrusted, signIn, other }
        let kind: Kind
        let detail: String
    }

    let origin: URL
    let webView: WKWebView
    @Published var failure: Failure?
    @Published private(set) var loaded = false
    /// The host of the page of another origin showing (a sign-in page), for the site bar.
    @Published private(set) var foreignHost: String?
    /// Which navigations off the server stay in the web view (a login wall, single sign-on).
    let flow: SignInFlow
    /// A main-frame navigation started and not yet committed: a policy decision now is its redirect.
    private var provisional = false
    private var bridge: Bridge?
    private let refresher = UIRefreshControl()
    /// Receives the files the web app saves (shell-repairs D3); made with the first one.
    private var saver: DownloadSaver?
    private var barsObserver: NSObjectProtocol?
    /// The name of the launch screen's colour in the asset catalog (`UILaunchScreen` in Info.plist).
    static let launchColor = "LaunchBackground"
    /// The longest the launch colour stays before the web view shows whatever it has.
    static let revealCap: TimeInterval = 5
    /// The web view shows: a page has loaded, a load failed, or the cap passed (shell-first-paint).
    private(set) var revealed = false
    /// The bars the web app asked for last; their icons come with the web view.
    private var bars: SystemBars?

    init(origin: URL) {
        self.origin = origin
        self.flow = SignInFlow(server: origin)
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.limitsNavigationsToAppBoundDomains = AppBoundDomains.limitsNavigation(to: origin)
        // The bridge goes in before the web view is created: WebKit copies the
        // configuration, so a script added afterwards may never run.
        let bridge = Bridge(origin: origin, actions: BridgeHost(interactive: true))
        bridge.install(into: config.userContentController,
                       app: Version.app,
                       capabilities: Bridge.capabilities(biometric: BiometricKeyStore.available, share: true, haptics: Haptics.available))
        self.webView = WKWebView(frame: .zero, configuration: config)
        self.bridge = bridge
        super.init()
        // Hidden over the launch colour until a page has loaded (shell-first-paint): the app
        // goes from its launch screen to the page with no empty web view between them.
        webView.alpha = 0
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(ShellController.revealCap * 1_000_000_000))
            self?.reveal()
        }
        webView.navigationDelegate = self
        webView.uiDelegate = self
        // No history back gesture (edge-swipe-menu, GitHub issue 1232): in an app an edge swipe
        // opens the menu, which the page does itself; screens have their own back buttons.
        webView.allowsBackForwardNavigationGestures = false
        // The page reaches every edge and pads itself by env(safe-area-inset-*) (viewport-fit=cover).
        // The default adjustment would also inset the scroll view, shrinking 100dvh by the top and
        // bottom insets and leaving the bar colour as a band under the tab bar.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
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

    /// The theme's bar colour behind the page: the status bar area, the first frame and the
    /// overscroll; and the icons on it (shell-repairs D7).
    func apply(_ bars: SystemBars) {
        self.bars = bars
        // Over the launch colour the system chooses the icons; the bars' own come with the page.
        StatusBar.show(lightIcons: revealed ? bars.lightIcons : nil)
        let color = bars.color
        webView.isOpaque = false
        webView.backgroundColor = color
        webView.scrollView.backgroundColor = color
        webView.underPageBackgroundColor = color
    }

    /// Shows the web view in place of the launch colour, with the status bar icons of its bars.
    func reveal() {
        guard !revealed else { return }
        revealed = true
        if let bars { StatusBar.show(lightIcons: bars.lightIcons) }
        UIView.animate(withDuration: 0.2) { self.webView.alpha = 1 }
    }

    /// Hands a download WebKit started to the saver, which asks where the file goes.
    private func save(_ download: WKDownload) {
        let saver = self.saver ?? DownloadSaver { [weak self] in self?.topViewController() }
        self.saver = saver
        saver.take(download)
    }

    /// The controller on top of the web view's window, for the export sheet.
    private func topViewController() -> UIViewController? {
        var top = webView.window?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed { top = presented }
        return top
    }

    @objc private func pulledToRefresh() {
        webView.reload()
    }

    func load() {
        flow.started(origin)
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

    /// Leaves a sign-in page (the site bar's close button): the flow ends and the server opens again.
    func leaveSignIn() {
        flow.end()
        foreignHost = nil
        failure = nil
        load()
    }

    /// A back or forward step to a page of another origin outside a flow is a sign-in page
    /// left in the history: the step goes on to the nearest page of the server before it.
    private func skipSignInPage(to url: URL) {
        let back = webView.backForwardList.backList // oldest first
        // A forward step to a sign-in page just stays where it is.
        guard let at = back.lastIndex(where: { $0.url == url }) else { return }
        if let server = back[..<at].last(where: { allowed($0.url) }) { webView.go(to: server) } else { load() }
    }

    /// The page that committed: the site bar names a host of another origin.
    private func showSite(_ url: URL?) {
        guard let url, SignInFlow.originOf(url) != nil else { return }
        foreignHost = allowed(url) ? nil : SignInFlow.hostOf(url)
    }

    private func record(_ error: Error) {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
        failure = Failure(kind: Self.kind(of: nsError), detail: nsError.localizedDescription)
        reveal()
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

extension ShellController {
    enum Route: Equatable { case allow, browser, refused, skipBack, leave }

    /// Where a navigation of the web view goes (native-shells "Sign-in flows stay in the
    /// shell"). `mainFrame` is nil for a new window; `provisional`: a main-frame navigation
    /// is under way, so this decision is its HTTP redirect (WebKit names no redirect, and
    /// keeps the type of the tap that started it). The redirect of the server's single
    /// sign-on start route to the provider stays, and so does the rest of the sign-in.
    /// `onSignInPage`: a page of another origin shows, so back leaves the sign-in.
    static func route(_ url: URL, mainFrame: Bool?, type: WKNavigationType, provisional: Bool,
                      onSignInPage: Bool = false, flow: SignInFlow, server: URL) -> Route {
        let scheme = (url.scheme ?? "").lowercased()
        if scheme == "about" || scheme == "data" || scheme == "blob" || scheme == "" { return .allow }
        guard let mainFrame else { return .browser }
        let onServer = Origin.same(url, server)
        // A frame of the page: the server's own, or one a sign-in page embeds (a captcha).
        if !mainFrame { return onServer || flow.inSignIn ? .allow : .browser }
        if type == .backForward {
            // Back on a sign-in page returns to the server; a sign-in page left in the history
            // once the flow reached the server is stepped over.
            if onSignInPage { return .leave }
            if !onServer { return .skipBack }
        }
        switch flow.decide(url, isRedirect: provisional, hasGesture: !provisional && type == .linkActivated) {
        case .stay: return .allow
        case .browser: return provisional && SignInFlow.originOf(url) != nil ? .refused : .browser
        }
    }
}

extension ShellController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { return decisionHandler(.cancel) }
        // A file the web app saves (an anchor with `download`): from the server or its own
        // object URLs it becomes a download; from anywhere else nothing is saved, and an
        // address of another site goes on as any link to it does.
        if action.shouldPerformDownload {
            if Downloads.saves(action: url, server: origin, shouldPerformDownload: true) { return decisionHandler(.download) }
            let scheme = (url.scheme ?? "").lowercased()
            if scheme == "blob" || scheme == "data" { return decisionHandler(.cancel) }
        }
        let mainFrame = action.targetFrame.map { $0.isMainFrame }
        switch Self.route(url, mainFrame: mainFrame, type: action.navigationType, provisional: provisional && mainFrame == true,
                          onSignInPage: foreignHost != nil, flow: flow, server: origin) {
        case .allow:
            decisionHandler(.allow)
        case .browser:
            // A new window (target="_blank") and any other origin outside a sign-in flow belong in
            // the system browser, with the same schemes the bridge allows.
            if Bridge.safeExternal(url.absoluteString) { UIApplication.shared.open(url) }
            decisionHandler(.cancel)
        case .refused:
            // A redirect the flow does not follow (a sign-in that timed out): never the browser,
            // never an empty screen, but a way to start again from the server.
            decisionHandler(.cancel)
            failure = Failure(kind: .signIn, detail: "")
            loaded = false
        case .skipBack:
            decisionHandler(.cancel)
            skipSignInPage(to: url)
        case .leave:
            decisionHandler(.cancel)
            leaveSignIn()
        }
    }

    /// An answer of the server that is a file (an export, an attachment) is saved; every
    /// other answer is shown as before.
    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard let url = response.response.url,
              Downloads.saves(response: url, server: origin, isAttachment: Downloads.isAttachment(response.response),
                              canShowMIMEType: response.canShowMIMEType)
        else { return decisionHandler(.allow) }
        decisionHandler(.download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        save(download)
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        // The navigation ended as a file: the page that shows stays, and is not a redirect's start.
        provisional = false
        refresher.endRefreshing()
        save(download)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        provisional = true
        if let url = webView.url { flow.started(url) }
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        provisional = false
        showSite(webView.url)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        provisional = false
        showSite(webView.url)
        loaded = true
        failure = nil
        reveal()
        refresher.endRefreshing()
        handOverShareIfNeeded()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { record(error) }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        provisional = false
        refresher.endRefreshing()
        // A step the policy cancelled ("frame load interrupted": a link handed to the browser, a
        // refused redirect with its own message) leaves the page that shows in place. Before
        // issue #1188 the provider's redirect ended here, as "The app could not be loaded".
        let nsError = error as NSError
        if nsError.domain == "WebKitErrorDomain" && nsError.code == 102 { return }
        loaded = false
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
        VStack(spacing: 0) {
            // The web view has no address bar: a page of another origin (a sign-in page) is named.
            if let host = shell.foreignHost { SiteBar(host: host) { shell.leaveSignIn() } }
            WebViewContainer(webView: shell.webView)
                .ignoresSafeArea(edges: shell.foreignHost == nil ? .all : .bottom)
        }
        // The launch screen's colour, behind the web view until it shows (shell-first-paint).
        .background(Color(ShellController.launchColor).ignoresSafeArea())
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
        case .signIn: return ("Signing in didn't continue in the app.", "Start again from your server's address.")
        case .cancelled, .other: return ("The app could not be loaded.", failure.detail)
        }
    }

    var body: some View {
        VStack(spacing: 12) {
            Text(message.title).font(.headline)
            Text(message.body).font(.subheadline).multilineTextAlignment(.center)
            Button(failure.kind == .signIn ? "Sign in here" : "Try again", action: retry).buttonStyle(.borderedProminent).padding(.top, 4)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }
}

/// The host of the sign-in page showing and the way back to the server.
struct SiteBar: View {
    let host: String
    let close: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "lock").font(.footnote).foregroundStyle(.secondary).accessibilityHidden(true)
            Text("Signing in on \(host)").font(.footnote).lineLimit(1).truncationMode(.middle)
            Spacer(minLength: 8)
            Button(action: close) { Image(systemName: "xmark").font(.body.weight(.semibold)).frame(width: 44, height: 44) }
                .accessibilityLabel("Back to OpenTodo")
                .accessibilityIdentifier("site-bar-close")
        }
        .padding(.leading, 16)
        .padding(.trailing, 4)
        .background(.bar)
        .accessibilityElement(children: .contain)
    }
}

struct WebViewContainer: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
