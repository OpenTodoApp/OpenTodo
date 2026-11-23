import JavaScriptCore
import Network
import UIKit
import WebKit
import XCTest
@testable import OpenTodo

final class ServerAddressTests: XCTestCase {
    /// The rules both shells share: mobile/android/app/src/test/resources/server-address/cases.json,
    /// which the Android app's ServerAddressTest reads too.
    private func fixture() throws -> [String: Any] {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/server-address/cases.json")
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    /// ios-setup-address: what the first-run field turns an address into, which is what it then shows.
    func testSharedCases() throws {
        let cases = try XCTUnwrap(try fixture()["parse"] as? [[String: Any]])
        XCTAssertFalse(cases.isEmpty, "the fixture has cases")
        for (i, c) in cases.enumerated() {
            let input = try XCTUnwrap(c["input"] as? String, "case \(i + 1)")
            let expected: ServerAddress
            if let origin = c["ok"] as? String {
                expected = .ok(origin: origin, insecure: try XCTUnwrap(c["insecure"] as? Bool, input))
            } else if let suggestion = c["needsHttps"] as? String {
                expected = .needsHttps(suggestion: suggestion)
            } else if c["invalid"] as? Bool == true {
                expected = .invalid
            } else {
                XCTFail("case \(i + 1): no expected result"); continue
            }
            XCTAssertEqual(ServerAddress.parse(input), expected, "\"\(input)\"")
        }
    }

    func testLocalHosts() throws {
        let doc = try fixture()
        let local = try XCTUnwrap(doc["local"] as? [String]), notLocal = try XCTUnwrap(doc["notLocal"] as? [String])
        XCTAssertFalse(local.isEmpty || notLocal.isEmpty)
        for host in local { XCTAssertTrue(ServerAddress.isLocal(host), host) }
        for host in notLocal { XCTAssertFalse(ServerAddress.isLocal(host), host) }
    }

    func testPunycode() {
        XCTAssertEqual(ServerAddress.punycode("bücher"), "bcher-kva")
        XCTAssertEqual(ServerAddress.punycode("привет"), "b1agh1afp")
        XCTAssertEqual(ServerAddress.punycode("例え"), "r8jz45g")
    }
}

final class HealthCheckTests: XCTestCase {
    /// The cases both apps read (Android's `HealthCheckTest` too): what a health route's answer means.
    private func cases() throws -> [String: Any] {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/health-check/cases.json")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
    }

    private func outcome(_ name: Any?) throws -> HealthCheck.Outcome {
        try XCTUnwrap((name as? String).flatMap(HealthCheck.Outcome.init(rawValue:)), "unknown outcome \(String(describing: name))")
    }

    /// native-shells "Behind a login page": a login wall is not "not an OpenTodo server" (#1877).
    func testResponsesFollowTheSharedCases() throws {
        let list = try XCTUnwrap(try cases()["classify"] as? [[String: Any]])
        XCTAssertFalse(list.isEmpty)
        for c in list {
            let name = c["name"] as? String ?? "?"
            let answer = HealthCheck.classify(status: try XCTUnwrap(c["status"] as? Int),
                                              body: (c["body"] as? String).map { Data($0.utf8) },
                                              location: c["location"] as? String,
                                              contentType: c["contentType"] as? String,
                                              origin: c["origin"] as? String)
            XCTAssertEqual(answer.outcome, try outcome(c["outcome"]), name)
            XCTAssertEqual(answer.version, c["version"] as? String, name)
        }
    }

    /// health-route-alias: `/api/v1/health` first, `/healthz` only when that is not settled.
    func testCombineFollowsTheSharedCases() async throws {
        XCTAssertEqual(HealthCheck.paths, ["/api/v1/health", "/healthz"])
        let list = try XCTUnwrap(try cases()["combine"] as? [[String: Any]])
        XCTAssertFalse(list.isEmpty)
        for c in list {
            let name = c["name"] as? String ?? "?"
            let second = try (c["second"] as? String).map { try outcome($0) }
            var asked = false
            let answer = await HealthCheck.combine(HealthCheck.Answer(outcome: try outcome(c["first"]))) {
                asked = true
                return HealthCheck.Answer(outcome: second ?? .notOpenTodo)
            }
            XCTAssertEqual(answer.outcome, try outcome(c["outcome"]), name)
            XCTAssertEqual(asked, second != nil, "\(name): the second route is asked only when the first does not settle it")
        }
    }

    /// The sign-in screen's cookies for the health route: the server's, never another site's.
    func testCookieHeaderForTheHealthRoute() throws {
        func cookie(_ name: String, domain: String, path: String = "/", secure: Bool = false) throws -> HTTPCookie {
            var props: [HTTPCookiePropertyKey: Any] = [.name: name, .value: "v", .domain: domain, .path: path]
            if secure { props[.secure] = "TRUE" }
            return try XCTUnwrap(HTTPCookie(properties: props))
        }
        let url = try XCTUnwrap(URL(string: "https://todo.example.com/healthz"))
        let cookies = [try cookie("wall", domain: ".example.com"), try cookie("host", domain: "todo.example.com", secure: true),
                       try cookie("other", domain: "other.example.org"), try cookie("deep", domain: "todo.example.com", path: "/app")]
        XCTAssertEqual(HealthCheck.cookieHeader(cookies, for: url), "wall=v; host=v")
        let plain = try XCTUnwrap(URL(string: "http://todo.example.com/healthz"))
        XCTAssertEqual(HealthCheck.cookieHeader(cookies, for: plain), "wall=v")
        XCTAssertNil(HealthCheck.cookieHeader([], for: url))
    }

    /// The check never follows a redirect, so the sign-in screen's cookies reach the server's
    /// own routes only, never the redirect's target, even one on the same host (#1881 review).
    func testTheCheckNeverFollowsARedirectNorTakesItsCookiesThere() async throws {
        let elsewhere = try await PageServer.start(host: "127.0.0.1")
        defer { elsewhere.stop() }
        let server = try await PageServer.start(host: "127.0.0.1")
        defer { server.stop() }
        let target = "http://127.0.0.1:\(elsewhere.port)/login"
        server.route("/api/v1/health", .redirect("302 Found", to: target))
        server.route("/healthz", .redirect("302 Found", to: target))
        let cookie = try XCTUnwrap(HTTPCookie(properties: [.name: "wall", .value: "secret", .domain: "127.0.0.1", .path: "/"]))
        let answer = await HealthCheck.check(origin: "http://127.0.0.1:\(server.port)", cookies: [cookie])
        XCTAssertEqual(answer.outcome, .loginWall)
        XCTAssertEqual(server.paths, ["/api/v1/health", "/healthz"])
        for head in server.requestHeads {
            XCTAssertTrue(head.lowercased().contains("\r\ncookie: wall=secret"), "the server's own route gets the cookie: \(head)")
        }
        XCTAssertEqual(elsewhere.paths, [], "the redirect's target is never asked")
        XCTAssertEqual(elsewhere.requestHeads, [])
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

/// native-shells "Microphone for voice capture": the cases both apps read (Android's
/// WebMicrophoneTest too), microphone/cases.json.
final class MediaCaptureTests: XCTestCase {
    func testRequestsFollowTheSharedCases() throws {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/microphone/cases.json")
        let doc = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        let server = try XCTUnwrap(URL(string: try XCTUnwrap(doc["server"] as? String)))
        let cases = try XCTUnwrap(doc["cases"] as? [[String: Any]])
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let name = c["name"] as? String ?? "?"
            let origin = try XCTUnwrap(URL(string: try XCTUnwrap(c["origin"] as? String)), name)
            // The asking frame: the page itself unless the case names an embedded one.
            let frame = try XCTUnwrap(URL(string: (c["frame"] as? String) ?? (c["origin"] as? String ?? "")), name)
            let audio = try XCTUnwrap(c["audio"] as? Bool, name), video = try XCTUnwrap(c["video"] as? Bool, name)
            guard audio || video else { continue }
            let kind: MediaCapture.Kind = audio && video ? .cameraAndMicrophone : audio ? .microphone : .camera
            XCTAssertEqual(MediaCapture.grants(server: server, top: Origin.signature(origin), requester: Origin.signature(frame), kind: kind),
                           try XCTUnwrap(c["whole"] as? Bool, name), name)
        }
    }

    /// The security origin WebKit reports has port 0 for the scheme's default one.
    func testTheServerAsWebKitReportsIt() throws {
        let server = try XCTUnwrap(URL(string: "https://todo.example.com"))
        let own = Origin.signature(scheme: "https", host: "todo.example.com", port: 0)
        XCTAssertTrue(MediaCapture.grants(server: server, top: own, requester: own, kind: .microphone))
        let other = Origin.signature(scheme: "https", host: "todo.example.com", port: 8443)
        XCTAssertFalse(MediaCapture.grants(server: server, top: own, requester: other, kind: .microphone))
        XCTAssertFalse(MediaCapture.grants(server: server, top: other, requester: own, kind: .microphone))
    }
}

/// The offline start of the portable build (#1458): the first load falls back to the web
/// view's cache once on an offline failure, so a cached app opens when the server is down.
@MainActor
final class OfflineStartTests: XCTestCase {
    func testOfflineFirstLoadFallsBackToTheCacheOnce() {
        // Offline, first try of this launch: fall back to the cache.
        XCTAssertTrue(ShellController.shouldRetryFromCache(kind: .offline, triedCache: false, loaded: false))
        // The cache was already tried, or the app is already showing: a real failure now.
        XCTAssertFalse(ShellController.shouldRetryFromCache(kind: .offline, triedCache: true, loaded: false))
        XCTAssertFalse(ShellController.shouldRetryFromCache(kind: .offline, triedCache: false, loaded: true))
        // A certificate, a cancelled, a sign-in or any other failure never falls back.
        for other: ShellController.Failure.Kind in [.untrusted, .cancelled, .signIn, .other] {
            XCTAssertFalse(ShellController.shouldRetryFromCache(kind: other, triedCache: false, loaded: false))
        }
    }

    /// A first start with the server unreachable and nothing stored: the load from the cache
    /// fails with its own error, and the screen still says the server can't be reached. Any
    /// other failure, also one after a start from the cache, says what it is.
    func testAFailedCacheFallbackSaysTheServerIsUnreachable() {
        let cacheMiss = ShellController.kind(of: NSError(domain: NSURLErrorDomain, code: NSURLErrorResourceUnavailable))
        XCTAssertEqual(ShellController.shownKind(cacheMiss, loadingFromCache: true), .offline)
        for kind: ShellController.Failure.Kind in [.offline, .untrusted, .other] {
            XCTAssertEqual(ShellController.shownKind(kind, loadingFromCache: true), .offline, "the cache load failed")
            XCTAssertEqual(ShellController.shownKind(kind, loadingFromCache: false), kind, "any other load")
        }
    }

    /// A load from the cache that finished with an empty document (nothing stored) is not the
    /// app: the screen says the server is unreachable. The app's page always has scripts; no
    /// answer at all (the page changed meanwhile) is not taken for an empty cache.
    func testAnEmptyDocumentFromTheCacheIsNotTheApp() {
        XCTAssertTrue(ShellController.cacheWasEmpty(scripts: NSNumber(value: 0)))
        XCTAssertTrue(ShellController.cacheWasEmpty(scripts: 0))
        XCTAssertFalse(ShellController.cacheWasEmpty(scripts: NSNumber(value: 3)))
        XCTAssertFalse(ShellController.cacheWasEmpty(scripts: nil))
        XCTAssertFalse(ShellController.cacheWasEmpty(scripts: "0"))
        XCTAssertGreaterThan(ShellController.cacheWait, ShellController.revealCap)
    }

    /// Which errors read as "No connection to your server" and which as a certificate problem.
    func testLoadErrorsAreSortedIntoWhatTheScreenSays() {
        func kind(_ code: Int) -> ShellController.Failure.Kind { ShellController.kind(of: NSError(domain: NSURLErrorDomain, code: code)) }
        for code in [NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorCannotFindHost,
                     NSURLErrorCannotConnectToHost, NSURLErrorDNSLookupFailed, NSURLErrorTimedOut,
                     NSURLErrorDataNotAllowed, NSURLErrorInternationalRoamingOff] {
            XCTAssertEqual(kind(code), .offline, "\(code)")
        }
        for code in [NSURLErrorServerCertificateUntrusted, NSURLErrorServerCertificateHasBadDate, NSURLErrorServerCertificateHasUnknownRoot,
                     NSURLErrorServerCertificateNotYetValid, NSURLErrorSecureConnectionFailed, NSURLErrorAppTransportSecurityRequiresSecureConnection,
                     NSURLErrorClientCertificateRejected, NSURLErrorClientCertificateRequired] {
            XCTAssertEqual(kind(code), .untrusted, "\(code)")
        }
        XCTAssertEqual(kind(NSURLErrorCancelled), .cancelled)
        XCTAssertEqual(kind(NSURLErrorResourceUnavailable), .other)
        XCTAssertEqual(kind(NSURLErrorBadServerResponse), .other)
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
        // A cold CI simulator can stall WebKit itself: on 2026-11-23 its networking process took
        // 39 s to launch and the page's process stopped answering, with the server's answer to `/`
        // already sent, and the web view stayed at 10 % for the whole wait. That stall, and only
        // that one (still loading, answer sent), gets one fresh load. A page that loaded without
        // reporting, the bridge's own failure, fails at once.
        var report: [String: String]?
        var reloaded = false
        do {
            report = try await server.report(timeout: 45)
        } catch {
            // Stalled with the answer sent: start the load again (a cancelled load is ignored by
            // the shell). Still waiting for `/`, as on a slow cold launch: keep waiting, up to the
            // old 90 s. Neither (the page loaded): only a report that came in just now counts.
            let wait: TimeInterval
            if shell.webView.isLoading, server.answers.contains("/ sent") {
                reloaded = true
                shell.webView.stopLoading()
                shell.load()
                wait = 60
            } else if shell.webView.isLoading {
                wait = 45
            } else {
                wait = 1
            }
            report = try? await server.report(timeout: wait)
        }
        guard let page = report else {
            // Says which half failed: the page never asked (`/` missing) or it loaded but did not report.
            let at = shell.webView.url?.absoluteString ?? "no address"
            return XCTFail("the page never reported\(reloaded ? ", not even after a reload of a stalled load" : ""); "
                + "the server was asked for \(server.paths) and answered \(server.answers); "
                + "the web view is at \(at), loading: \(shell.webView.isLoading), progress: \(shell.webView.estimatedProgress), failure: \(String(describing: shell.failure))")
        }
        XCTAssertEqual(page["origin"], origin.absoluteString)
        XCTAssertEqual(page["handler"], "object", "the message handler reaches the page: \(page)")
        XCTAssertEqual(page["shell"], "object", "window.opentodoShell exists: \(page)")
        XCTAssertEqual(page["platform"], "ios")
    }
}

/// The navigation rule of the web view (native-shells "Sign-in flows stay in the shell"),
/// on the cases it shares with the Android app's SignInFlowTest (sign-in/flows.json).
final class SignInFlowTests: XCTestCase {
    private func u(_ s: String) -> URL { URL(string: s)! }

    /// The rules both shells share: sign-in/flows.json, which the Android app's SignInFlowTest reads too.
    func testSharedCases() throws {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/sign-in/flows.json")
        let doc = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        let server = try XCTUnwrap(URL(string: try XCTUnwrap(doc["server"] as? String)))
        let cases = try XCTUnwrap(doc["cases"] as? [[String: Any]])
        XCTAssertFalse(cases.isEmpty, "the fixture has cases")
        for c in cases {
            let name = c["name"] as? String ?? "?"
            var clock = Date(timeIntervalSince1970: 1_000_000)
            let f = SignInFlow(server: server) { clock }
            let steps = try XCTUnwrap(c["steps"] as? [[String: Any]], "\(name) has steps")
            XCTAssertFalse(steps.isEmpty, "\(name) has steps")
            for (i, step) in steps.enumerated() {
                let at = "\(name), step \(i + 1): \(step)"
                if let kind = ["link", "redirect", "script"].first(where: { step[$0] != nil }) {
                    let url = try XCTUnwrap(URL(string: try XCTUnwrap(step[kind] as? String)), at)
                    let expect = try XCTUnwrap(step["expect"] as? String, at)
                    XCTAssert(["stay", "browser"].contains(expect), "\(at): unknown expect")
                    let expected: SignInFlow.Decision = expect == "stay" ? .stay : .browser
                    XCTAssertEqual(f.decide(url, isRedirect: kind == "redirect", hasGesture: kind == "link"), expected, at)
                } else if let started = step["started"] as? String {
                    f.started(try XCTUnwrap(URL(string: started), at))
                } else if step["end"] != nil {
                    f.end()
                } else if let inSignIn = step["inSignIn"] as? Bool {
                    XCTAssertEqual(f.inSignIn, inSignIn, at)
                } else if let wait = step["wait"] as? String {
                    switch wait {
                    case "almostTimeout": clock += SignInFlow.timeout - 1
                    case "timeoutAndMore": clock += SignInFlow.timeout + 1
                    default: XCTFail("\(at): unknown wait")
                    }
                } else {
                    XCTFail("\(at): unknown step")
                }
            }
        }
    }

    /// This app's way of writing an origin (`Origin.signature`): always with its port.
    /// Which addresses count as the server's own is in OriginTests, on the shared cases.
    func testOrigins() {
        XCTAssertEqual(SignInFlow.originOf(u("https://Todo.Example.com:443/a?b#c")), "https://todo.example.com:443")
        XCTAssertNil(SignInFlow.originOf(u("about:blank")))
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
    private var heads: [String] = []
    private var sent: [String] = []
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

    /// The head of each request (request line and headers), in order.
    var requestHeads: [String] { queue.sync { heads } }

    /// Whether each answer went out ("/ sent", or the send error), in order.
    var answers: [String] { queue.sync { sent } }

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
            self.heads.append(head.components(separatedBy: "\r\n\r\n")[0])
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
        connection.send(content: Data(head.utf8) + bytes, completion: .contentProcessed { error in
            // On the server's queue, as every other field: what happened to each answer.
            self.sent.append(error.map { "\(path) not sent: \($0)" } ?? "\(path) sent")
            connection.cancel()
        })
    }
}

/// app-sso-system-browser: the rules of single sign-on in the system browser.
final class SystemSignInTests: XCTestCase {
    /// The rules both apps share: sign-in/system.json, which the Android app's SystemSignInTest reads too.
    private func cases() throws -> [String: Any] {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/sign-in/system.json")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
    }

    private func each(_ key: String, _ check: ([String: Any]) throws -> Void) throws {
        let list = try XCTUnwrap(try cases()[key] as? [[String: Any]], key)
        XCTAssertFalse(list.isEmpty, "the fixture has \(key) cases")
        for c in list { try check(c) }
    }

    private func serverURL() throws -> URL { try XCTUnwrap(URL(string: try XCTUnwrap(try cases()["server"] as? String))) }

    private func string(_ c: [String: Any], _ key: String) throws -> String { try XCTUnwrap(c[key] as? String, key) }

    func testChallengeIsS256() throws {
        // RFC 7636, appendix B.
        let vector = try XCTUnwrap(try cases()["challenge"] as? [String: String])
        XCTAssertEqual(SystemSignIn.challenge(for: try XCTUnwrap(vector["verifier"])), vector["challenge"])
        let p = SystemSignIn.pending()
        XCTAssertEqual(p.verifier.count, 43)
        XCTAssertEqual(p.challenge, SystemSignIn.challenge(for: p.verifier))
        XCTAssertNotEqual(p.state, SystemSignIn.pending().state)
    }

    func testOnlyTheServersStartRouteGoesToTheSystemBrowser() throws {
        let server = try serverURL()
        try each("start") { c in
            let address = try string(c, "url")
            XCTAssertEqual(SystemSignIn.isStart(try XCTUnwrap(URL(string: address)), server: server), c["start"] as? Bool, address)
        }
        try each("startUrl") { c in
            let p = SystemSignIn.Pending(verifier: "v", challenge: try string(c, "challenge"), state: try string(c, "state"))
            XCTAssertEqual(SystemSignIn.startURL(server: server, p, link: try XCTUnwrap(c["link"] as? Bool)).absoluteString, try string(c, "url"))
        }
    }

    func testTheModeTheWebAppAskedForIsPassedOn() throws {
        try each("link") { c in
            let address = try string(c, "url")
            XCTAssertEqual(SystemSignIn.isLink(try XCTUnwrap(URL(string: address))), c["link"] as? Bool, address)
        }
    }

    /// `cancelled` in the cases (the right state, neither a code nor an error) is `invalid`
    /// here: a closed sheet reports no address at all, and either way nothing is loaded.
    func testOutcome() throws {
        try each("outcome") { c in
            let address = try string(c, "url")
            let want: SystemSignIn.Outcome
            switch try string(c, "outcome") {
            case "code": want = .code(try string(c, "value"))
            case "error": want = .error(try string(c, "value"))
            case "cancelled", "invalid": want = .invalid
            case let other: return XCTFail("unknown outcome \(other)")
            }
            // A link with a bad escape may not even be a URL on iOS: then the app never reads it.
            guard let url = URL(string: address) else {
                XCTAssertEqual(want, .invalid, "\(address) is no URL here, so only an invalid outcome fits")
                return
            }
            XCTAssertEqual(SystemSignIn.outcome(of: url, state: try string(c, "state")), want, address)
        }
    }

    func testHealthAnnouncesAppFlows() throws {
        try each("health") { c in
            let body = try string(c, "body")
            XCTAssertEqual(SystemSignIn.supported(healthBody: Data(body.utf8)), c["supported"] as? Bool, body)
        }
    }

    func testTheErrorAddressCarriesTheCode() throws {
        let server = try serverURL()
        try each("errorUrl") { c in
            XCTAssertEqual(SystemSignIn.errorURL(server: server, code: try string(c, "code")).absoluteString, try string(c, "url"))
        }
    }

    func testRedeemScriptNamesTheRouteAndValues() {
        let script = SystemSignIn.redeemScript(code: "c0de", verifier: "v3r")
        XCTAssertTrue(script.contains("'/api/v1/auth/oidc/app-session'"))
        XCTAssertTrue(script.contains("code: 'c0de', code_verifier: 'v3r'"))
    }

    /// What each app does around those rules: sign-in/finish.json, which the Android app's SystemSignInTest reads too.
    private func finishCases() throws -> [String: Any] {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/sign-in/finish.json")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
    }

    func testTheStartRouteOpensTheSheetOnlyWhenTheServerAnnouncesIt() throws {
        // The sheet is always there: the cases where a browser could take the sign-in.
        let list = try XCTUnwrap(try finishCases()["begin"] as? [[String: Any]]).filter { $0["browser"] as? Bool == true }
        XCTAssertTrue(list.contains { $0["opens"] as? String == "browser" })
        XCTAssertTrue(list.contains { $0["opens"] as? String == "webView" })
        for c in list {
            let status = c["status"] as? Int
            let body = (c["body"] as? String).map { Data($0.utf8) }
            let opens = SystemSignIn.opensSheet(healthStatus: status, healthBody: body) ? "browser" : "webView"
            XCTAssertEqual(opens, c["opens"] as? String, c["case"] as? String ?? "")
        }
    }

    func testWhatTheAppDoesWhenTheSheetCloses() throws {
        let fixture = try finishCases()
        let state = try XCTUnwrap(fixture["state"] as? String)
        let list = try XCTUnwrap(fixture["finish"] as? [[String: Any]])
        XCTAssertFalse(list.isEmpty)
        for c in list {
            let url = try (c["url"] as? String).map { try XCTUnwrap(URL(string: $0), $0) }
            let step: String
            switch SystemSignIn.finish(url, state: state, onServer: try XCTUnwrap(c["onServer"] as? Bool)) {
            case .redeem(let code): step = "redeem:\(code)"
            case .showError(let code): step = "error:\(code)"
            case .stay: step = "stay"
            }
            XCTAssertEqual(step, c["ios"] as? String, c["case"] as? String ?? "")
        }
    }

    /// The redeem script, run as it is against each answer of the server (an expired code
    /// included): the address it replaces the page with. JavaScriptCore stands in for the page,
    /// with `fetch` and `location` of its own; the Android app gives the same script (its test).
    func testTheRedeemScriptLeadsWhereTheServersAnswerSays() throws {
        let redeem = try XCTUnwrap(try finishCases()["redeem"] as? [String: Any])
        let code = try XCTUnwrap(redeem["code"] as? String)
        let verifier = try XCTUnwrap(redeem["verifier"] as? String)
        let script = SystemSignIn.redeemScript(code: code, verifier: verifier)
        XCTAssertEqual(script, redeem["script"] as? String)
        let answers = try XCTUnwrap(redeem["answers"] as? [[String: Any]])
        XCTAssertFalse(answers.isEmpty)
        for answer in answers {
            let name = answer["case"] as? String ?? ""
            let context = try XCTUnwrap(JSContext())
            var thrown: String?
            context.exceptionHandler = { _, value in thrown = value?.toString() }
            let json = try XCTUnwrap(String(data: JSONSerialization.data(withJSONObject: answer), encoding: .utf8))
            context.evaluateScript("""
            var __replaced = null, __request = null, __answer = \(json);
            var location = { replace: function (u) { __replaced = u; } };
            function fetch(url, init) {
              __request = { url: url, method: init.method, credentials: init.credentials, body: JSON.parse(init.body) };
              if (__answer.throws) return Promise.reject(new TypeError('Failed to fetch'));
              return Promise.resolve({ redirected: !!__answer.redirectedTo, url: __answer.redirectedTo || url, status: __answer.status,
                json: function () { return new Promise(function (ok) { ok(JSON.parse(__answer.body)); }); } });
            }
            """)
            context.evaluateScript(script)
            // Promise jobs run when a script returns; a few more turns for the awaits.
            for _ in 0..<5 { context.evaluateScript("0") }
            XCTAssertNil(thrown, name)
            XCTAssertEqual(context.evaluateScript("__replaced")?.toString(), answer["location"] as? String, name)
            XCTAssertEqual(context.evaluateScript("__request && __request.url")?.toString(), SystemSignIn.redeemPath, name)
            XCTAssertEqual(context.evaluateScript("__request && __request.method")?.toString(), "POST", name)
            XCTAssertEqual(context.evaluateScript("__request && __request.credentials")?.toString(), "same-origin", name)
            XCTAssertEqual(context.evaluateScript("__request && __request.body.code")?.toString(), code, name)
            XCTAssertEqual(context.evaluateScript("__request && __request.body.code_verifier")?.toString(), verifier, name)
        }
    }
}
