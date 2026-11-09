import Network
import UIKit
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
/// server in this process, on an ordinary host that no build declares as app-bound, and
/// the page reports what it sees. Only the page's own script reports, with a request to
/// its server, so the answer does not depend on an API App-Bound Domains can switch off.
@MainActor
final class BridgeOnAServerTests: XCTestCase {
    func testThePageSeesTheBridge() async throws {
        let server = try await PageServer.start()
        defer { server.stop() }
        let origin = try XCTUnwrap(URL(string: "http://127.0.0.1:\(server.port)"))
        let shell = ShellController(origin: origin)
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        shell.webView.frame = window.bounds
        window.addSubview(shell.webView)
        window.isHidden = false
        defer { window.isHidden = true }
        shell.load()
        let report = try await server.report(timeout: 30)
        XCTAssertEqual(report["origin"], "http://127.0.0.1:\(server.port)")
        XCTAssertEqual(report["handler"], "object", "the message handler reaches the page: \(report)")
        XCTAssertEqual(report["shell"], "object", "window.opentodoShell exists: \(report)")
        XCTAssertEqual(report["platform"], "ios")
    }
}

/// A one-page HTTP server on 127.0.0.1: `/` is a page whose script reports
/// `typeof window.opentodoShell` and the message handler as `/report?…`.
final class PageServer: @unchecked Sendable {
    private static let page = """
    <!doctype html><meta charset="utf-8"><title>bridge</title><script>
    var s = window.opentodoShell, w = window.webkit;
    fetch('/report?shell=' + typeof s + '&platform=' + encodeURIComponent(s ? s.platform : '') +
      '&handler=' + typeof (w && w.messageHandlers && w.messageHandlers.opentodoNative) +
      '&origin=' + encodeURIComponent(location.origin));
    </script>
    """

    private let listener: NWListener
    /// Every field below is touched on this queue only.
    private let queue = DispatchQueue(label: "PageServer")
    private var starting: CheckedContinuation<Void, Error>?
    private var reported: [String: String]?
    private var waiting: CheckedContinuation<[String: String], Error>?

    private init(listener: NWListener) { self.listener = listener }

    var port: UInt16 { listener.port?.rawValue ?? 0 }

    static func start() async throws -> PageServer {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
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
        var status = "404 Not Found", type = "text/plain", body = ""
        if target == "/" {
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
        let head = "HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(bytes.count)\r\n"
            + "Cache-Control: no-store\r\nConnection: close\r\n\r\n"
        connection.send(content: Data(head.utf8) + bytes, completion: .contentProcessed { _ in connection.cancel() })
    }
}
