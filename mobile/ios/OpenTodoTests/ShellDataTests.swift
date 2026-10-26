import XCTest
@testable import OpenTodo

final class OriginTests: XCTestCase {
    func testSignatureUsesTheDefaultPort() {
        XCTAssertEqual(Origin.signature(URL(string: "https://todo.example.com")!), "https://todo.example.com:443")
        XCTAssertEqual(Origin.signature(URL(string: "http://todo.example.com/a?b=1")!), "http://todo.example.com:80")
        XCTAssertEqual(Origin.signature(URL(string: "http://localhost:8080/")!), "http://localhost:8080")
    }

    func testSignatureFromWebKitPartsMatchesTheUrl() throws {
        let url = try XCTUnwrap(URL(string: "http://localhost:8080/today"))
        XCTAssertEqual(Origin.signature(scheme: "http", host: "localhost", port: 8080), Origin.signature(url))
        let https = try XCTUnwrap(URL(string: "https://Todo.Example.com"))
        XCTAssertEqual(Origin.signature(scheme: "https", host: "Todo.Example.com", port: 443), Origin.signature(https))
    }

    func testSameIgnoresPathAndCase() {
        XCTAssertTrue(Origin.same(URL(string: "https://Todo.Example.com/today")!, URL(string: "https://todo.example.com")!))
        XCTAssertFalse(Origin.same(URL(string: "https://todo.example.com")!, URL(string: "https://todo.example.com:8443")!))
        XCTAssertFalse(Origin.same(URL(string: "http://todo.example.com")!, URL(string: "https://todo.example.com")!))
    }

    func testPageOriginDropsPathAndDefaultPort() {
        XCTAssertEqual(Origin.pageOrigin(URL(string: "https://todo.example.com:443/share?files=1")!), "https://todo.example.com")
        XCTAssertEqual(Origin.pageOrigin(URL(string: "http://localhost:8080/today")!), "http://localhost:8080")
    }
}

final class VersionTests: XCTestCase {
    func testCodeMatchesTheAndroidVersionCode() {
        XCTAssertEqual(Version.code("1.2.3"), 10203)
        XCTAssertEqual(Version.code("0.10.0"), 1000)
        XCTAssertEqual(Version.code("2.0"), 20000)
        XCTAssertEqual(Version.code("0.0.0-dev"), 0)
    }
}

final class ShareMapTests: XCTestCase {
    func testPathCarriesTitleTextAndFiles() {
        XCTAssertEqual(ShareMap.path(title: "Buy milk", text: "and bread", withFiles: false),
                       "/share?title=Buy%20milk&text=and%20bread")
    }

    func testLoneLinkBecomesUrl() {
        XCTAssertEqual(ShareMap.path(title: nil, text: " https://example.com/x \n", withFiles: false),
                       "/share?url=https%3A%2F%2Fexample.com%2Fx")
    }

    func testFilesFlag() {
        XCTAssertEqual(ShareMap.path(title: nil, text: nil, withFiles: true), "/share?files=1")
        XCTAssertEqual(ShareMap.path(title: "", text: "  ", withFiles: false), "/share")
    }

    func testASeparateUrlIsCarriedAndBeatsTheText() {
        // What Safari shares: a URL attachment plus a page title, no text.
        XCTAssertEqual(ShareMap.path(title: "Example", text: nil, url: "https://example.com/a?b=1", withFiles: false),
                       "/share?title=Example&url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1")
        XCTAssertEqual(ShareMap.path(title: nil, text: "see https://example.com", url: "https://example.com", withFiles: false),
                       "/share?text=see%20https%3A%2F%2Fexample.com&url=https%3A%2F%2Fexample.com")
    }

    func testAcceptKeepsCountAndSizeLimits() {
        XCTAssertEqual(ShareMap.accept([Int64](repeating: 1, count: 12)), Array(0..<10))
        XCTAssertEqual(ShareMap.accept([1, Int64(ShareMap.maxFileBytes) + 1, 2]), [0, 2])
        let big = Int64(ShareMap.maxTotalBytes / 2) + 1
        XCTAssertEqual(ShareMap.accept([big, big, 10]), [0, 2])
    }

    func testHandoverScriptRepostsUntilReceived() {
        let script = ShareMap.handoverScript(ShareMap.filesMessage([(name: "a.txt", type: "text/plain", dataUrl: "data:text/plain;base64,QQ==")]))
        XCTAssertTrue(script.contains("dataset.opentodoFiles==='received'"))
        XCTAssertTrue(script.contains("postMessage(m,location.origin)"))
        XCTAssertTrue(script.contains("\"type\":\"opentodo-files\""))
    }
}

@MainActor
final class ReminderTests: XCTestCase {
    func testSelectKeepsFutureRemindersInOrderAndLimitsThem() {
        let now = Date(timeIntervalSince1970: 1_000)
        let handed = [
            Reminders.Handed(id: "past", taskId: "t", fireAt: 999_000, title: nil),
            Reminders.Handed(id: "later", taskId: "t", fireAt: 2_000_000, title: nil),
            Reminders.Handed(id: "soon", taskId: "t", fireAt: 1_500_000, title: "Call"),
        ]
        XCTAssertEqual(Reminders.select(handed, now: now).map(\.id), ["soon", "later"])
        XCTAssertEqual(Reminders.select(handed, now: now, limit: 1).map(\.id), ["soon"])
    }

    func testParseIgnoresWhatItCannotRead() {
        XCTAssertEqual(Reminders.parse("not json").count, 0)
        XCTAssertEqual(Reminders.parse("[]").count, 0)
        let json = #"[{"id":"a","taskId":"b","fireAt":1700000000000,"title":"Call"}]"#
        XCTAssertEqual(Reminders.parse(json).first?.title, "Call")
    }
}

final class WidgetPublicationTests: XCTestCase {
    func testPublishWritesWhatTheWidgetReads() throws {
        addTeardownBlock { Store.remove(WidgetPublication.fileName) }
        let json = #"{"updatedAt":1700000000000,"locked":false,"count":2,"overdue":1,"tasks":[{"id":"a","title":"Call","time":"09:00","priority":2,"overdue":true},{"id":"b","priority":0,"overdue":false}]}"#
        XCTAssertTrue(WidgetPublication.publish(json))
        let loaded = try XCTUnwrap(WidgetPublication.load())
        XCTAssertEqual(loaded.count, 2)
        XCTAssertEqual(loaded.tasks.first?.title, "Call")
        XCTAssertEqual(loaded.tasks.last?.title, nil)
    }

    func testPublishRefusesWhatItCannotRead() {
        XCTAssertFalse(WidgetPublication.publish("{}"))
    }
}

final class ShareInboxTests: XCTestCase {
    func testMessageCarriesADataUrlPerFile() throws {
        let path = "\(ShareInbox.directory)/one.txt"
        let url = Store.url(path)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("hello".utf8).write(to: url)
        defer { ShareInbox.clear() }
        let entry = ShareInbox.Entry(title: "T", text: nil, url: nil, files: [.init(name: "one.txt", type: "text/plain", path: path)])
        let message = try XCTUnwrap(ShareInbox.message(entry))
        // JSONSerialization escapes the slash inside the data URL; JSON.parse in the page undoes that.
        XCTAssertTrue(message.contains("base64,aGVsbG8="))
        XCTAssertTrue(message.contains("opentodo-files"))
    }

    func testMissingFilesAreNothingToHandOver() {
        XCTAssertNil(ShareInbox.message(ShareInbox.Entry(title: nil, text: "t", url: nil, files: [.init(name: "gone.txt", type: "text/plain", path: "share/gone.txt")])))
    }
}

@MainActor
final class BridgeTests: XCTestCase {
    func testScriptIsGuardedByOriginAndAdvertisesTheContract() throws {
        let origin = try XCTUnwrap(URL(string: "https://todo.example.com:8443"))
        let script = Bridge.script(origin: origin, app: "1.2.3", capabilities: ["reminders", "widgets"])
        XCTAssertTrue(script.contains("location.origin"))
        XCTAssertTrue(script.contains("https://todo.example.com:8443"))
        XCTAssertTrue(script.contains("platform: 'ios'"))
        XCTAssertTrue(script.contains("bridge: 1"))
        XCTAssertTrue(script.contains("'reminders'") || script.contains("\"reminders\""))
        XCTAssertTrue(script.contains("1.2.3"))
    }

    func testCapabilitiesFollowTheDevice() {
        XCTAssertEqual(Bridge.capabilities(biometric: false, share: true), ["reminders", "widgets", "share", "links"])
        XCTAssertTrue(Bridge.capabilities(biometric: true, share: true).contains("biometric"))
    }

    func testSafeExternalAllowsOnlyOpenableSchemes() {
        XCTAssertTrue(Bridge.safeExternal("https://example.com"))
        XCTAssertTrue(Bridge.safeExternal("mailto:a@example.com"))
        XCTAssertFalse(Bridge.safeExternal("javascript:alert(1)"))
        XCTAssertFalse(Bridge.safeExternal("file:///etc/passwd"))
    }
}

@MainActor
final class BackgroundRefreshTests: XCTestCase {
    func testRequestAsksForAnHourLater() {
        let now = Date(timeIntervalSince1970: 10_000)
        let request = BackgroundRefresh.request(now: now)
        XCTAssertEqual(request.identifier, "app.opentodo.refresh")
        XCTAssertEqual(request.earliestBeginDate, now.addingTimeInterval(3600))
    }
}

final class AppBoundDomainsTests: XCTestCase {
    func testThePlaceholderIsNotADomain() throws {
        XCTAssertFalse(AppBoundDomains.configured.contains { $0.hasSuffix("invalid") })
        XCTAssertFalse(AppBoundDomains.limitsNavigation(to: try XCTUnwrap(URL(string: "https://todo.example.com"))))
    }
}

/// `store`/`read` need a device with an enrolment; the shapes are checked here.
final class BiometricKeyStoreTests: XCTestCase {
    func testDecodeAcceptsA32ByteKey() {
        let key = Data(repeating: 7, count: 32).base64EncodedString()
        XCTAssertEqual(BiometricKeyStore.decode(key), Data(repeating: 7, count: 32))
    }

    func testDecodeRejectsAnotherLength() {
        XCTAssertNil(BiometricKeyStore.decode(Data(repeating: 7, count: 31).base64EncodedString()))
        XCTAssertNil(BiometricKeyStore.decode(Data(repeating: 7, count: 33).base64EncodedString()))
        XCTAssertNil(BiometricKeyStore.decode("not base64 at all !"))
        XCTAssertNil(BiometricKeyStore.decode(""))
    }

    // No enrolment in a simulator: the capability must not be claimed.
    @MainActor
    func testCapabilitiesWithoutABiometricOnThisMachine() {
        let caps = Bridge.capabilities(biometric: BiometricKeyStore.available, share: true)
        XCTAssertEqual(caps.contains("biometric"), BiometricKeyStore.available)
    }
}

final class JSONTests: XCTestCase {
    func testAStringBecomesASafeLiteral() {
        XCTAssertEqual(JSON.jsString("plain"), "\"plain\"")
        XCTAssertEqual(JSON.jsString("a\"b"), "\"a\\\"b\"")
        XCTAssertEqual(JSON.jsString("a\\b"), "\"a\\\\b\"")
        XCTAssertEqual(JSON.jsString("#</script>"), "\"#\\u003c/script\\u003e\"")
        XCTAssertEqual(JSON.jsArray(["reminders", "widgets"]), "[\"reminders\", \"widgets\"]")
    }
}

@MainActor
final class AppModelTests: XCTestCase {
    func testATaskLinkOpensTheTask() {
        let model = AppModel()
        model.handle(url: URL(string: "opentodo://task/abc")!)
        XCTAssertEqual(model.pendingPath, "/?task=abc")
    }

    func testAReminderLinkKeepsOnlyTheTwoActions() {
        let model = AppModel()
        model.handle(url: URL(string: "opentodo://reminder/r1?action=snooze")!)
        XCTAssertEqual(model.pendingPath, "/?reminder=r1&action=snooze")
        model.handle(url: URL(string: "opentodo://reminder/r1?action=dismiss")!)
        XCTAssertEqual(model.pendingPath, "/?reminder=r1&action=dismiss")
        // Any other value is dropped: it would otherwise add a parameter of its own.
        model.handle(url: URL(string: "opentodo://reminder/r1?action=snooze%26add%3Dhello")!)
        XCTAssertEqual(model.pendingPath, "/?reminder=r1")
    }

    func testSharedTextIsPercentEncodedAsOneValue() {
        let model = AppModel()
        model.handle(url: URL(string: "opentodo://add?text=a%2Bb%26c%3Dd%20%C3%A4")!)
        XCTAssertEqual(model.pendingPath, "/?add=a%2Bb%26c%3Dd%20%C3%A4")
    }

    func testAnotherSchemeIsIgnored() {
        let model = AppModel()
        model.handle(url: URL(string: "https://todo.example.com/task/x")!)
        XCTAssertNil(model.pendingPath)
    }

    func testAShareWithoutFilesOpensTheCaptureScreen() {
        ShareInbox.clear()
        addTeardownBlock { ShareInbox.clear() }
        let entry = ShareInbox.Entry(title: nil, text: nil, url: "https://example.com/x", files: [])
        Store.write(try! JSONEncoder().encode(entry), ShareInbox.fileName)
        let model = AppModel()
        model.handle(url: URL(string: "opentodo://share")!)
        XCTAssertEqual(model.pendingPath, "/share?url=https%3A%2F%2Fexample.com%2Fx")
    }

    func testTheChangeServerShortcutDoesNotResetWithoutConfirmation() {
        let model = AppModel()
        XCTAssertFalse(model.changeServerRequested)
    }
}
