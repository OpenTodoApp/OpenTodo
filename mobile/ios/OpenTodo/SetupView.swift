import Network
import SwiftUI
import WebKit

/// First run: type the address of your own OpenTodo server, check it, continue.
/// Mirrors `mobile/android/app/src/main/java/app/opentodo/SetupActivity.kt`.
struct SetupView: View {
    @EnvironmentObject private var model: AppModel

    @State private var address = ""
    @State private var message: String?
    @State private var suggestion: String?
    @State private var checking = false
    /// The server behind a login wall the person can sign in to here (native-shells "Behind a login page").
    @State private var signInTarget: SignInTarget?
    @State private var signInOffer: SignInTarget?
    @FocusState private var editing: Bool
    /// A check that found no network runs again by itself when the network returns.
    @StateObject private var networkReturn = NetworkWait()

    /// The address as typed so far; Connect is active only while it is well-formed (ios-setup-address).
    private var parsed: ServerAddress { ServerAddress.parse(address) }

    private var insecure: Bool {
        if case .ok(_, true) = parsed { return true }
        return false
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://todo.example.com", text: $address)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($editing)
                        .onChange(of: editing) { focused in if !focused { showScheme() } }
                        .onSubmit { Task { await connect() } }
                        // "Sign in here" belongs to the address it was offered for: an edit takes it away.
                        .onChange(of: address) { _ in
                            if case let .ok(origin, _) = parsed, origin == signInOffer?.origin { return }
                            signInOffer = nil
                        }
                } header: {
                    // The system's grey header and footer are small text below 4.5:1 (the
                    // accessibility audit in FirstRunTests); both are in the full text colour.
                    Text("Server address")
                        .foregroundStyle(.primary)
                } footer: {
                    VStack(alignment: .leading, spacing: 8) {
                        if insecure {
                            Label("This connection is not encrypted.", systemImage: "lock.open")
                        }
                        Text("OpenTodo runs on your own server. Enter the address you use in the browser.")
                    }
                    .foregroundStyle(.primary)
                }

                if let message {
                    Section {
                        Label(message, systemImage: "exclamationmark.triangle")
                            .fixedSize(horizontal: false, vertical: true)
                        if let suggestion {
                            Button("Use \(suggestion)") { address = suggestion; self.suggestion = nil }
                        }
                        if let target = signInOffer {
                            Button("Sign in here") { signInTarget = target }
                        }
                    }
                }

                Section {
                    // A filled button: the accent as text (a dark teal) read as greyed out even
                    // while Connect could be tapped, worst in dark mode (#1137).
                    Button {
                        Task { await connect() }
                    } label: {
                        Text("Connect")
                            .frame(maxWidth: .infinity)
                            .overlay(alignment: .trailing) { if checking { ProgressView() } }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(checking || parsed == .invalid)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            }
            .navigationTitle("OpenTodo")
            .onAppear { if address.isEmpty { address = Prefs.shared.serverOrigin ?? "" } }
            .onDisappear { networkReturn.stop() }
            .sheet(item: $signInTarget) { target in
                SignInSheet(origin: target.origin) {
                    signInTarget = nil
                    signInOffer = nil
                    message = nil
                    openServer(target.origin, insecure: target.insecure)
                }
            }
        }
    }

    /// The field shows the address the app will use: an address typed without a scheme gets
    /// its `https://`, visibly, never silently (#1136).
    private func showScheme() {
        if case let .ok(origin, _) = parsed, origin != address { address = origin }
    }

    private func openServer(_ origin: String, insecure: Bool) {
        if insecure { Prefs.shared.insecureLocalServer = true }
        model.connect(origin)
    }

    private func connect() async {
        networkReturn.stop()
        message = nil
        suggestion = nil
        signInOffer = nil
        let result = parsed
        switch result {
        case .invalid:
            message = String(localized: "That is not a usable address.")
        case let .needsHttps(https):
            message = String(localized: "This server must be reached over https.")
            suggestion = https
        case let .ok(origin, insecure):
            address = origin
            checking = true
            let answer = await HealthCheck.check(origin: origin)
            checking = false
            switch answer.outcome {
            case .ok:
                openServer(origin, insecure: insecure)
            case .noNetwork:
                message = String(localized: "No answer from that address. Check the address and your connection.")
                // The first start needs a connection: try again by itself when the network
                // returns, for the address still in the field (as Android's SetupActivity does).
                networkReturn.start {
                    guard case let .ok(now, _) = parsed, now == origin, !checking else { return }
                    Task { await connect() }
                }
            case .notOpenTodo:
                message = String(localized: "That address does not answer like an OpenTodo server.")
            case .untrusted:
                message = String(localized: "The certificate of that server is not trusted by this device.")
            case .loginWall:
                message = String(localized: "This server is behind a login page. Sign in to it here; the app connects as soon as you're through.")
                signInOffer = SignInTarget(origin: origin, insecure: insecure)
            case .webPage:
                message = String(localized: "This address answers with a web page, not like an OpenTodo server. If your server is behind a login page, sign in to it here; otherwise check the address.")
                signInOffer = SignInTarget(origin: origin, insecure: insecure)
            }
        }
    }
}

struct SignInTarget: Identifiable, Equatable {
    let origin: String
    let insecure: Bool
    var id: String { origin }
}

/// First-run sign-in through a login wall (native-shells "Behind a login page"), the iOS side
/// of Android's `SignInActivity`: the server's address in a web view with the app's navigation
/// rule (`SignInFlow`) and no bridge. Each time a page of the server finishes loading, the
/// health check runs again with the web view's cookies; once it passes, `through` is called.
/// The web view shares the app's data store, so the wall's session carries into the app.
struct SignInSheet: View {
    let origin: String
    let through: () -> Void
    @StateObject private var controller: SignInController
    @Environment(\.dismiss) private var dismiss

    init(origin: String, through: @escaping () -> Void) {
        self.origin = origin
        self.through = through
        _controller = StateObject(wrappedValue: SignInController(origin: origin))
    }

    var body: some View {
        NavigationStack {
            SignInWebView(webView: controller.webView)
                .ignoresSafeArea(edges: .bottom)
                .navigationTitle(Text(verbatim: controller.host))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                }
        }
        .onAppear { controller.onThrough = through; controller.start() }
        // Cancelled: a check still running must not connect the app afterwards.
        .onDisappear { controller.cancel() }
    }
}

private struct SignInWebView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

@MainActor
final class SignInController: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    let origin: String
    let webView: WKWebView
    @Published private(set) var host: String
    var onThrough: (() -> Void)?
    private let server: URL?
    private let flow: SignInFlow?
    /// A main-frame navigation started and not yet committed: a policy decision now is its redirect.
    private var provisional = false
    private var checking = false
    /// A page of the server finished while a check ran: check once more when it ends.
    private var recheck = false
    private var done = false

    init(origin: String) {
        self.origin = origin
        let server = URL(string: origin)
        self.server = server
        self.flow = server.map { SignInFlow(server: $0) }
        self.host = server.map(SignInFlow.hostOf) ?? origin
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        self.webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsLinkPreview = false
    }

    /// A login wall's pages never get the microphone or the camera, and nobody is asked.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.deny)
    }

    /// The sheet went away: nothing connects from here any more.
    func cancel() {
        done = true
        onThrough = nil
        webView.stopLoading()
    }

    func start() {
        guard webView.url == nil, let server else { return }
        webView.load(URLRequest(url: URL(string: origin + "/") ?? server))
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, let flow, let server else { return decisionHandler(.cancel) }
        let scheme = (url.scheme ?? "").lowercased()
        let local = scheme == "about" || scheme == "data" || scheme == "blob"
        // A page of its own making only in a frame: in the main frame, with no site to show in
        // the title, it could pass for anything.
        if local { return decisionHandler(action.targetFrame.map { !$0.isMainFrame } == true ? .allow : .cancel) }
        guard let frame = action.targetFrame else {
            // A new window: the system browser, as in the app.
            if Bridge.safeExternal(url.absoluteString) { UIApplication.shared.open(url) }
            return decisionHandler(.cancel)
        }
        if !frame.isMainFrame { return decisionHandler(Origin.same(url, server) || flow.inSignIn ? .allow : .cancel) }
        let redirect = provisional
        if flow.decide(url, isRedirect: redirect, hasGesture: !redirect && action.navigationType == .linkActivated) == .stay {
            return decisionHandler(.allow)
        }
        // A refused redirect never goes to the browser (the session would land there): the
        // sign-in page stays, and Cancel closes the screen.
        if !redirect, Bridge.safeExternal(url.absoluteString) { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        provisional = true
        if let url = webView.url { flow?.started(url) }
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        provisional = false
        if let url = webView.url { host = SignInFlow.hostOf(url) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        provisional = false
        if let url = webView.url, let server, Origin.same(url, server) { checkThrough() }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        provisional = false
    }

    /// Through the wall when the health check passes with the web view's cookies.
    private func checkThrough() {
        guard !done, server != nil else { return }
        if checking { recheck = true; return }
        checking = true
        webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let answer = await HealthCheck.check(origin: self.origin, cookies: cookies)
                self.checking = false
                if answer.outcome == .ok, !self.done {
                    self.done = true
                    self.onThrough?()
                } else if self.recheck {
                    self.recheck = false
                    self.checkThrough()
                }
            }
        }
    }
}

/// The network coming back, as Android's SetupActivity watches for it: from no network to a
/// network. When a network is up from the start, the server itself is unreachable, so nothing
/// retries in a loop. The steps are pure, so the tests need no network.
struct NetworkReturn {
    enum Step: Equatable { case wait, retry, stop }
    private var sawOffline = false

    /// The next step for a path update: `satisfied` is whether a network is up.
    mutating func update(satisfied: Bool) -> Step {
        if !satisfied { sawOffline = true; return .wait }
        return sawOffline ? .retry : .stop
    }
}

/// Watches the network for one retry of the first-run check (NetworkReturn decides).
@MainActor
final class NetworkWait: ObservableObject {
    private var monitor: NWPathMonitor?
    private var steps = NetworkReturn()
    private var retry: (() -> Void)?

    func start(_ retry: @escaping () -> Void) {
        stop()
        let monitor = NWPathMonitor()
        steps = NetworkReturn()
        self.retry = retry
        monitor.pathUpdateHandler = { [weak self] path in
            let satisfied = path.status == .satisfied
            Task { @MainActor in self?.update(satisfied: satisfied, from: monitor) }
        }
        self.monitor = monitor
        monitor.start(queue: .main)
    }

    private func update(satisfied: Bool, from source: NWPathMonitor) {
        guard monitor === source else { return }
        switch steps.update(satisfied: satisfied) {
        case .wait: break
        case .retry:
            let then = retry
            stop()
            then?()
        case .stop: stop()
        }
    }

    func stop() {
        monitor?.cancel()
        monitor = nil
        retry = nil
    }
}
