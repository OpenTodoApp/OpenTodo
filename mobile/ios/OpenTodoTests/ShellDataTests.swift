import UIKit
import UserNotifications
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

    /// What `location.origin` prints (ios-bridge-portable): only the scheme's own default
    /// port is left out, so `https://…:80` and `http://…:443` keep theirs.
    func testPageOriginKeepsAPortThatIsNotTheSchemesDefault() {
        XCTAssertEqual(Origin.pageOrigin(URL(string: "https://todo.example.com:80")!), "https://todo.example.com:80")
        XCTAssertEqual(Origin.pageOrigin(URL(string: "http://192.168.1.4:443")!), "http://192.168.1.4:443")
        XCTAssertEqual(Origin.pageOrigin(URL(string: "http://192.168.1.4:80")!), "http://192.168.1.4")
        XCTAssertEqual(Origin.pageOrigin(URL(string: "HTTPS://Todo.Example.com")!), "https://todo.example.com")
    }

    /// Every address the first-run screen accepts gives the origin the page will report.
    func testTheAcceptedAddressIsThePagesOrigin() throws {
        let cases = [
            "todo.example.com": "https://todo.example.com",
            "HTTPS://TODO.Example.COM/": "https://todo.example.com",
            "todo.example.com.": "https://todo.example.com",
            "https://todo.example.com:80": "https://todo.example.com:80",
            "http://192.168.1.4:443": "http://192.168.1.4:443",
            "http://[fd00::1]:8080": "http://[fd00::1]:8080",
            "bücher.example": "https://xn--bcher-kva.example",
        ]
        for (input, page) in cases {
            guard case let .ok(origin, _) = ServerAddress.parse(input) else { XCTFail("refused: \(input)"); continue }
            XCTAssertEqual(Origin.pageOrigin(try XCTUnwrap(URL(string: origin))), page, input)
        }
    }
}

final class VersionTests: XCTestCase {
    func testCodeMatchesTheAndroidVersionCode() {
        XCTAssertEqual(Version.code("1.2.3"), 10203)
        XCTAssertEqual(Version.code("0.10.0"), 1000)
        XCTAssertEqual(Version.code("2.0"), 20000)
        XCTAssertEqual(Version.code("0.0.0-dev"), 0)
    }

    /// `make ios` and the TestFlight job set both numbers (ios-distribution D9): the build
    /// number is the version code, and a re-upload of the same version adds `.1`, `.2`, …
    func testTheBundlesBuildNumberIsItsVersionCode() throws {
        let info = Bundle.main.infoDictionary ?? [:]
        let version = Version.normalize(info["CFBundleShortVersionString"] as? String)
        try XCTSkipIf(version == "0.0.0", "a plain Run from Xcode carries the project's placeholder version")
        let build = info["CFBundleVersion"] as? String ?? ""
        let code = String(Version.code(version))
        XCTAssertTrue(build == code || build.range(of: "^\(code)\\.[0-9]+$", options: .regularExpression) != nil,
                      "CFBundleVersion \(build) does not belong to \(version) (\(code))")
    }
}

/// What App Store review reads from the bundle (ios-distribution D7).
final class StoreReadinessTests: XCTestCase {
    /// shell-repairs D8: without the text iOS refuses the Face ID prompt, and unlocking an
    /// encrypted account with the stored key fails.
    func testTheFaceIDTextIsDeclared() throws {
        let text = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "NSFaceIDUsageDescription") as? String)
        XCTAssertFalse(text.trimmingCharacters(in: .whitespaces).isEmpty)
    }

    func testExportComplianceIsDeclared() {
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "ITSAppUsesNonExemptEncryption") as? Bool, false)
    }

    func testTheAppAndTheShareExtensionCarryAPrivacyManifest() throws {
        XCTAssertNotNil(Bundle.main.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"))
        let plugins = try XCTUnwrap(Bundle.main.builtInPlugInsURL)
        let share = plugins.appendingPathComponent("OpenTodoShare.appex/PrivacyInfo.xcprivacy")
        XCTAssertTrue(FileManager.default.fileExists(atPath: share.path), "the share extension reads file sizes, which needs its own manifest")
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

    /// The message handler's origin check (external-security-review 5.7): only the main
    /// frame of the configured server's origin is answered, compared by scheme, host and
    /// port as WebKit reports a frame's security origin.
    func testMessagesAreAnsweredOnlyFromTheConfiguredOrigin() throws {
        let server = try XCTUnwrap(URL(string: "https://todo.example.com"))
        XCTAssertTrue(Bridge.accepts(scheme: "https", host: "todo.example.com", port: 443, mainFrame: true, configured: server))
        XCTAssertTrue(Bridge.accepts(scheme: "HTTPS", host: "Todo.Example.com", port: 443, mainFrame: true, configured: server))
        // A frame inside the server's own page is refused too.
        XCTAssertFalse(Bridge.accepts(scheme: "https", host: "todo.example.com", port: 443, mainFrame: false, configured: server))
        // Another scheme, host or port is another origin.
        XCTAssertFalse(Bridge.accepts(scheme: "http", host: "todo.example.com", port: 80, mainFrame: true, configured: server))
        XCTAssertFalse(Bridge.accepts(scheme: "http", host: "todo.example.com", port: 443, mainFrame: true, configured: server))
        XCTAssertFalse(Bridge.accepts(scheme: "https", host: "todo.example.com", port: 8443, mainFrame: true, configured: server))
        XCTAssertFalse(Bridge.accepts(scheme: "https", host: "evil.example.com", port: 443, mainFrame: true, configured: server))
        XCTAssertFalse(Bridge.accepts(scheme: "https", host: "todo.example.com.evil.example", port: 443, mainFrame: true, configured: server))
        XCTAssertFalse(Bridge.accepts(scheme: "https", host: "example.com", port: 443, mainFrame: true, configured: server))
        XCTAssertFalse(Bridge.accepts(scheme: "https", host: "sub.todo.example.com", port: 443, mainFrame: true, configured: server))
        // Pages without a host (about:blank, data:, file:) never are.
        XCTAssertFalse(Bridge.accepts(scheme: "about", host: "", port: 0, mainFrame: true, configured: server))
        let file = try XCTUnwrap(URL(string: "file:///index.html"))
        XCTAssertFalse(Bridge.accepts(scheme: "file", host: "", port: 0, mainFrame: true, configured: file))

        let local = try XCTUnwrap(URL(string: "http://localhost:8080/today"))
        XCTAssertTrue(Bridge.accepts(scheme: "http", host: "localhost", port: 8080, mainFrame: true, configured: local))
        XCTAssertFalse(Bridge.accepts(scheme: "http", host: "localhost", port: 8081, mainFrame: true, configured: local))
        XCTAssertFalse(Bridge.accepts(scheme: "http", host: "127.0.0.1", port: 8080, mainFrame: true, configured: local))
        XCTAssertFalse(Bridge.accepts(scheme: "https", host: "localhost", port: 8080, mainFrame: true, configured: local))

        let custom = try XCTUnwrap(URL(string: "https://todo.example.com:8443"))
        XCTAssertTrue(Bridge.accepts(scheme: "https", host: "todo.example.com", port: 8443, mainFrame: true, configured: custom))
        XCTAssertFalse(Bridge.accepts(scheme: "https", host: "todo.example.com", port: 443, mainFrame: true, configured: custom))
    }

    func testCapabilitiesFollowTheDevice() {
        XCTAssertEqual(Bridge.capabilities(biometric: false, share: true),
                       ["reminders", "widgets", "share", "links", "obsidian-links", "system-bars", "haptics"])
        XCTAssertTrue(Bridge.capabilities(biometric: true, share: true).contains("biometric"))
    }

    /// shell-repairs D5, D3: haptics only with a screen and an engine; never `files`, since
    /// WebKit downloads what the web app saves.
    func testHapticsNeedAScreenAndFilesAreNeverListed() {
        XCTAssertTrue(Bridge.capabilities(biometric: false, share: true, haptics: true).contains("haptics"))
        XCTAssertFalse(Bridge.capabilities(biometric: false, share: true, haptics: false).contains("haptics"))
        XCTAssertEqual(Bridge.capabilities(biometric: false, share: false), ["reminders", "widgets"])
        XCTAssertFalse(Bridge.capabilities(biometric: true, share: false, haptics: true).contains("haptics"))
        for share in [true, false] {
            XCTAssertFalse(Bridge.capabilities(biometric: true, share: share).contains("files"))
        }
    }

    func testThePageScriptOffersHaptic() throws {
        let origin = try XCTUnwrap(URL(string: "https://todo.example.com"))
        let script = Bridge.script(origin: origin, app: "1.2.3", capabilities: ["haptics"])
        XCTAssertTrue(script.contains("haptic: function (kind) { call('haptic', [String(kind)]) }"))
        XCTAssertFalse(script.contains("saveFile"))
    }

    /// shell-repairs D5: the kinds the web app hands over (the shared bridge fixture, with
    /// the Android tests) are played, and any other kind is ignored.
    func testHapticKindsFollowTheBridgeFixture() throws {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/bridge/haptics.json")
        let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        XCTAssertEqual(fixture["method"] as? String, "haptic")
        let kinds = try XCTUnwrap(fixture["kinds"] as? [String])
        XCTAssertEqual(Set(kinds), Set(Haptics.Kind.allCases.map(\.rawValue)))
        for kind in kinds { XCTAssertNotNil(Haptics.kind(kind), kind) }
        let unknown = try XCTUnwrap(fixture["unknown"] as? String)
        XCTAssertNil(Haptics.kind(unknown), unknown)
    }

    func testHapticKinds() {
        XCTAssertEqual(Haptics.kind("tick"), .tick)
        XCTAssertEqual(Haptics.kind("success"), .success)
        for other in ["", "warning", "Tick", "tick ", "error"] { XCTAssertNil(Haptics.kind(other), other) }
    }

    /// shell-repairs D7: the remembered bars decide the status bar icons, and nothing
    /// remembered leaves them to the system.
    func testTheStatusBarStyleFollowsTheStoredBars() {
        XCTAssertEqual(StatusBar.style(lightIcons: true), .lightContent)
        XCTAssertEqual(StatusBar.style(lightIcons: false), .darkContent)
        XCTAssertEqual(StatusBar.style(lightIcons: nil), .default)
        XCTAssertEqual(StatusBar.style(stored: "{\"color\":\"#101014\",\"dark\":true}"), .lightContent)
        XCTAssertEqual(StatusBar.style(stored: "{\"color\":\"#ffffff\",\"dark\":false}"), .darkContent)
        XCTAssertEqual(StatusBar.style(stored: nil), .default)
        XCTAssertEqual(StatusBar.style(stored: "{\"color\":\"red\",\"dark\":true}"), .default)
    }

    /// A new choice reaches the style the root controller answers; forgetting the server clears it.
    func testAHandOverChangesTheStyleTheRootAnswers() {
        defer { StatusBar.show(lightIcons: nil) }
        StatusBar.show(lightIcons: true)
        XCTAssertEqual(StatusBar.current, .lightContent)
        XCTAssertEqual(StatusBarController(content: UIViewController()).preferredStatusBarStyle, .lightContent)
        StatusBar.show(lightIcons: false)
        XCTAssertEqual(StatusBar.current, .darkContent)
        StatusBar.show(lightIcons: nil)
        XCTAssertEqual(StatusBar.current, .default)
    }

    func testSafeExternalAllowsOnlyOpenableSchemes() {
        XCTAssertTrue(Bridge.safeExternal("https://example.com"))
        XCTAssertTrue(Bridge.safeExternal("mailto:a@example.com"))
        XCTAssertFalse(Bridge.safeExternal("javascript:alert(1)"))
        XCTAssertFalse(Bridge.safeExternal("file:///etc/passwd"))
    }

    /// obsidian-origin: the bridge fixture the web app writes (shared with the Android
    /// tests): the note link it hands over is accepted, and only the D2 shape is.
    func testObsidianNoteLinksFollowTheBridgeFixture() throws {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/bridge/external-links.json")
        let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        let handed = try XCTUnwrap(fixture["handed"] as? [String])
        let accepted = try XCTUnwrap(fixture["accepted"] as? [String])
        let refused = try XCTUnwrap(fixture["refused"] as? [String])
        XCTAssertEqual(handed.count, 1)
        for url in handed + accepted { XCTAssertTrue(Bridge.externalLink(url), url) }
        for url in refused { XCTAssertFalse(Bridge.obsidianNote(url), url) }
        XCTAssertFalse(Bridge.safeExternal("obsidian://open?vault=Notes&file=a"))
    }

    /// theme-engine D8: the bars the web app hands over are read as written (the shared
    /// fixture, with the Android tests), and a malformed payload is ignored.
    func testSystemBarsFollowTheBridgeFixture() throws {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/bridge/system-bars.json")
        let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        XCTAssertEqual(fixture["method"] as? String, "setSystemBars")
        let handed = try XCTUnwrap(fixture["handed"] as? [[String: Any]])
        XCTAssertGreaterThanOrEqual(handed.count, 2)
        for h in handed {
            let payload = try XCTUnwrap(h["payload"] as? String)
            let bars = try XCTUnwrap(SystemBars.parse(payload), payload)
            XCTAssertEqual(bars.hex, h["color"] as? String, payload)
            XCTAssertEqual(bars.lightIcons, h["lightIcons"] as? Bool, payload)
        }
        let refused = try XCTUnwrap(fixture["refused"] as? [String])
        for payload in refused { XCTAssertNil(SystemBars.parse(payload), payload) }
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
    /// ios-bridge-portable: the portable build carries no `WKAppBoundDomains` key, not
    /// even a placeholder, since the key alone denies the bridge on every other server.
    func testThePortableBuildDeclaresNoAppBoundDomains() throws {
        XCTAssertNil(Bundle.main.object(forInfoDictionaryKey: "WKAppBoundDomains"))
        XCTAssertEqual(AppBoundDomains.configured, [])
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

    /// shell-repairs D6: Done, Snooze and Dismiss build the addresses of the shared bridge
    /// fixture (the Android app's too), which the web app reads.
    func testReminderActionsBuildTheFixturesAddresses() throws {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/bridge/actions.json")
        let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        let cases = try XCTUnwrap(fixture["reminderActions"] as? [[String: String]])
        // Plain ids only: Android writes a space as "+", this shell as "%20"; the web app reads both.
        let plain = cases.filter { $0["id"] == "abc" }
        XCTAssertEqual(Set(plain.compactMap { $0["action"] }), Set(Notifications.actions))
        let model = AppModel()
        for c in plain {
            let id = try XCTUnwrap(c["id"])
            model.show(reminder: id, action: c["action"])
            XCTAssertEqual(model.pendingPath, c["path"])
        }
    }

    func testDoneOpensTheReminderWithDone() {
        let model = AppModel()
        model.show(reminder: "abc", action: "done")
        XCTAssertEqual(model.pendingPath, "/?reminder=abc&action=done")
        model.handle(url: URL(string: "opentodo://reminder/r1?action=done")!)
        XCTAssertEqual(model.pendingPath, "/?reminder=r1&action=done")
    }

    func testAReminderLinkKeepsOnlyTheKnownActions() {
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

/// The second review's fixes (ios-shell): untrusted input from the shared container, the
/// server's widget data and notifications, each pinned by a test.
final class ShareInboxSafetyTests: XCTestCase {
    func testOnlyAFileDirectlyInTheInboxIsRead() {
        XCTAssertTrue(ShareInbox.isInboxPath("share/0A1B-photo.jpg"))
        for path in ["share/../Library/Cookies/Cookies.binarycookies", "../share/x", "share/a/b", "share/", "share/..",
                     "share/.", "/share/x", "Library/x", "share\\..\\x", "share/a\\b", ""] {
            XCTAssertFalse(ShareInbox.isInboxPath(path), path)
        }
    }

    func testAPathOutsideTheInboxIsNotHandedOver() throws {
        // A real file next to the inbox: the index points at it by climbing out.
        let outside = Store.url("not-a-share.txt")
        try FileManager.default.createDirectory(at: Store.container, withIntermediateDirectories: true)
        try Data("secret".utf8).write(to: outside)
        defer { try? FileManager.default.removeItem(at: outside) }
        let entry = ShareInbox.Entry(title: nil, text: nil, url: nil,
                                     files: [.init(name: "x.txt", type: "text/plain", path: "share/../not-a-share.txt")])
        XCTAssertNil(ShareInbox.message(entry))
    }

    func testStoredNameHasNoSeparatorsAndAFileSystemSafeLength() {
        XCTAssertEqual(ShareInbox.storedName("photo.jpg"), "photo.jpg")
        XCTAssertEqual(ShareInbox.storedName("a/b\\c:d.txt"), "a-b-c-d.txt")
        XCTAssertEqual(ShareInbox.storedName("tab\there.txt"), "tab-here.txt")
        XCTAssertEqual(ShareInbox.storedName(".."), "file")
        XCTAssertEqual(ShareInbox.storedName("   "), "file")
        let long = String(repeating: "x", count: 400) + ".pdf"
        let stored = ShareInbox.storedName(long)
        XCTAssertLessThanOrEqual(stored.utf8.count, 120)
        XCTAssertTrue(stored.hasSuffix(".pdf"), "the extension is kept")
    }
}

final class WidgetSafetyTests: XCTestCase {
    private func task(priority: Int) -> WidgetPublication.Task {
        WidgetPublication.Task(id: "a", title: nil, time: nil, priority: priority, overdue: false)
    }

    func testOnlyPrioritiesOneToThreeAreFlagged() {
        XCTAssertTrue(task(priority: 1).flagged)
        XCTAssertTrue(task(priority: 3).flagged)
        XCTAssertFalse(task(priority: 4).flagged, "4 means no priority")
        XCTAssertFalse(task(priority: 0).flagged)
    }

    func testATaskLinkIsEncodedAndNeverCrashes() {
        XCTAssertEqual(WidgetPublication.taskLink("abc")?.absoluteString, "opentodo://task/abc")
        XCTAssertEqual(WidgetPublication.taskLink("a b?c")?.absoluteString, "opentodo://task/a%20b%3Fc")
        XCTAssertEqual(WidgetPublication.taskLink("../x")?.absoluteString, "opentodo://task/..%2Fx")
        XCTAssertNil(WidgetPublication.taskLink(""))
    }

    @MainActor
    func testAWidgetLinkOpensThatTask() throws {
        let model = AppModel()
        model.handle(url: try XCTUnwrap(WidgetPublication.taskLink("a b")))
        XCTAssertEqual(model.pendingPath, "/?task=a%20b")
    }
}

final class NotificationRouteTests: XCTestCase {
    func testATapOpensTheTask() {
        XCTAssertEqual(Notifications.route(reminder: "r1", task: "t1", action: UNNotificationDefaultActionIdentifier), .task("t1"))
    }

    func testSnoozeAndDismissGoToTheReminder() {
        XCTAssertEqual(Notifications.route(reminder: "r1", task: "t1", action: "snooze"), .reminder("r1", action: "snooze"))
        XCTAssertEqual(Notifications.route(reminder: "r1", task: "t1", action: "dismiss"), .reminder("r1", action: "dismiss"))
    }

    /// shell-repairs D6: the third button, first in the notification.
    func testDoneGoesToTheReminder() {
        XCTAssertEqual(Notifications.route(reminder: "r1", task: "t1", action: "done"), .reminder("r1", action: "done"))
        XCTAssertEqual(Notifications.actions, ["done", "snooze", "dismiss"])
        XCTAssertEqual(Notifications.route(reminder: "r1", task: "t1", action: "complete"), .app)
    }

    func testTheTestNotificationOnlyOpensTheApp() {
        for action in [UNNotificationDefaultActionIdentifier, "snooze", "dismiss"] {
            XCTAssertEqual(Notifications.route(reminder: Notifications.testReminder, task: "", action: action), .app, action)
        }
    }

    func testEmptyOrMissingIdsOnlyOpenTheApp() {
        XCTAssertEqual(Notifications.route(reminder: "r1", task: "", action: UNNotificationDefaultActionIdentifier), .app)
        XCTAssertEqual(Notifications.route(reminder: nil, task: nil, action: UNNotificationDefaultActionIdentifier), .app)
        XCTAssertEqual(Notifications.route(reminder: "", task: "t1", action: "snooze"), .task("t1"))
        XCTAssertEqual(Notifications.route(reminder: "r1", task: "t1", action: UNNotificationDismissActionIdentifier), .app)
    }

    @MainActor
    func testAnEmptyTaskIdLeavesNoPath() {
        let model = AppModel()
        model.show(task: "")
        XCTAssertNil(model.pendingPath)
        model.show(reminder: "", action: "snooze")
        XCTAssertNil(model.pendingPath)
    }
}

final class VersionNormalizeTests: XCTestCase {
    func testTheBridgeReportsTheBundleVersionWithoutAV() {
        XCTAssertEqual(Version.normalize("v1.2.3"), "1.2.3")
        XCTAssertEqual(Version.normalize("1.2.3"), "1.2.3")
        XCTAssertEqual(Version.normalize(nil), "0.0.0-dev")
        XCTAssertEqual(Version.normalize(" "), "0.0.0-dev")
    }
}

/// Saving files (shell-repairs D3, native-shells "Saving files"): what becomes a download.
final class DownloadsTests: XCTestCase {
    private let server = URL(string: "https://todo.example.com")!
    private func u(_ s: String) -> URL { URL(string: s)! }

    func testAFileOfTheServerIsSaved() {
        XCTAssertTrue(Downloads.saves(action: u("https://todo.example.com/api/v1/export"), server: server, shouldPerformDownload: true))
        XCTAssertTrue(Downloads.saves(action: u("https://Todo.Example.com:443/api/v1/export?format=json"), server: server, shouldPerformDownload: true))
        XCTAssertTrue(Downloads.saves(response: u("https://todo.example.com/api/v1/export"), server: server, isAttachment: true, canShowMIMEType: true))
        XCTAssertTrue(Downloads.saves(response: u("https://todo.example.com/api/v1/archive"), server: server, isAttachment: false, canShowMIMEType: false))
    }

    func testAFileThePageMadeIsSaved() {
        let blob = u("blob:https://todo.example.com/6f1c2a50-0b0f-4d4e-9a53-2f5a8d0f6c11")
        XCTAssertTrue(Downloads.fromServer(blob, server: server))
        XCTAssertTrue(Downloads.saves(action: blob, server: server, shouldPerformDownload: true))
        let local = u("http://localhost:8080")
        XCTAssertTrue(Downloads.saves(action: u("blob:http://localhost:8080/6f1c2a50"), server: local, shouldPerformDownload: true))
        XCTAssertFalse(Downloads.saves(action: u("blob:http://localhost:8081/6f1c2a50"), server: local, shouldPerformDownload: true))
    }

    func testNothingIsSavedFromAnotherSite() {
        for address in ["https://evil.example.com/file.zip", "http://todo.example.com/file.zip", "https://todo.example.com:8443/file.zip",
                        "https://todo.example.com.evil.example/file.zip", "blob:https://evil.example.com/6f1c2a50",
                        "blob:null/6f1c2a50", "data:text/plain;base64,aGk=", "file:///etc/passwd", "about:blank"] {
            XCTAssertFalse(Downloads.saves(action: u(address), server: server, shouldPerformDownload: true), address)
            XCTAssertFalse(Downloads.saves(response: u(address), server: server, isAttachment: true, canShowMIMEType: false), address)
        }
    }

    func testAPageNavigationIsNotADownload() {
        XCTAssertFalse(Downloads.saves(action: u("https://todo.example.com/today"), server: server, shouldPerformDownload: false))
        XCTAssertFalse(Downloads.saves(action: u("blob:https://todo.example.com/6f1c2a50"), server: server, shouldPerformDownload: false))
        XCTAssertFalse(Downloads.saves(response: u("https://todo.example.com/today"), server: server, isAttachment: false, canShowMIMEType: true))
    }

    func testAnAttachmentIsReadFromTheHeader() {
        let url = u("https://todo.example.com/api/v1/export")
        func response(_ headers: [String: String]) -> URLResponse {
            HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
        }
        XCTAssertTrue(Downloads.isAttachment(response(["Content-Disposition": "attachment; filename=\"opentodo.json\""])))
        XCTAssertTrue(Downloads.isAttachment(response(["content-disposition": " Attachment"])))
        XCTAssertFalse(Downloads.isAttachment(response(["Content-Disposition": "inline; filename=\"a.png\""])))
        XCTAssertFalse(Downloads.isAttachment(response([:])))
        XCTAssertFalse(Downloads.isAttachment(URLResponse(url: url, mimeType: "text/plain", expectedContentLength: 2, textEncodingName: nil)))
    }

    func testTheNameIsItsLastPathComponent() {
        XCTAssertEqual(Downloads.fileName("opentodo-recovery-key.txt"), "opentodo-recovery-key.txt")
        XCTAssertEqual(Downloads.fileName("../../Library/Cookies/Cookies.binarycookies"), "Cookies.binarycookies")
        XCTAssertEqual(Downloads.fileName("/etc/passwd"), "passwd")
        XCTAssertEqual(Downloads.fileName("a\\b\\export.json"), "export.json")
        XCTAssertEqual(Downloads.fileName("exports/"), "exports")
        for empty in ["", " ", "/", "..", ".", "a/..", "../"] { XCTAssertEqual(Downloads.fileName(empty), "download", empty) }
    }
}
