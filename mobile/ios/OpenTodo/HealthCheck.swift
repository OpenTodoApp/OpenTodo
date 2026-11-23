import Foundation

/// The first-run check: `GET <origin>/api/v1/health` must answer `{"status":"ok","version":…}`;
/// when it does not, `/healthz` is asked too, the only route of servers before 1.0.1. Some proxies
/// answer `/healthz` themselves (Pomerium, Google Cloud Run), so it is never asked first.
/// A login wall in front of the server (Pangolin, Authelia, Authentik, Cloudflare Access,
/// oauth2-proxy…) answers with a redirect to its sign-in page or with a sign-in page itself;
/// that is told apart from an address that is simply not OpenTodo (native-shells "Behind a
/// login page"). Mirrors `mobile/android/app/src/main/java/app/opentodo/HealthCheck.kt`; both
/// apps read the cases in `mobile/android/app/src/test/resources/health-check/cases.json`.
enum HealthCheck {
    /// `loginWall`: a redirect to a sign-in page, or a page refusing access (401/403);
    /// `webPage`: an ordinary web page, which may be a login wall's or simply another site.
    enum Outcome: String { case ok, noNetwork, notOpenTodo, untrusted, loginWall, webPage }

    struct Answer {
        let outcome: Outcome
        var version: String?
    }

    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 15
        // text/html too: some login walls answer a client that takes no page with a bare 401.
        config.httpAdditionalHeaders = ["Accept": "application/json, text/html;q=0.5"]
        // The only cookies sent are the sign-in screen's, given to `check(origin:cookies:)`,
        // and never to a redirect's target: redirects are not followed (`NoRedirects`).
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        return URLSession(configuration: config, delegate: NoRedirects(), delegateQueue: nil)
    }()

    /// Redirects are not followed: another origin is another server.
    private final class NoRedirects: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask,
                        willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                        completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }

    /// The health routes, in the order they are asked (health-route-alias).
    static let paths = ["/api/v1/health", "/healthz"]

    /// `cookies`: the sign-in screen's web view's cookies, so a login wall the person got
    /// through in the app lets the check through too. Each route gets the ones a browser
    /// would send it (`cookieHeader`).
    static func check(origin: String, cookies: [HTTPCookie] = []) async -> Answer {
        await combine(await check(origin: origin, path: paths[0], cookies: cookies)) {
            await check(origin: origin, path: paths[1], cookies: cookies)
        }
    }

    /// The check's answer from the first route's and, unless that one settles it, the second's:
    /// no network or a refused certificate fails the same on every path, and an OpenTodo answer
    /// is final. Otherwise the second route decides when it answers OK (a server before 1.0.1),
    /// and the first route's answer stands (a login wall, a web page).
    static func combine(_ first: Answer, fallback: () async -> Answer) async -> Answer {
        switch first.outcome {
        case .ok, .noNetwork, .untrusted: return first
        case .notOpenTodo, .loginWall, .webPage:
            let second = await fallback()
            return second.outcome == .ok ? second : first
        }
    }

    private static func check(origin: String, path: String, cookies: [HTTPCookie]) async -> Answer {
        guard let url = URL(string: origin + path) else { return Answer(outcome: .notOpenTodo) }
        var request = URLRequest(url: url)
        if let header = cookieHeader(cookies, for: url) { request.setValue(header, forHTTPHeaderField: "Cookie") }
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { return Answer(outcome: .notOpenTodo) }
            return classify(status: http.statusCode, body: http.statusCode == 200 ? data.prefix(64 * 1024) : nil,
                            location: http.value(forHTTPHeaderField: "Location"),
                            contentType: http.value(forHTTPHeaderField: "Content-Type"), origin: origin)
        } catch {
            return Answer(outcome: classify(error))
        }
    }

    /// Classifies a response to a health route. `body` only for a 200, `location` the redirect
    /// target as sent, `contentType` the response's type. A redirect to a health route elsewhere
    /// (another host, http to https) is a moved server, not a login wall: "not an OpenTodo server".
    static func classify(status: Int, body: Data?, location: String? = nil, contentType: String? = nil,
                         origin: String? = nil) -> Answer {
        let text = body.map { String(decoding: $0, as: UTF8.self) }
        let html = contentType?.lowercased().contains("text/html") == true
            || text?.drop(while: { $0.isWhitespace }).hasPrefix("<") == true
        if (300...399).contains(status) {
            return Answer(outcome: location.map { redirectsToLogin($0, origin: origin) } == true ? .loginWall : .notOpenTodo)
        }
        if (status == 401 || status == 403) && html { return Answer(outcome: .loginWall) }
        guard status == 200, let body else { return Answer(outcome: .notOpenTodo) }
        guard let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] else {
            return Answer(outcome: html ? .webPage : .notOpenTodo)
        }
        guard json["status"] as? String == "ok", let version = json["version"] as? String else {
            return Answer(outcome: .notOpenTodo)
        }
        return Answer(outcome: .ok, version: version)
    }

    /// True when a redirect leads anywhere but a health route (a sign-in page, the wall's portal).
    private static func redirectsToLogin(_ location: String, origin: String?) -> Bool {
        let trimmed = location.trimmingCharacters(in: .whitespaces)
        let base = origin.flatMap { URL(string: $0 + "/healthz") }
        guard let target = URL(string: trimmed, relativeTo: base) else { return false }
        var path = target.path
        while path.hasSuffix("/") { path.removeLast() }
        return !paths.contains(path)
    }

    /// The `Cookie` header the web view would send to `url`, from its cookie store's cookies.
    static func cookieHeader(_ cookies: [HTTPCookie], for url: URL) -> String? {
        guard let host = url.host?.lowercased() else { return nil }
        let secure = url.scheme?.lowercased() == "https"
        let path = url.path.isEmpty ? "/" : url.path
        let matching = cookies.filter { cookie in
            if cookie.isSecure && !secure { return false }
            if let expires = cookie.expiresDate, expires < Date() { return false }
            let domain = cookie.domain.lowercased()
            let domainMatches = domain.hasPrefix(".")
                ? host == String(domain.dropFirst()) || host.hasSuffix(domain)
                : host == domain
            let cookiePath = cookie.path.isEmpty ? "/" : cookie.path
            let pathMatches = path == cookiePath || path.hasPrefix(cookiePath.hasSuffix("/") ? cookiePath : cookiePath + "/")
            return domainMatches && pathMatches
        }
        guard !matching.isEmpty else { return nil }
        return matching.map { "\($0.name)=\($0.value)" }.joined(separator: "; ")
    }

    /// Certificate problems apart from everything else: a wrong server versus an unreachable one.
    static func classify(_ error: Error) -> Outcome {
        var current: NSError? = error as NSError
        while let e = current {
            if e.domain == NSURLErrorDomain {
                switch e.code {
                case NSURLErrorServerCertificateUntrusted, NSURLErrorSecureConnectionFailed,
                     NSURLErrorServerCertificateHasBadDate, NSURLErrorServerCertificateNotYetValid,
                     NSURLErrorServerCertificateHasUnknownRoot, NSURLErrorClientCertificateRejected,
                     NSURLErrorAppTransportSecurityRequiresSecureConnection:
                    return .untrusted
                case NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorNetworkConnectionLost,
                     NSURLErrorTimedOut, NSURLErrorNotConnectedToInternet, NSURLErrorDNSLookupFailed,
                     NSURLErrorDataNotAllowed, NSURLErrorInternationalRoamingOff:
                    return .noNetwork
                default:
                    break
                }
            }
            current = e.userInfo[NSUnderlyingErrorKey] as? NSError
        }
        return .noNetwork
    }
}
