import AuthenticationServices
import ObjectiveC
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
    /// The first load of this launch has already fallen back to the web view's cache, so a
    /// second offline failure is a real failure, not another reason to retry (#1458).
    private var triedCache = false
    private var bridge: Bridge?
    private let refresher = UIRefreshControl()
    /// Whether that control is on, or the page handles the pull itself (pull-to-sync D4).
    private var pull = PullRefresh()
    private var pullObserver: NSObjectProtocol?
    /// Receives the files the web app saves (shell-repairs D3); made with the first one.
    private var saver: DownloadSaver?
    private var barsObserver: NSObjectProtocol?
    private var paintObserver: NSObjectProtocol?
    /// The name of the launch screen's colour in the asset catalog (`UILaunchScreen` in Info.plist).
    static let launchColor = "LaunchBackground"
    /// The longest the launch colour stays before the web view shows whatever it has.
    static let revealCap: TimeInterval = 5
    /// The web view shows: the page drew its first frame or loaded, a load failed, or the cap passed (shell-first-paint).
    private(set) var revealed = false
    /// The bars the web app asked for last; their icons come with the web view.
    private var bars: SystemBars?
    /// Single sign-on running in the system browser (app-sso-system-browser).
    private var authSession: ASWebAuthenticationSession?
    /// The next navigation to the start route stays in the web view: the server is older.
    private var webViewStart = false
    /// Takes the status bar tap for the page (status-bar-scroll-top).
    let scrollTopDecoy = ScrollTopDecoy()

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
        WebLocation.install(into: config.userContentController, allowing: origin)
        self.webView = WKWebView(frame: .zero, configuration: config)
        self.bridge = bridge
        super.init()
        // Hidden over the launch colour until the page has drawn its first frame, or has loaded
        // (shell-first-paint, shell-reveal-on-paint): the app goes from its launch screen to the
        // page with no empty web view between them.
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
        // No link previews (shell-touch, GitHub issue 1338): a long press on a link must not
        // lift a browser preview of it out of the app. Links in notes and comments keep the
        // text selection and its Copy.
        webView.allowsLinkPreview = false
        // The page reaches every edge and pads itself by env(safe-area-inset-*) (viewport-fit=cover).
        // The default adjustment would also inset the scroll view, shrinking 100dvh by the top and
        // bottom insets and leaving the bar colour as a band under the tab bar.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        // A tap on the status bar goes to the page (status-bar-scroll-top D1): the web view's
        // scroll view gives it up, and the decoy takes it and tells the page.
        webView.scrollView.scrollsToTop = false
        scrollTopDecoy.onTap = { [weak self] in self?.webView.evaluateJavaScript(ScrollTop.script) }
        webView.addSubview(scrollTopDecoy)
        // No previous, next and Done bar above the keyboard (ios-keyboard-bar D1).
        KeyboardBar.remove(from: webView)
        // Pull to refresh: the gesture every iOS person tries when a page looks stale. A web app
        // with its own pull to sync takes it over (pull-to-sync D4); an older one keeps this reload.
        refresher.addTarget(self, action: #selector(pulledToRefresh), for: .valueChanged)
        applyPull()
        pullObserver = NotificationCenter.default.addObserver(forName: PullRefresh.handled, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.pull.handledByPage()
                self?.applyPull()
            }
        }
        // The web app has drawn its first frame (shell-reveal-on-paint D2): no need to wait for its load.
        paintObserver = NotificationCenter.default.addObserver(forName: FirstPaint.painted, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.reveal() }
        }
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

    /// The refresh control is on the web view only while the shell answers the pull.
    private func applyPull() {
        if pull.native {
            if webView.scrollView.refreshControl == nil { webView.scrollView.refreshControl = refresher }
        } else {
            refresher.endRefreshing()
            webView.scrollView.refreshControl = nil
        }
    }

    func load() {
        flow.started(origin)
        triedCache = false
        var request = URLRequest(url: origin)
        request.cachePolicy = .useProtocolCachePolicy
        webView.load(request)
    }

    /// Opens the app from the web view's own cache, without the network. The portable build
    /// (the App Store one) has no service worker, so when the server is unreachable at launch
    /// this is its offline start: the cached page boots and reads its IndexedDB, and the web
    /// app syncs once the server answers again (#1458). A first-ever launch with nothing cached
    /// still fails, and then the offline screen is shown.
    private func loadFromCache() {
        triedCache = true
        var request = URLRequest(url: origin)
        request.cachePolicy = .returnCacheDataDontLoad
        webView.load(request)
    }

    /// Whether an errored load should fall back to the cache instead of showing the failure:
    /// only an offline failure of the first load of this launch, and only once. Pinned by
    /// ShellTests.testOfflineFirstLoadFallsBackToTheCacheOnce.
    static func shouldRetryFromCache(kind: Failure.Kind, triedCache: Bool, loaded: Bool) -> Bool {
        kind == .offline && !triedCache && !loaded
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
        let kind = Self.kind(of: nsError)
        if Self.shouldRetryFromCache(kind: kind, triedCache: triedCache, loaded: loaded) {
            loadFromCache()
            return
        }
        failure = Failure(kind: kind, detail: nsError.localizedDescription)
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

extension ShellController: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        webView.window ?? ASPresentationAnchor()
    }

    /// OpenTodo's own single sign-on: in the system browser when the server announces it
    /// (`app_sso`), otherwise in the web view as before.
    func beginSystemSignIn(_ start: URL) {
        guard authSession == nil else { return }
        var request = URLRequest(url: origin.appendingPathComponent("api/v1/health"), timeoutInterval: 10)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let supported = SystemSignIn.opensSheet(healthStatus: (response as? HTTPURLResponse)?.statusCode, healthBody: data)
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                if supported {
                    self.presentSystemSignIn(link: SystemSignIn.isLink(start))
                } else {
                    self.webViewStart = true
                    self.webView.load(URLRequest(url: start))
                }
            }
        }.resume()
    }

    private func presentSystemSignIn(link: Bool) {
        let pending = SystemSignIn.pending()
        let session = ASWebAuthenticationSession(url: SystemSignIn.startURL(server: origin, pending, link: link),
                                                 callbackURLScheme: SystemSignIn.callbackScheme) { [weak self] url, _ in
            DispatchQueue.main.async { self?.finishSystemSignIn(url, pending) }
        }
        session.presentationContextProvider = self
        authSession = session
        if !session.start() { authSession = nil }
    }

    /// The sheet closed. A code is redeemed by the page of the server showing, so the session
    /// cookie lands in the web view; an error code shows on the sign-in screen; a closed
    /// sheet leaves the screen as it was.
    private func finishSystemSignIn(_ url: URL?, _ pending: SystemSignIn.Pending) {
        authSession = nil
        // The code and its verifier go only to a page of the server (SystemSignIn.finish).
        let onServer = webView.url.map { Origin.same($0, origin) } ?? false
        switch SystemSignIn.finish(url, state: pending.state, onServer: onServer) {
        case .redeem(let code):
            webView.evaluateJavaScript(SystemSignIn.redeemScript(code: code, verifier: pending.verifier))
        case .showError(let code):
            webView.load(URLRequest(url: SystemSignIn.errorURL(server: origin, code: code)))
        case .stay:
            break
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
        if mainFrame == true, SystemSignIn.isStart(url, server: origin) {
            if webViewStart {
                webViewStart = false
            } else {
                decisionHandler(.cancel)
                beginSystemSignIn(url)
                return
            }
        }
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
        // Another page: the shell's pull to refresh is back until this page takes it over.
        pull.pageLoaded()
        applyPull()
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

    /// Voice capture (native-shells "Microphone for voice capture"): the microphone for a page
    /// of the server, without WebKit's own prompt; anything else refused without a prompt.
    /// iOS still asks once for the app's microphone (NSMicrophoneUsageDescription).
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let kind: MediaCapture.Kind
        switch type {
        case .microphone: kind = .microphone
        case .camera: kind = .camera
        default: kind = .cameraAndMicrophone
        }
        // `origin` is the top-level page's; the asking frame's is its own security origin.
        // Both must be the server: an embedded frame of another site never gets the microphone.
        let top = Origin.signature(scheme: origin.protocol, host: origin.host, port: origin.port)
        let asking = frame.securityOrigin
        let requester = Origin.signature(scheme: asking.protocol, host: asking.host, port: asking.port)
        decisionHandler(MediaCapture.grants(server: self.origin, top: top, requester: requester, kind: kind) ? .grant : .deny)
    }
}

/// Which capture request the web view grants: the microphone alone, to a page of the server.
/// WebKit decides a request as a whole, so one that also asks for the camera is refused (the
/// Android shell can grant its microphone part). Both apps read `microphone/cases.json`.
enum MediaCapture {
    enum Kind { case microphone, camera, cameraAndMicrophone }

    /// `top`: the top-level page's origin, `requester`: the asking frame's, both as
    /// `Origin.signature` writes them. Both must be the server's.
    static func grants(server: URL, top: String, requester: String, kind: Kind) -> Bool {
        let own = Origin.signature(server)
        return kind == .microphone && !(server.host ?? "").isEmpty && top == own && requester == own
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

/// The one scroll view iOS hands a status bar tap to (status-bar-scroll-top D1): 1 × 1
/// No keyboard accessory bar (ios-keyboard-bar D1): WebKit's content view supplies the
/// previous, next and Done bar through `inputAccessoryView`. The view is given a subclass
/// of its own class, made once, that supplies none. Done stays reachable through the
/// keyboard's return key and a tap outside. Guarded: without the content view, or if the
/// class cannot be made, nothing changes and the bar stays.
enum KeyboardBar {
    static let className = "OpenTodoContentViewWithoutBar"

    /// Removes the bar from this web view; returns whether it did.
    @discardableResult
    static func remove(from webView: WKWebView) -> Bool {
        guard let content = webView.scrollView.subviews.first(where: { NSStringFromClass(type(of: $0)).hasPrefix("WKContent") })
            ?? webView.scrollView.subviews.first(where: { NSStringFromClass(type(of: $0)) == className })
        else { return false }
        if NSStringFromClass(type(of: content)) == className { return true }
        guard let subclass = subclass(of: type(of: content)) else { return false }
        object_setClass(content, subclass)
        return true
    }

    private static func subclass(of base: AnyClass) -> AnyClass? {
        if let made = NSClassFromString(className) { return made }
        guard let made = objc_allocateClassPair(base, className, 0) else { return nil }
        let getter = #selector(getter: UIResponder.inputAccessoryView)
        guard let method = class_getInstanceMethod(base, getter) else {
            objc_disposeClassPair(made)
            return nil
        }
        let none: @convention(block) (AnyObject) -> UIView? = { _ in nil }
        class_addMethod(made, getter, imp_implementationWithBlock(none), method_getTypeEncoding(method))
        objc_registerClassPair(made)
        return made
    }
}

/// point, taller in content than its frame and scrolled off its top, so it always counts as
/// scrollable; its delegate tells the page and declines, so it never moves. It takes no
/// touches and is not on the accessibility tree.
final class ScrollTopDecoy: UIScrollView, UIScrollViewDelegate {
    var onTap: () -> Void = {}

    init() {
        super.init(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        contentSize = CGSize(width: 1, height: 3)
        contentOffset = CGPoint(x: 0, y: 1)
        scrollsToTop = true
        isUserInteractionEnabled = false
        showsVerticalScrollIndicator = false
        backgroundColor = .clear
        isAccessibilityElement = false
        accessibilityElementsHidden = true
        delegate = self
    }

    required init?(coder: NSCoder) { nil }

    func scrollViewShouldScrollToTop(_ scrollView: UIScrollView) -> Bool {
        onTap()
        return false
    }
}

struct WebViewContainer: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
