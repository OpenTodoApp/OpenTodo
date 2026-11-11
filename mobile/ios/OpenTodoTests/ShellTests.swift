import Network
import UIKit
import WebKit
import XCTest
@testable import OpenTodo

final class ServerAddressTests: XCTestCase {
    func testPublicHttps() {
        XCTAssertEqual(ServerAddress.parse("https://todo.example.com"),
                       .ok(origin: "https://todo.example.com", insecure: false))
        XCTAssertEqual(ServerAddress.parse("  todo.example.com  "),
                       .ok(origin: "https://todo.example.com", insecure: false))
        XCTAssertEqual(ServerAddress.parse("https://todo.example.com/"),
                       .ok(origin: "https://todo.example.com", insecure: false))
        XCTAssertEqual(ServerAddress.parse("https://todo.example.com:443"),
                       .ok(origin: "https://todo.example.com", insecure: false))
        XCTAssertEqual(ServerAddress.parse("https://todo.example.com:8443/todo"),
                       .invalid)
    }

    func testPlainHttpIsLocalOnly() {
        XCTAssertEqual(ServerAddress.parse("http://192.168.1.4:8080"),
                       .ok(origin: "http://192.168.1.4:8080", insecure: true))
        XCTAssertEqual(ServerAddress.parse("http://localhost:8080"),
                       .ok(origin: "http://localhost:8080", insecure: true))
        XCTAssertEqual(ServerAddress.parse("http://todo.local"),
                       .ok(origin: "http://todo.local", insecure: true))
        XCTAssertEqual(ServerAddress.parse("http://todo.example.com"),
                       .needsHttps(suggestion: "https://todo.example.com"))
        XCTAssertEqual(ServerAddress.parse("http://todo.example.com:8080"),
                       .needsHttps(suggestion: "https://todo.example.com:8080"))
    }

    /// ios-setup-address: what the first-run field turns an address into, which is what it then shows.
    func testWithoutASchemeTheAddressIsHttps() {
        XCTAssertEqual(ServerAddress.parse("todo.example.com"), .ok(origin: "https://todo.example.com", insecure: false))
        XCTAssertEqual(ServerAddress.parse("todo.example.com:8443"), .ok(origin: "https://todo.example.com:8443", insecure: false))
        // A local address without a scheme is https too: plain http only when typed.
        XCTAssertEqual(ServerAddress.parse("192.168.1.4:8080"), .ok(origin: "https://192.168.1.4:8080", insecure: false))
        XCTAssertEqual(ServerAddress.parse("localhost:8080"), .ok(origin: "https://localhost:8080", insecure: false))
    }

    func testExplicitHttpIsKeptAndMarkedInsecure() {
        XCTAssertEqual(ServerAddress.parse("http://192.168.1.4:8080/"), .ok(origin: "http://192.168.1.4:8080", insecure: true))
        XCTAssertEqual(ServerAddress.parse("http://localhost"), .ok(origin: "http://localhost", insecure: true))
    }

    func testUppercaseSchemeAndHost() {
        XCTAssertEqual(ServerAddress.parse("HTTPS://Todo.Example.COM"), .ok(origin: "https://todo.example.com", insecure: false))
        XCTAssertEqual(ServerAddress.parse("Https://todo.example.com:443/"), .ok(origin: "https://todo.example.com", insecure: false))
        XCTAssertEqual(ServerAddress.parse("HTTP://192.168.1.4:8080"), .ok(origin: "http://192.168.1.4:8080", insecure: true))
        XCTAssertEqual(ServerAddress.parse("HTTP://todo.example.com"), .needsHttps(suggestion: "https://todo.example.com"))
    }

    func testTrailingSlashAndPath() {
        XCTAssertEqual(ServerAddress.parse("todo.example.com/"), .ok(origin: "https://todo.example.com", insecure: false))
        XCTAssertEqual(ServerAddress.parse("todo.example.com."), .ok(origin: "https://todo.example.com", insecure: false))
        XCTAssertEqual(ServerAddress.parse("todo.example.com/todo"), .invalid)
        XCTAssertEqual(ServerAddress.parse("https://todo.example.com/todo/"), .invalid)
    }

    func testUnicodeHostIsSentInItsAsciiForm() {
        XCTAssertEqual(ServerAddress.parse("bücher.example"), .ok(origin: "https://xn--bcher-kva.example", insecure: false))
        XCTAssertEqual(ServerAddress.parse("https://Todo.MÜNCHEN.de:8443/"), .ok(origin: "https://todo.xn--mnchen-3ya.de:8443", insecure: false))
        XCTAssertEqual(ServerAddress.parse("https://xn--bcher-kva.example"), .ok(origin: "https://xn--bcher-kva.example", insecure: false))
        XCTAssertEqual(ServerAddress.punycode("bücher"), "bcher-kva")
        XCTAssertEqual(ServerAddress.punycode("привет"), "b1agh1afp")
        XCTAssertEqual(ServerAddress.punycode("例え"), "r8jz45g")
    }

    func testRefused() {
        for input in ["", "   ", "todo example.com", "ftp://todo.example.com", "https://", "https://todo.example.com/?a=1",
                      "https://todo.example.com/#frag", "https://user:pw@todo.example.com", "javascript:alert(1)"] {
            XCTAssertEqual(ServerAddress.parse(input), .invalid, input)
        }
    }

    func testLocalRanges() {
        for host in ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.254", "192.168.0.10", "169.254.1.1",
                     "::1", "fd00::1", "fe80::1", "todo.local", "localhost", "server.localhost"] {
            XCTAssertTrue(ServerAddress.isLocal(host), host)
        }
        for host in ["172.32.0.1", "8.8.8.8", "todo.example.com", "192.169.0.1"] {
            XCTAssertFalse(ServerAddress.isLocal(host), host)
        }
    }
}

final class HealthCheckTests: XCTestCase {
    func testHealthAnswerIsOpenTodo() {
        let answer = HealthCheck.classify(status: 200, body: Data(#"{"status":"ok","version":"v0.14.0"}"#.utf8))
        XCTAssertEqual(answer.outcome, .ok)
        XCTAssertEqual(answer.version, "v0.14.0")
    }

    func testAnythingElseIsNotOpenTodo() {
        XCTAssertEqual(HealthCheck.classify(status: 200, body: Data(#"{"status":"ok"}"#.utf8)).outcome, .notOpenTodo)
        XCTAssertEqual(HealthCheck.classify(status: 200, body: Data("hello".utf8)).outcome, .notOpenTodo)
        XCTAssertEqual(HealthCheck.classify(status: 404, body: Data(#"{"status":"ok","version":"x"}"#.utf8)).outcome, .notOpenTodo)
    }

    /// health-route-alias: `/api/v1/health` first, `/healthz` only when that is not settled.
    func testRoutesInOrder() async {
        XCTAssertEqual(HealthCheck.paths, ["/api/v1/health", "/healthz"])
        let ok = HealthCheck.Answer(outcome: .ok, version: "1.0.1")
        var asked = 0
        let older = await HealthCheck.combine(HealthCheck.Answer(outcome: .notOpenTodo)) { asked += 1; return HealthCheck.Answer(outcome: .ok, version: "1.0.0") }
        XCTAssertEqual(older.outcome, .ok)
        XCTAssertEqual(older.version, "1.0.0")
        XCTAssertEqual(asked, 1)
        for first in [ok, HealthCheck.Answer(outcome: .noNetwork), HealthCheck.Answer(outcome: .untrusted)] {
            let answer = await HealthCheck.combine(first) { asked += 1; return ok }
            XCTAssertEqual(answer.outcome, first.outcome)
        }
        XCTAssertEqual(asked, 1)
    }

    func testErrorClassification() {
        let offline = NSError(domain: NSURLErrorDomain, code: NSURLErrorCannotConnectToHost)
        XCTAssertEqual(HealthCheck.classify(offline), .noNetwork)
        let untrusted = NSError(domain: NSURLErrorDomain, code: NSURLErrorServerCertificateUntrusted)
        XCTAssertEqual(HealthCheck.classify(untrusted), .untrusted)
        let wrapped = NSError(domain: "x", code: 1, userInfo: [NSUnderlyingErrorKey: untrusted])
        XCTAssertEqual(HealthCheck.classify(wrapped), .untrusted)
    }
}

/// The bridge on a real page (ios-bridge-portable): the shell loads a page from a small
/// server in this process and the page reports what it sees. Only the page's own script
/// reports, with a request to its server, so the answer does not depend on an API that
/// App-Bound Domains can switch off. The server is on this Mac's network address, not on
/// 127.0.0.1: WebKit treats localhost and loopback addresses as app-bound whatever the
/// app declares (`shouldTreatURLProtocolAsAppBound` in WebPageProxy.cpp), so a loopback
/// page would see the bridge even in a build that denies it to every real server.
@MainActor
final class BridgeOnAServerTests: XCTestCase {
    func testThePageSeesTheBridge() async throws {
        let host = try XCTUnwrap(PageServer.networkAddress(), "this device has a network address besides loopback")
        let server = try await PageServer.start(host: host)
        defer { server.stop() }
        let origin = try XCTUnwrap(URL(string: "http://\(host):\(server.port)"))
        let shell = ShellController(origin: origin)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        shell.webView.frame = window.bounds
        window.addSubview(shell.webView)
        window.isHidden = false
        defer { window.isHidden = true }
        shell.load()
        // 90 s, not 30: on a cold CI simulator the first web view launch can take longer than
        // half a minute (two of six main runs on 2026-11-10 timed out with a healthy bridge).
        let report = try await server.report(timeout: 90)
        XCTAssertEqual(report["origin"], origin.absoluteString)
        XCTAssertEqual(report["handler"], "object", "the message handler reaches the page: \(report)")
        XCTAssertEqual(report["shell"], "object", "window.opentodoShell exists: \(report)")
        XCTAssertEqual(report["platform"], "ios")
    }
}

/// The navigation rule of the web view (native-shells "Sign-in flows stay in the shell"),
/// the cases of the Android app's SignInFlowTest.
final class SignInFlowTests: XCTestCase {
    private let server = URL(string: "https://todo.example.com")!
    private var now = Date(timeIntervalSince1970: 1_000_000)
    private lazy var flow = SignInFlow(server: server) { [unowned self] in self.now }

    private func u(_ s: String) -> URL { URL(string: s)! }
    private func link(_ s: String) -> SignInFlow.Decision { flow.decide(u(s), isRedirect: false, hasGesture: true) }
    private func redirect(_ s: String) -> SignInFlow.Decision { flow.decide(u(s), isRedirect: true, hasGesture: false) }
    private func script(_ s: String) -> SignInFlow.Decision { flow.decide(u(s), isRedirect: false, hasGesture: false) }

    func testTheServerAlwaysStays() {
        XCTAssertEqual(link("https://todo.example.com/today"), .stay)
        XCTAssertEqual(link("https://TODO.example.com:443/?task=1"), .stay)
        XCTAssertEqual(redirect("https://todo.example.com/"), .stay)
        XCTAssertFalse(flow.inSignIn)
    }

    func testLinksToOtherSitesOpenTheBrowser() {
        XCTAssertEqual(link("https://example.org/outside"), .browser)
        XCTAssertEqual(script("https://example.org/outside"), .browser)
        XCTAssertEqual(link("http://todo.example.com/"), .browser)
        XCTAssertEqual(link("https://todo.example.com:8443/"), .browser)
        XCTAssertEqual(link("mailto:someone@example.org"), .browser)
        XCTAssertFalse(flow.inSignIn)
    }

    func testLoginWallChain() {
        XCTAssertEqual(redirect("https://auth.example.com/login?rd=https://todo.example.com/"), .stay)
        XCTAssertTrue(flow.inSignIn)
        flow.started(u("https://auth.example.com/login?rd=https://todo.example.com/"))
        XCTAssertEqual(link("https://auth.example.com/login"), .stay)
        XCTAssertEqual(redirect("https://id.example.net/authorize?client_id=wall"), .stay)
        flow.started(u("https://id.example.net/authorize?client_id=wall"))
        XCTAssertEqual(script("https://auth.example.com/callback?code=1"), .stay)
        XCTAssertEqual(redirect("https://todo.example.com/"), .stay)
        flow.started(u("https://todo.example.com/"))
        XCTAssertFalse(flow.inSignIn)
        XCTAssertEqual(link("https://auth.example.com/settings"), .browser)
    }

    /// Issue #1188: OpenTodo's own single sign-on, a same-origin link to the start route, then the server's redirect.
    func testSingleSignOn() {
        XCTAssertEqual(link("https://todo.example.com/api/v1/auth/oidc/start"), .stay)
        XCTAssertEqual(redirect("https://sso.example.com/realms/home/protocol/openid-connect/auth?state=x"), .stay)
        flow.started(u("https://sso.example.com/realms/home/protocol/openid-connect/auth?state=x"))
        XCTAssertEqual(link("https://sso.example.com/realms/home/login-actions/authenticate"), .stay)
        XCTAssertEqual(redirect("https://todo.example.com/api/v1/auth/oidc/callback?code=1&state=x"), .stay)
        XCTAssertFalse(flow.inSignIn)
    }

    func testALinkOnTheSignInPageToAnotherSiteOpensTheBrowser() {
        _ = redirect("https://auth.example.com/login")
        flow.started(u("https://auth.example.com/login"))
        XCTAssertEqual(link("https://example.org/privacy"), .browser)
        XCTAssertTrue(flow.inSignIn)
        XCTAssertEqual(link("https://auth.example.com/reset"), .stay)
    }

    func testARedirectFromAnotherSiteDoesNotStartAFlow() {
        flow.started(u("https://example.org/page"))
        XCTAssertEqual(redirect("https://evil.example.net/"), .browser)
        XCTAssertFalse(flow.inSignIn)
    }

    func testTheFlowTimesOut() {
        _ = redirect("https://auth.example.com/login")
        flow.started(u("https://auth.example.com/login"))
        now += SignInFlow.timeout - 1
        XCTAssertEqual(link("https://auth.example.com/next"), .stay)
        now += SignInFlow.timeout + 1
        XCTAssertFalse(flow.inSignIn)
        XCTAssertEqual(redirect("https://id.example.net/authorize"), .browser)
        XCTAssertEqual(script("https://id.example.net/authorize"), .browser)
        XCTAssertEqual(link("https://auth.example.com/login"), .stay)
        XCTAssertEqual(redirect("https://auth.example.com/done"), .stay)
        XCTAssertFalse(flow.inSignIn)
        XCTAssertEqual(redirect("https://todo.example.com/"), .stay)
        flow.started(u("https://todo.example.com/"))
        XCTAssertEqual(link("https://auth.example.com/login"), .browser)
    }

    func testLeavingEndsTheFlow() {
        _ = redirect("https://auth.example.com/login")
        flow.started(u("https://auth.example.com/login"))
        flow.end()
        XCTAssertFalse(flow.inSignIn)
        XCTAssertEqual(script("https://id.example.net/authorize"), .browser)
        flow.started(u("https://todo.example.com/"))
        XCTAssertEqual(redirect("https://auth.example.com/login"), .stay)
    }

    func testOrigins() {
        XCTAssertEqual(SignInFlow.originOf(u("https://Todo.Example.com:443/a?b#c")), "https://todo.example.com:443")
        XCTAssertNil(SignInFlow.originOf(u("about:blank")))
        XCTAssertNil(SignInFlow.originOf(u("mailto:a@example.org")))
        XCTAssertEqual(SignInFlow.hostOf(u("https://auth.example.com:8443/login")), "auth.example.com:8443")
        XCTAssertEqual(SignInFlow.hostOf(u("https://auth.example.com/login")), "auth.example.com")
    }
}

/// What the shell does with each navigation (issue #1188): before the fix the provider's
/// page, reached by the start route's redirect, was handed to Safari.
@MainActor
final class ShellRouteTests: XCTestCase {
    private let server = URL(string: "https://todo.example.com")!

    private func route(_ s: String, _ flow: SignInFlow, main: Bool? = true, type: WKNavigationType = .other,
                       provisional: Bool = false, onSignInPage: Bool = false) -> ShellController.Route {
        ShellController.route(URL(string: s)!, mainFrame: main, type: type, provisional: provisional,
                              onSignInPage: onSignInPage, flow: flow, server: server)
    }

    func testSingleSignOnStaysInTheWebView() {
        let flow = SignInFlow(server: server)
        XCTAssertEqual(route("https://todo.example.com/api/v1/auth/oidc/start", flow, type: .linkActivated), .allow)
        // WebKit keeps the tap's type on the redirect that follows it.
        XCTAssertEqual(route("https://sso.example.com/auth?state=x", flow, type: .linkActivated, provisional: true), .allow)
        flow.started(URL(string: "https://sso.example.com/auth?state=x")!)
        XCTAssertEqual(route("https://captcha.example.net/frame", flow, main: false), .allow)
        XCTAssertEqual(route("https://sso.example.com/login-actions/authenticate", flow, type: .formSubmitted), .allow)
        XCTAssertEqual(route("https://todo.example.com/api/v1/auth/oidc/callback?code=1", flow, type: .formSubmitted, provisional: true), .allow)
        XCTAssertFalse(flow.inSignIn)
    }

    func testOutsideAFlowOtherSitesOpenTheBrowser() {
        let flow = SignInFlow(server: server)
        XCTAssertEqual(route("https://example.org/", flow, type: .linkActivated), .browser)
        XCTAssertEqual(route("https://example.org/", flow, main: nil, type: .linkActivated), .browser)
        XCTAssertEqual(route("https://example.org/frame", flow, main: false), .browser)
        XCTAssertEqual(route("mailto:a@example.org", flow, type: .linkActivated), .browser)
        XCTAssertEqual(route("about:blank", flow), .allow)
    }

    func testARefusedRedirectNeverOpensTheBrowser() {
        let flow = SignInFlow(server: server)
        flow.started(URL(string: "https://example.org/page")!)
        XCTAssertEqual(route("https://evil.example.net/", flow, provisional: true), .refused)
    }

    func testBackLeavesTheSignInAndStepsOverItsPages() {
        let flow = SignInFlow(server: server)
        XCTAssertEqual(route("https://todo.example.com/today", flow, type: .backForward, onSignInPage: true), .leave)
        XCTAssertEqual(route("https://sso.example.com/auth", flow, type: .backForward), .skipBack)
        XCTAssertEqual(route("https://todo.example.com/today", flow, type: .backForward), .allow)
    }
}

/// The whole round trip on real pages (issue #1188): the server's start route redirects
/// to a provider on another origin, whose page sends the person back to the server's
/// callback, which redirects to the app. The app's page then reports from inside the
/// shell, with the bridge, so nothing went to Safari.
@MainActor
final class SignInOnAServerTests: XCTestCase {
    func testSingleSignOnReturnsToTheApp() async throws {
        let host = try XCTUnwrap(PageServer.networkAddress(), "this device has a network address besides loopback")
        let server = try await PageServer.start(host: host)
        defer { server.stop() }
        let provider = try await PageServer.start(host: "127.0.0.1")
        defer { provider.stop() }
        let origin = try XCTUnwrap(URL(string: "http://\(host):\(server.port)"))
        let providerOrigin = "http://127.0.0.1:\(provider.port)"
        server.route("/api/v1/auth/oidc/start", .redirect("302 Found", to: "\(providerOrigin)/auth?state=x"))
        server.route("/api/v1/auth/oidc/callback", .redirect("303 See Other", to: "/?signed=1"))
        provider.route("/auth", PageServer.Response(body: """
        <!doctype html><meta charset="utf-8"><title>provider</title>
        <form id="f" method="get" action="\(origin.absoluteString)/api/v1/auth/oidc/callback"><input type="hidden" name="code" value="1"></form>
        <script>setTimeout(function () { document.getElementById('f').submit() }, 200)</script>
        """))

        let shell = ShellController(origin: origin)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        shell.webView.frame = window.bounds
        window.addSubview(shell.webView)
        window.isHidden = false
        defer { window.isHidden = true }
        shell.open(path: "/api/v1/auth/oidc/start")
        let report = try await server.report(timeout: 90)
        XCTAssertEqual(report["search"], "?signed=1", "the callback's redirect reached the app: \(report)")
        XCTAssertEqual(report["shell"], "object", "the page is the shell's, with the bridge: \(report)")
        XCTAssertTrue(provider.paths.contains("/auth"), "the provider's page loaded in the web view: \(provider.paths)")
        XCTAssertNil(shell.failure)
        XCTAssertFalse(shell.flow.inSignIn)
    }
}

/// A one-page HTTP server: `/` is a page whose script reports
/// `typeof window.opentodoShell` and the message handler as `/report?…`.
final class PageServer: @unchecked Sendable {
    private static let page = """
    <!doctype html><meta charset="utf-8"><title>bridge</title><script>
    var s = window.opentodoShell, w = window.webkit;
    fetch('/report?shell=' + typeof s + '&platform=' + encodeURIComponent(s ? s.platform : '') +
      '&handler=' + typeof (w && w.messageHandlers && w.messageHandlers.opentodoNative) +
      '&origin=' + encodeURIComponent(location.origin) + '&search=' + encodeURIComponent(location.search));
    </script>
    """

    /// An answer for a path other than `/` and `/report` (a redirect, another page).
    struct Response {
        var status = "200 OK"
        var headers = ""
        var body = ""
        static func redirect(_ status: String, to location: String) -> Response {
            Response(status: status, headers: "Location: \(location)\r\n")
        }
    }

    private let listener: NWListener
    /// Every field below is touched on this queue only.
    private let queue = DispatchQueue(label: "PageServer")
    private var routes: [String: Response] = [:]
    private var requested: [String] = []
    private var starting: CheckedContinuation<Void, Error>?
    private var reported: [String: String]?
    private var waiting: CheckedContinuation<[String: String], Error>?

    private init(listener: NWListener) { self.listener = listener }

    var port: UInt16 { listener.port?.rawValue ?? 0 }

    /// The first IPv4 address of an interface that is up and not loopback (the simulator
    /// shares the Mac's interfaces), or nil.
    static func networkAddress() -> String? {
        var list: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&list) == 0, let first = list else { return nil }
        defer { freeifaddrs(list) }
        for entry in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let flags = Int32(entry.pointee.ifa_flags)
            guard let address = entry.pointee.ifa_addr, address.pointee.sa_family == UInt8(AF_INET),
                  flags & IFF_UP != 0, flags & IFF_RUNNING != 0, flags & IFF_LOOPBACK == 0 else { continue }
            var name = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            guard getnameinfo(address, socklen_t(address.pointee.sa_len), &name, socklen_t(name.count),
                              nil, 0, NI_NUMERICHOST) == 0 else { continue }
            let text = String(cString: name)
            if !text.hasPrefix("169.254.") { return text }
        }
        return nil
    }

    static func start(host: String) async throws -> PageServer {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: NWEndpoint.Host(host), port: .any)
        let server = PageServer(listener: try NWListener(using: parameters))
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
            server.queue.async {
                server.starting = done
                server.listener.stateUpdateHandler = { state in server.changed(state) }
                server.listener.newConnectionHandler = { connection in server.serve(connection) }
                server.listener.start(queue: server.queue)
            }
        }
        return server
    }

    func stop() { listener.cancel() }

    /// Answers `path` (without its query) with `response` from now on.
    func route(_ path: String, _ response: Response) { queue.sync { routes[path] = response } }

    /// The paths asked for so far, in order.
    var paths: [String] { queue.sync { requested } }

    private func changed(_ state: NWListener.State) {
        guard let starting else { return }
        switch state {
        case .ready: self.starting = nil; starting.resume()
        case .failed(let error): self.starting = nil; starting.resume(throwing: error)
        default: break
        }
    }

    func report(timeout: TimeInterval) async throws -> [String: String] {
        try await withCheckedThrowingContinuation { (done: CheckedContinuation<[String: String], Error>) in
            queue.async {
                if let reported = self.reported { return done.resume(returning: reported) }
                self.waiting = done
                self.queue.asyncAfter(deadline: .now() + timeout) {
                    guard let waiting = self.waiting else { return }
                    self.waiting = nil
                    waiting.resume(throwing: NSError(domain: "PageServer", code: 1,
                                                     userInfo: [NSLocalizedDescriptionKey: "the page never reported"]))
                }
            }
        }
    }

    private func serve(_ connection: NWConnection) {
        connection.start(queue: queue)
        receive(connection, Data())
    }

    private func receive(_ connection: NWConnection, _ received: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, done, error in
            let buffer = received + (data ?? Data())
            guard let head = String(data: buffer, encoding: .utf8), head.contains("\r\n\r\n") else {
                if done || error != nil { connection.cancel() } else { self.receive(connection, buffer) }
                return
            }
            let target = head.split(separator: " ").dropFirst().first.map(String.init) ?? "/"
            self.answer(connection, target)
        }
    }

    private func answer(_ connection: NWConnection, _ target: String) {
        var status = "404 Not Found", type = "text/plain", body = "", headers = ""
        let path = String(target.split(separator: "?", maxSplits: 1).first ?? "")
        requested.append(path)
        if let route = routes[path] {
            status = route.status
            headers = route.headers
            type = "text/html; charset=utf-8"
            body = route.body
        } else if target == "/" || target.hasPrefix("/?") {
            status = "200 OK"
            type = "text/html; charset=utf-8"
            body = Self.page
        } else if target.hasPrefix("/report?") {
            status = "204 No Content"
            var values: [String: String] = [:]
            for item in URLComponents(string: target)?.queryItems ?? [] { values[item.name] = item.value ?? "" }
            if reported == nil { reported = values }
            if let waiting {
                self.waiting = nil
                waiting.resume(returning: values)
            }
        }
        let bytes = Data(body.utf8)
        let head = "HTTP/1.1 \(status)\r\n\(headers)Content-Type: \(type)\r\nContent-Length: \(bytes.count)\r\n"
            + "Cache-Control: no-store\r\nConnection: close\r\n\r\n"
        connection.send(content: Data(head.utf8) + bytes, completion: .contentProcessed { _ in connection.cancel() })
    }
}
