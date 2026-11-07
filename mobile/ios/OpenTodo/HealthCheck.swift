import Foundation

/// The first-run check: `GET <origin>/api/v1/health` must answer `{"status":"ok","version":…}`;
/// when it does not, `/healthz` is asked too, the only route of servers before 1.0.1. Some proxies
/// answer `/healthz` themselves (Pomerium, Google Cloud Run), so it is never asked first.
/// Mirrors `mobile/android/app/src/main/java/app/opentodo/HealthCheck.kt`.
enum HealthCheck {
    enum Outcome { case ok, noNetwork, notOpenTodo, untrusted }

    struct Answer {
        let outcome: Outcome
        var version: String?
    }

    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 15
        config.httpAdditionalHeaders = ["Accept": "application/json"]
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

    static func check(origin: String) async -> Answer {
        await combine(await check(origin: origin, path: paths[0])) { await check(origin: origin, path: paths[1]) }
    }

    /// The check's answer from the first route's and, unless that one settles it, the second's:
    /// no network or a refused certificate fails the same on every path, and an OpenTodo answer
    /// is final; otherwise the second route's answer is the check's (a server before 1.0.1).
    static func combine(_ first: Answer, fallback: () async -> Answer) async -> Answer {
        switch first.outcome {
        case .ok, .noNetwork, .untrusted: return first
        case .notOpenTodo: return await fallback()
        }
    }

    private static func check(origin: String, path: String) async -> Answer {
        guard let url = URL(string: origin + path) else { return Answer(outcome: .notOpenTodo) }
        do {
            let (data, response) = try await session.data(from: url)
            guard let http = response as? HTTPURLResponse else { return Answer(outcome: .notOpenTodo) }
            return classify(status: http.statusCode, body: data.prefix(64 * 1024))
        } catch {
            return Answer(outcome: classify(error))
        }
    }

    /// Anything but OpenTodo's health answer is "not an OpenTodo server".
    static func classify(status: Int, body: Data) -> Answer {
        guard status == 200,
              let json = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
              json["status"] as? String == "ok", let version = json["version"] as? String
        else { return Answer(outcome: .notOpenTodo) }
        return Answer(outcome: .ok, version: version)
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
