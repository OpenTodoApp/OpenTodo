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

    func testErrorClassification() {
        let offline = NSError(domain: NSURLErrorDomain, code: NSURLErrorCannotConnectToHost)
        XCTAssertEqual(HealthCheck.classify(offline), .noNetwork)
        let untrusted = NSError(domain: NSURLErrorDomain, code: NSURLErrorServerCertificateUntrusted)
        XCTAssertEqual(HealthCheck.classify(untrusted), .untrusted)
        let wrapped = NSError(domain: "x", code: 1, userInfo: [NSUnderlyingErrorKey: untrusted])
        XCTAssertEqual(HealthCheck.classify(wrapped), .untrusted)
    }
}
