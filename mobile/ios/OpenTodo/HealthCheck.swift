import Foundation

/// The first-run check: `GET <origin>/healthz` must answer `{"status":"ok","version":…}`.
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

    static func check(origin: String) async -> Answer {
        guard let url = URL(string: origin + "/healthz") else { return Answer(outcome: .notOpenTodo) }
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
