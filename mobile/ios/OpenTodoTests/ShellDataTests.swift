import ActivityKit
import UIKit
import UserNotifications
import WebKit
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

    /// Which addresses are the server's own: the cases both apps read (Android's SignInFlowTest too).
    private func cases() throws -> [String: Any] {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/origin/cases.json")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
    }

    func testTheServersOwnAddressesFollowTheSharedCases() throws {
        let list = try XCTUnwrap(try cases()["same"] as? [[String: Any]])
        XCTAssertFalse(list.isEmpty)
        for c in list {
            let address = try XCTUnwrap(c["url"] as? String)
            let url = try XCTUnwrap(URL(string: address), address)
            let server = try XCTUnwrap(URL(string: try XCTUnwrap(c["server"] as? String)))
            let same = try XCTUnwrap(c["same"] as? Bool)
            XCTAssertEqual(Origin.same(url, server), same, address)
            XCTAssertEqual(SignInFlow.originOf(url).map { $0 == SignInFlow.originOf(server) } ?? false, same, address)
        }
    }

    func testWebAddressesAndTheirHostFollowTheSharedCases() throws {
        let list = try XCTUnwrap(try cases()["web"] as? [[String: Any]])
        XCTAssertFalse(list.isEmpty)
        for c in list {
            let address = try XCTUnwrap(c["url"] as? String)
            let url = try XCTUnwrap(URL(string: address), address)
            XCTAssertEqual(SignInFlow.originOf(url) != nil, try XCTUnwrap(c["web"] as? Bool), address)
            XCTAssertEqual(SignInFlow.hostOf(url), try XCTUnwrap(c["host"] as? String), address)
        }
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

/// shell-first-paint: the launch screen has the app's colour, light and dark, and the web
/// view stays hidden over that colour until it has something to show.
@MainActor
final class LaunchScreenTests: XCTestCase {
    func testTheLaunchScreenNamesAColourOfTheBundle() throws {
        let launch = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "UILaunchScreen") as? [String: Any])
        XCTAssertEqual(launch["UIColorName"] as? String, ShellController.launchColor)
        let colour = try XCTUnwrap(UIColor(named: ShellController.launchColor), "the asset catalog has the colour")
        let light = colour.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))
        let dark = colour.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark))
        XCTAssertNotEqual(light, dark, "the colour has a dark appearance")
    }

    func testTheWebViewIsHiddenUntilItIsRevealed() throws {
        let shell = ShellController(origin: try XCTUnwrap(URL(string: "https://todo.example")))
        XCTAssertFalse(shell.revealed)
        XCTAssertEqual(shell.webView.alpha, 0)
        shell.reveal()
        XCTAssertTrue(shell.revealed)
        XCTAssertEqual(shell.webView.alpha, 1)
    }

    /// ios-keyboard-bar D1: the web view's content view supplies no accessory bar, and
    /// removing it twice changes nothing.
    func testTheKeyboardHasNoAccessoryBar() throws {
        let shell = ShellController(origin: try XCTUnwrap(URL(string: "https://todo.example")))
        let content = try XCTUnwrap(shell.webView.scrollView.subviews.first { NSStringFromClass(type(of: $0)) == KeyboardBar.className })
        XCTAssertNil(content.inputAccessoryView)
        XCTAssertTrue(KeyboardBar.remove(from: shell.webView))
        XCTAssertEqual(NSStringFromClass(type(of: content)), KeyboardBar.className)
        // A second web view gets the same class, made once.
        let other = WKWebView(frame: .zero)
        XCTAssertTrue(KeyboardBar.remove(from: other))
        XCTAssertNil(other.scrollView.subviews.first { NSStringFromClass(type(of: $0)) == KeyboardBar.className }?.inputAccessoryView)
    }

    /// Over the launch colour the system chooses the status bar icons; the bars' own come with the page.
    func testTheStatusBarIconsWaitForTheWebView() throws {
        defer { StatusBar.show(lightIcons: nil) }
        let shell = ShellController(origin: try XCTUnwrap(URL(string: "https://todo.example")))
        let bars = try XCTUnwrap(SystemBars.parse("{\"color\":\"#101014\",\"dark\":true}"))
        shell.apply(bars)
        XCTAssertEqual(StatusBar.current, .default)
        shell.reveal()
        XCTAssertEqual(StatusBar.current, .lightContent)
        shell.apply(try XCTUnwrap(SystemBars.parse("{\"color\":\"#ffffff\",\"dark\":false}")))
        XCTAssertEqual(StatusBar.current, .darkContent)
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
    /// The cases both apps read (Android's `ShareMapperTest` too): what a share becomes.
    private func cases() throws -> [String: Any] {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/share/cases.json")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
    }

    /// The decoded query of `/share?…`, as the web app's URLSearchParams reads it.
    private func query(_ path: String) throws -> [String: String] {
        let parts = try XCTUnwrap(URLComponents(string: path))
        XCTAssertEqual(parts.path, "/share")
        var out: [String: String] = [:]
        for item in parts.queryItems ?? [] {
            XCTAssertNil(out[item.name], "\(item.name) appears twice in \(path)")
            out[item.name] = item.value ?? ""
        }
        return out
    }

    /// iOS 16's `URL(string:)` refuses anything but ASCII: a share with an é was dropped.
    func testTheAddressIsASCIIForAnyText() {
        let path = ShareMap.path(title: "Café ½", text: "日本語 🎉", url: "https://example.com/ü", withFiles: false)
        XCTAssertTrue(path.unicodeScalars.allSatisfy(\.isASCII), path)
        XCTAssertNotNil(URLComponents(string: path), path)
    }

    func testPathsFollowTheSharedCases() throws {
        let paths = try XCTUnwrap(try cases()["paths"] as? [[String: Any]])
        XCTAssertFalse(paths.isEmpty)
        for (i, c) in paths.enumerated() {
            let got = ShareMap.path(title: c["title"] as? String, text: c["text"] as? String,
                                    withFiles: try XCTUnwrap(c["withFiles"] as? Bool))
            XCTAssertEqual(try query(got), try XCTUnwrap(c["expect"] as? [String: String]), "case \(i): \(c)")
        }
    }

    func testLimitsFollowTheSharedCases() throws {
        let accept = try XCTUnwrap(try cases()["accept"] as? [[String: Any]])
        XCTAssertFalse(accept.isEmpty)
        for (i, c) in accept.enumerated() {
            let sizes = try XCTUnwrap(c["sizes"] as? [NSNumber]).map(\.int64Value)
            XCTAssertEqual(ShareMap.accept(sizes), try XCTUnwrap(c["expect"] as? [Int]), "case \(i): \(sizes)")
        }
    }

    func testASeparateUrlIsCarriedAndBeatsTheText() {
        // What Safari shares: a URL attachment plus a page title, no text.
        XCTAssertEqual(ShareMap.path(title: "Example", text: nil, url: "https://example.com/a?b=1", withFiles: false),
                       "/share?title=Example&url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1")
        XCTAssertEqual(ShareMap.path(title: nil, text: "see https://example.com", url: "https://example.com", withFiles: false),
                       "/share?text=see%20https%3A%2F%2Fexample.com&url=https%3A%2F%2Fexample.com")
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
    /// The cases both apps read (Android's ReminderScheduleTest too): reminders/schedule.json.
    /// Before them, one entry the decoder could not read dropped the whole schedule.
    func testTheScheduleFollowsTheSharedCases() throws {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/reminders/schedule.json")
        let doc = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        let now = Date(timeIntervalSince1970: try XCTUnwrap(doc["now"] as? Double) / 1000)
        let cases = try XCTUnwrap(doc["cases"] as? [[String: Any]])
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let name = c["name"] as? String ?? "?"
            let want = try XCTUnwrap(c["armed"] as? [[String: Any]], name).map { r in
                "\(r["id"] as? String ?? "?") at \(r["fireAt"] as? Double ?? -1): \(r["title"] as? String ?? "no title")"
            }
            let got = Reminders.select(Reminders.parse(try XCTUnwrap(c["handed"] as? String, name)), now: now).map { r in
                "\(r.id) at \(r.fireAt): \(r.title ?? "no title")"
            }
            XCTAssertEqual(got, want, name)
        }
    }

    /// iOS keeps at most 64 pending notifications: the earliest 64.
    func testSelectKeepsTheEarliestUpToTheLimit() {
        let now = Date(timeIntervalSince1970: 1_000)
        let handed = (0..<70).reversed().map { Reminders.Handed(id: "r\($0)", taskId: "t", fireAt: 2_000_000 + Double($0) * 1000, title: nil) }
        XCTAssertEqual(Reminders.select(handed, now: now).map(\.id), (0..<64).map { "r\($0)" })
        XCTAssertEqual(Reminders.select(handed, now: now, limit: 1).map(\.id), ["r0"])
    }

    /// shell-reminders-on D2: every combination of status, screen and schedule. Only the
    /// visible app asks, only with a reminder, and only when nobody was asked yet.
    func testThePermissionIsAskedOnlyByTheVisibleAppWithAReminder() {
        let allowed: [UNAuthorizationStatus] = [.authorized, .provisional, .ephemeral]
        for interactive in [true, false] {
            for status in allowed + [.denied, .notDetermined] {
                XCTAssertEqual(Reminders.permission(status: status, interactive: interactive, hasReminders: false), .schedule,
                               "an empty schedule never asks: \(status.rawValue) \(interactive)")
            }
            for status in allowed {
                XCTAssertEqual(Reminders.permission(status: status, interactive: interactive, hasReminders: true), .schedule)
            }
            XCTAssertEqual(Reminders.permission(status: .denied, interactive: interactive, hasReminders: true), .refuse)
        }
        XCTAssertEqual(Reminders.permission(status: .notDetermined, interactive: true, hasReminders: true), .ask)
        XCTAssertEqual(Reminders.permission(status: .notDetermined, interactive: false, hasReminders: true), .refuse)
    }

    func testParseKeepsTheTaskAndTheTitle() {
        let json = #"[{"id":"a","taskId":"b","fireAt":1700000000000,"title":"Call"}]"#
        XCTAssertEqual(Reminders.parse(json), [Reminders.Handed(id: "a", taskId: "b", fireAt: 1_700_000_000_000, title: "Call")])
    }

    /// The web app's scheduleReminders payloads of the shared bridge fixtures (the Android
    /// app's BridgeFixtureTest reads them too): with titles, an encrypted account without
    /// them, and a sign-out that empties the schedule.
    func testTheSharedBridgePayloadsScheduleAsTheFixtureSays() throws {
        for name in ["reminders", "reminders-encrypted", "reminders-urgent", "reminders-signed-out"] {
            let file = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("android/app/src/test/resources/bridge/\(name).json")
            let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any], name)
            XCTAssertEqual(fixture["method"] as? String, "scheduleReminders", name)
            let nowMs = try XCTUnwrap(fixture["now"] as? Double, name)
            let want = try XCTUnwrap(fixture["expect"] as? [[String: Any]], name).map { r in
                Reminders.Handed(id: r["id"] as? String ?? "?", taskId: r["taskId"] as? String ?? "?",
                                 fireAt: r["fireAt"] as? Double ?? -1, title: r["title"] as? String,
                                 urgent: r["urgent"] as? Bool ?? false, due: r["due"] as? String)
            }
            let payload = try XCTUnwrap(fixture["payload"] as? String, name)
            XCTAssertEqual(Reminders.select(Reminders.parse(payload), now: Date(timeIntervalSince1970: nowMs / 1000)), want, name)
        }
    }
}

/// Urgent reminders as alarms (ios-urgent-alarms): the rules outside AlarmKit, so they run on
/// the CI's Xcode 16.4 too, where the AlarmKit calls are compiled out.
@MainActor
final class AlarmTests: XCTestCase {
    private func handed(_ id: String, at: Double, urgent: Bool = true, title: String? = nil) -> Reminders.Handed {
        Reminders.Handed(id: id, taskId: "t", fireAt: at, title: title, urgent: urgent)
    }

    /// Design D4: the notification permission's rule. Only the visible app asks; without
    /// AlarmKit, or refused, it is a notification.
    func testTheAlarmPermissionIsAskedOnlyByTheVisibleApp() {
        for interactive in [true, false] {
            for state in [Alarms.Authorization.notDetermined, .authorized, .denied] {
                XCTAssertEqual(Alarms.route(available: false, state: state, interactive: interactive), .notification)
            }
            XCTAssertEqual(Alarms.route(available: true, state: .authorized, interactive: interactive), .alarm)
            XCTAssertEqual(Alarms.route(available: true, state: .denied, interactive: interactive), .notification)
        }
        XCTAssertEqual(Alarms.route(available: true, state: .notDetermined, interactive: true), .ask)
        XCTAssertEqual(Alarms.route(available: true, state: .notDetermined, interactive: false), .notification)
    }

    /// Design D3: only urgent reminders still ahead become alarms; one handed over at its time
    /// stays a notification.
    func testOnlyUrgentRemindersAheadAreAlarms() {
        let now = Date(timeIntervalSince1970: 1_000)
        let chosen = [
            handed("late", at: 1_000_000 - 30_000),
            handed("now", at: 1_000_500),
            handed("quiet", at: 2_000_000, urgent: false),
            handed("loud", at: 2_000_000),
        ]
        XCTAssertEqual(Alarms.candidates(chosen, now: now).map(\.id), ["loud"])
    }

    /// The hand-over's `urgent`: only a JSON true counts.
    func testParseReadsUrgent() {
        let json = #"[{"id":"a","taskId":"t","fireAt":1,"urgent":true},{"id":"b","taskId":"t","fireAt":2},{"id":"c","taskId":"t","fireAt":3,"urgent":"yes"}]"#
        XCTAssertEqual(Reminders.parse(json).map(\.urgent), [true, false, false])
    }

    /// Design D5: a reminder keeps its alarm id; two reminders never share one.
    func testTheAlarmIdIsStableAndAVersion5UUID() {
        let id = Alarms.alarmID("r-soon")
        XCTAssertEqual(id, Alarms.alarmID("r-soon"))
        XCTAssertNotEqual(id, Alarms.alarmID("r-late"))
        XCTAssertEqual(id.uuid.6 >> 4, 5)
        XCTAssertEqual(id.uuid.8 >> 6, 2)
    }

    /// Design D5: an unchanged alarm is left alone, a moved or renamed one armed again, one
    /// no longer wanted (or not ours to know) cancelled, a new one armed.
    func testChangesTouchOnlyWhatMoved() {
        let same = handed("same", at: 10_000, title: "A")
        let moved = handed("moved", at: 20_000)
        let renamed = handed("renamed", at: 30_000, title: "New")
        let new = handed("new", at: 40_000)
        let now = Date(timeIntervalSince1970: 1)  // 1,000 ms: every alarm here is still ahead
        let current: [UUID: Alarms.Armed] = [
            Alarms.alarmID("same"): .init(signature: Alarms.signature(same)),
            Alarms.alarmID("moved"): .init(signature: Alarms.signature(handed("moved", at: 15_000))),
            Alarms.alarmID("renamed"): .init(signature: Alarms.signature(handed("renamed", at: 30_000, title: "Old"))),
            Alarms.alarmID("gone"): .init(signature: Alarms.signature(handed("gone", at: 50_000))),
            Alarms.alarmID("unknown"): .init(signature: nil),
        ]
        let plan = Alarms.changes(current: current, wanted: [same, moved, renamed, new], now: now)
        XCTAssertEqual(plan.schedule.map(\.id), ["moved", "renamed", "new"])
        XCTAssertEqual(Set(plan.cancel), Set(["moved", "renamed", "gone", "unknown"].map(Alarms.alarmID)))
        XCTAssertEqual(plan.kept, ["same"])
        // Nothing wanted and nothing ringing or past: every alarm goes.
        XCTAssertEqual(Set(Alarms.changes(current: current, wanted: [], now: now).cancel), Set(current.keys))
    }

    /// Review of #2020: the hand-over after the firing time no longer lists the reminder (the
    /// web app hands over only reminders ahead), so a ringing alarm must survive it, the empty
    /// hand-over and the denied one included; so must one past its time that the system has not
    /// removed yet.
    func testARingingAlarmIsNeverCancelledByAHandOver() {
        let now = Date(timeIntervalSince1970: 100)  // 100,000 ms
        let ringing = handed("ringing", at: 99_000)
        let rang = handed("rang", at: 90_000)
        let ahead = handed("ahead", at: 200_000)
        let current: [UUID: Alarms.Armed] = [
            Alarms.alarmID("ringing"): .init(signature: Alarms.signature(ringing), alerting: true),
            Alarms.alarmID("rang"): .init(signature: Alarms.signature(rang)),
            Alarms.alarmID("ahead"): .init(signature: Alarms.signature(ahead)),
            Alarms.alarmID("unknown-ringing"): .init(signature: nil, alerting: true),
        ]
        // Empty (sign-out, nothing ahead) and denied (notifications or alarms refused) hand over [].
        let empty = Alarms.changes(current: current, wanted: [], now: now)
        XCTAssertEqual(empty.cancel, [Alarms.alarmID("ahead")])
        XCTAssertTrue(empty.schedule.isEmpty)
        // A later hand-over with the reminder ahead again (snoozed while it still rings): the
        // ringing alarm stays and the snoozed time is not armed over it.
        let snoozed = handed("ringing", at: 700_000)
        let again = Alarms.changes(current: current, wanted: [snoozed, ahead], now: now)
        XCTAssertFalse(again.cancel.contains(Alarms.alarmID("ringing")))
        XCTAssertFalse(again.schedule.contains { $0.id == "ringing" })
        XCTAssertEqual(again.kept, ["ahead"])
        // Once it stopped ringing, a snoozed reminder is armed again over the stale alarm.
        let stopped = current.merging([Alarms.alarmID("rang"): .init(signature: Alarms.signature(rang))]) { a, _ in a }
        let rearm = Alarms.changes(current: stopped, wanted: [handed("rang", at: 700_000)], now: now)
        XCTAssertTrue(rearm.cancel.contains(Alarms.alarmID("rang")))
        XCTAssertEqual(rearm.schedule.map(\.id), ["rang"])
    }

    func testArmedAtReadsTheSignature() {
        XCTAssertEqual(Alarms.armedAt(Alarms.signature(handed("a", at: 1_792_674_000_000))), 1_792_674_000_000)
        XCTAssertNil(Alarms.armedAt(nil))
    }

    /// The signature keeps no title, only a digest.
    func testTheSignatureCarriesNoTitle() {
        XCTAssertFalse(Alarms.signature(handed("a", at: 1, title: "Call the plumber")).contains("plumber"))
    }

    /// Without AlarmKit (this SDK or an older iOS) nothing is armed, so every urgent reminder
    /// is scheduled as a notification.
    func testWithoutAlarmKitNothingIsArmed() async {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) { return }
        #endif
        let armed = await AlarmScheduler.replace([handed("a", at: Date().timeIntervalSince1970 * 1000 + 60_000)], interactive: false)
        XCTAssertTrue(armed.isEmpty)
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

    private typealias Completed = WidgetPublication.Completed

    private func bridgeFixture(_ name: String) throws -> [String: Any] {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/bridge/\(name).json")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any], name)
    }

    /// completed-widget D1, D2: the Completed widget's numbers from the shared bridge fixtures
    /// (Android's BridgeFixtureTest reads them too): the week, and a locked account's count alone.
    /// The Today payload without `completed` gives no Completed widget.
    func testTheCompletedWidgetReadsTheSharedPayloads() throws {
        for name in ["widget-completed", "widget-completed-locked"] {
            let fixture = try bridgeFixture(name)
            XCTAssertEqual(fixture["method"] as? String, "publishWidget", name)
            let want = try XCTUnwrap(fixture["expect"] as? [String: Any], name)
            let days = try XCTUnwrap(want["days"] as? [[String: Any]], name).map { d in
                Completed.Day(day: d["day"] as? String ?? "?", done: d["done"] as? Int ?? -1)
            }
            let expected = Completed(updatedAt: try XCTUnwrap(want["updatedAt"] as? Double, name), locked: try XCTUnwrap(want["locked"] as? Bool, name),
                                     today: try XCTUnwrap(want["today"] as? Int, name), days: days)
            let payload = try XCTUnwrap(fixture["payload"] as? String, name)
            XCTAssertEqual(Completed.parse(Data(payload.utf8)), expected, name)
        }
        XCTAssertNil(Completed.parse(Data(try XCTUnwrap(try bridgeFixture("widget")["payload"] as? String).utf8)))
    }

    /// The cases of Android's CompletedModelTest.
    func testTheCompletedModelKeepsOnlyWhatItCanShow() {
        XCTAssertEqual(Completed.parse(Data(#"{"updatedAt":5,"locked":true,"completed":{"today":3,"days":[{"day":"2026-11-21","done":3}]}}"#.utf8)),
                       Completed(updatedAt: 5, locked: true, today: 3, days: []))
        XCTAssertEqual(Completed.parse(Data(#"{"updatedAt":5,"locked":false,"completed":{"today":-1,"days":[{"day":"x","done":2},{"day":"2026-11-21","done":-4}]}}"#.utf8)),
                       Completed(updatedAt: 5, locked: false, today: 0, days: [.init(day: "2026-11-21", done: 0)]))
        XCTAssertNil(Completed.parse(Data("not json".utf8)))
        XCTAssertNil(Completed.parse(nil))
        // At most the last seven days.
        let ten = (1...10).map { #"{"day":"2026-11-\#(String(format: "%02d", $0))","done":\#($0)}"# }.joined(separator: ",")
        XCTAssertEqual(Completed.parse(Data(#"{"completed":{"today":1,"days":[\#(ten)]}}"#.utf8))?.days.map(\.done), [4, 5, 6, 7, 8, 9, 10])
    }

    func testBarsScaleToTheBusiestDayAndKeepASliver() {
        XCTAssertEqual(Completed.barLevel(done: 4, max: 4), 100)
        XCTAssertEqual(Completed.barLevel(done: 2, max: 4), 50)
        XCTAssertEqual(Completed.barLevel(done: 1, max: 40), 6)
        XCTAssertEqual(Completed.barLevel(done: 0, max: 4), 0)
        XCTAssertEqual(Completed.barLevel(done: 0, max: 0), 0)
    }

    func testWeekdayLettersFollowTheLanguage() {
        XCTAssertEqual(Completed.weekdayLetter("2026-11-21", locale: Locale(identifier: "en")), "S")
        XCTAssertEqual(Completed.weekdayLetter("2026-11-23", locale: Locale(identifier: "en")), "M")
        XCTAssertEqual(Completed.weekdayLetter("2026-11-23", locale: Locale(identifier: "it")), "L")
        XCTAssertEqual(Completed.weekdayLetter("not a day", locale: Locale(identifier: "en")), "")
    }

    /// A tap on the Completed widget opens Statistics.
    @MainActor
    func testTheCompletedWidgetOpensStatistics() throws {
        let model = AppModel()
        model.handle(url: try XCTUnwrap(URL(string: "opentodo://stats")))
        XCTAssertEqual(model.pendingPath, "/stats")
    }

    /// The web app's publishWidget payloads of the shared bridge fixtures (the Android app's
    /// BridgeFixtureTest reads them too): the list, a locked app and a sign-out. `more` is the
    /// Android widget's own count of rows it has no room for, so it is not read here.
    func testTheSharedWidgetPayloadsReadAsTheFixtureSays() throws {
        for name in ["widget", "widget-locked", "widget-signed-out"] {
            let file = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("android/app/src/test/resources/bridge/\(name).json")
            let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any], name)
            XCTAssertEqual(fixture["method"] as? String, "publishWidget", name)
            let payload = try XCTUnwrap(fixture["payload"] as? String, name)
            let want = try XCTUnwrap(fixture["expect"] as? [String: Any], name)
            let rows = try XCTUnwrap(want["rows"] as? [[String: Any]], name)
            let decoded = try JSONDecoder().decode(WidgetPublication.Publication.self, from: Data(payload.utf8))
            let expected = WidgetPublication.Publication(
                updatedAt: try XCTUnwrap(want["updatedAt"] as? Double, name),
                locked: try XCTUnwrap(want["locked"] as? Bool, name),
                count: try XCTUnwrap(want["count"] as? Int, name),
                overdue: try XCTUnwrap(want["overdue"] as? Int, name),
                tasks: try rows.map { r in
                    WidgetPublication.Task(id: try XCTUnwrap(r["id"] as? String, name), title: r["title"] as? String, time: r["time"] as? String,
                                           priority: try XCTUnwrap(r["priority"] as? Int, name), overdue: try XCTUnwrap(r["overdue"] as? Bool, name),
                                           due: r["due"] as? String)
                },
                actions: decoded.actions)
            XCTAssertEqual(decoded, expected, name)
            // ios-widget-complete D1: the circle, and whether a tick names its occurrence (Android's WidgetModel).
            XCTAssertEqual(decoded.canComplete, try XCTUnwrap(want["canComplete"] as? Bool, name), name)
            XCTAssertEqual(decoded.canCompleteOn, try XCTUnwrap(want["canCompleteOn"] as? Bool, name), name)
        }
    }

    // MARK: ios-widget-complete

    private func clearWidget() {
        Store.remove(WidgetPublication.fileName)
        WidgetPublication.clearCompletions()
    }

    /// Publishes the shared fixture `widget` (three rows: `late` overdue, `call`, `plain`; `complete`, `complete-on`).
    private func publishFixture(_ name: String = "widget") throws {
        addTeardownBlock { self.clearWidget() }
        clearWidget()
        XCTAssertTrue(WidgetPublication.publish(try XCTUnwrap(try bridgeFixture(name)["payload"] as? String)))
    }

    /// Every address of the shared fixture actions.json `completePaths`, byte for byte as the Android app builds it.
    func testTheCompletionAddressIsTheFixtures() throws {
        let cases = try XCTUnwrap(try bridgeFixture("actions")["completePaths"] as? [[String: Any]])
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let ids = try XCTUnwrap(c["taskIds"] as? [String])
            XCTAssertEqual(WidgetPublication.completePath(ids), c["path"] as? String, ids.joined(separator: ","))
        }
    }

    func testATickHidesTheRowLowersTheCountsAndQueuesTheOccurrence() throws {
        try publishFixture()
        let now = Date(timeIntervalSince1970: 1_792_670_400)
        XCTAssertTrue(WidgetPublication.complete(taskID: "late", now: now))
        let publication = try XCTUnwrap(WidgetPublication.load())
        let hidden = WidgetPublication.hidden(now: now)
        XCTAssertEqual(hidden, ["late"])
        XCTAssertEqual(publication.visibleTasks(hidden: hidden).map(\.id), ["call", "plain"])
        XCTAssertEqual(publication.visibleCount(hidden: hidden), 2)
        XCTAssertEqual(publication.visibleOverdue(hidden: hidden), 0)
        // `complete-on`: the tick names the occurrence due that day, once however often it is tapped.
        XCTAssertTrue(WidgetPublication.complete(taskID: "late", now: now))
        XCTAssertTrue(WidgetPublication.complete(taskID: "call", now: now))
        XCTAssertEqual(WidgetPublication.loadQueue(), ["late@2026-10-20", "call@2026-10-22"])
        XCTAssertEqual(WidgetPublication.takeCompletePath(now: now), "/?complete=late%402026-10-20&complete=call%402026-10-22")
        XCTAssertNil(WidgetPublication.takeCompletePath(now: now), "each tick is sent once")
    }

    func testATickWithoutCompleteOnNamesTheTask() throws {
        addTeardownBlock { self.clearWidget() }
        clearWidget()
        XCTAssertTrue(WidgetPublication.publish(#"{"updatedAt":1,"locked":false,"count":1,"overdue":0,"tasks":[{"id":"a b","due":"2026-10-22","priority":4,"overdue":false}],"actions":["complete"]}"#))
        XCTAssertTrue(WidgetPublication.complete(taskID: "a b"))
        XCTAssertEqual(WidgetPublication.takeCompletePath(), "/?complete=a+b")
    }

    /// Locked, an older web app without `actions`, or a task the publication does not list: nothing is hidden or queued.
    func testATickIsRefusedWhenTheWidgetCannotComplete() throws {
        try publishFixture("widget-locked")
        XCTAssertFalse(WidgetPublication.complete(taskID: "late"))
        XCTAssertTrue(WidgetPublication.publish(#"{"updatedAt":1,"locked":false,"count":1,"overdue":0,"tasks":[{"id":"a","priority":4,"overdue":false}]}"#))
        XCTAssertFalse(try XCTUnwrap(WidgetPublication.load()).canComplete)
        XCTAssertFalse(WidgetPublication.complete(taskID: "a"))
        try publishFixture()
        XCTAssertFalse(WidgetPublication.complete(taskID: "unknown"))
        XCTAssertTrue(WidgetPublication.hidden().isEmpty)
        XCTAssertNil(WidgetPublication.takeCompletePath())
    }

    /// A publication that no longer lists the task confirms the tick; one that still lists it keeps the row hidden.
    func testAPublicationConfirmsATick() throws {
        try publishFixture()
        XCTAssertTrue(WidgetPublication.complete(taskID: "call"))
        XCTAssertNotNil(WidgetPublication.takeCompletePath())
        // The app republished before the run applied the tick: still listed, still hidden.
        XCTAssertTrue(WidgetPublication.publish(try XCTUnwrap(try bridgeFixture("widget")["payload"] as? String)))
        XCTAssertEqual(WidgetPublication.hidden(), ["call"])
        XCTAssertTrue(WidgetPublication.publish(#"{"updatedAt":2,"locked":false,"count":2,"overdue":1,"tasks":[{"id":"late","priority":2,"overdue":true},{"id":"plain","priority":4,"overdue":false}],"actions":["complete","complete-on"]}"#))
        XCTAssertTrue(WidgetPublication.hidden().isEmpty)
        XCTAssertTrue(WidgetPublication.loadPending().isEmpty)
    }

    /// ios-widget-complete D3: a row stays hidden while its tick waits for the app, and for 30
    /// minutes after the run that took it; then it comes back, and the timeline knows when.
    func testAHiddenRowWaitsForTheAppThenThirtyMinutes() {
        typealias Pending = WidgetPublication.Pending
        let ticked = 1_000_000.0
        let later = ticked + 2 * 60 * 60 * 1000
        let pending = ["a": ticked]
        XCTAssertEqual(Pending.hidden(pending, queued: ["a@2026-10-22"], now: later), ["a"], "queued: hidden however long the app waits")
        XCTAssertNil(Pending.nextReturn(pending, queued: ["a@2026-10-22"], now: later))
        XCTAssertEqual(Pending.hidden(pending, queued: [], now: ticked + Pending.hideFor - 1), ["a"])
        XCTAssertEqual(Pending.hidden(pending, queued: [], now: ticked + Pending.hideFor), [])
        XCTAssertEqual(Pending.nextReturn(pending, queued: [], now: ticked), ticked + Pending.hideFor)
        XCTAssertEqual(WidgetPublication.taskID("a@2026-10-22"), "a")
        XCTAssertEqual(WidgetPublication.taskID("a@b"), "a@b")
        XCTAssertEqual(WidgetPublication.taskID("x@y@2026-10-22"), "x@y")
    }

    func testTakingTheQueueStartsTheThirtyMinutes() throws {
        try publishFixture()
        let ticked = Date(timeIntervalSince1970: 1_792_670_400)
        XCTAssertTrue(WidgetPublication.complete(taskID: "plain", now: ticked))
        let taken = ticked.addingTimeInterval(2 * 60 * 60)
        XCTAssertEqual(WidgetPublication.takeCompletePath(now: taken), "/?complete=plain%402026-10-22")
        XCTAssertEqual(WidgetPublication.hidden(now: taken.addingTimeInterval(29 * 60)), ["plain"])
        XCTAssertEqual(WidgetPublication.hidden(now: taken.addingTimeInterval(30 * 60)), [])
        XCTAssertEqual(WidgetPublication.nextReturn(after: taken), taken.addingTimeInterval(30 * 60))
    }

    /// A hidden run opens the queue's address on the configured server.
    func testTheHiddenRunOpensTheCompletionAddress() throws {
        let origin = try XCTUnwrap(URL(string: "https://todo.example.com"))
        XCTAssertEqual(HiddenRun.address(origin: origin, path: "/?complete=t%2F1+%C3%BC").absoluteString, "https://todo.example.com/?complete=t%2F1+%C3%BC")
        XCTAssertEqual(HiddenRun.address(origin: origin, path: nil), origin)
    }

    /// Changing the server (AppModel.forgetServer) deletes the old server's ticks.
    func testTheOldServersTicksAreDeleted() throws {
        try publishFixture()
        XCTAssertTrue(WidgetPublication.complete(taskID: "call"))
        WidgetPublication.clearCompletions()
        XCTAssertTrue(WidgetPublication.hidden().isEmpty)
        XCTAssertNil(WidgetPublication.takeCompletePath())
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

    /// WebKit reports the scheme's own default port as 0 in a frame's security origin
    /// (`WKSecurityOrigin.port`; WebKit keeps no port for it). A server on the standard
    /// port is the configured origin, so its pages are answered (GitHub issues 1534, 1563,
    /// 1569, 1574: links, the widget and reminders on every server at https://host).
    func testTheDefaultPortAsWebKitReportsItIsTheConfiguredOrigin() throws {
        let server = try XCTUnwrap(URL(string: "https://todo.example.com"))
        XCTAssertTrue(Bridge.accepts(scheme: "https", host: "todo.example.com", port: 0, mainFrame: true, configured: server))
        let explicit = try XCTUnwrap(URL(string: "https://todo.example.com:443/today"))
        XCTAssertTrue(Bridge.accepts(scheme: "https", host: "todo.example.com", port: 0, mainFrame: true, configured: explicit))
        let local = try XCTUnwrap(URL(string: "http://nas.local"))
        XCTAssertTrue(Bridge.accepts(scheme: "http", host: "nas.local", port: 0, mainFrame: true, configured: local))
        // 0 is the default port of the frame's own scheme, never another port.
        let custom = try XCTUnwrap(URL(string: "https://todo.example.com:8443"))
        XCTAssertFalse(Bridge.accepts(scheme: "https", host: "todo.example.com", port: 0, mainFrame: true, configured: custom))
        let onEighty = try XCTUnwrap(URL(string: "https://todo.example.com:80"))
        XCTAssertFalse(Bridge.accepts(scheme: "https", host: "todo.example.com", port: 0, mainFrame: true, configured: onEighty))
        XCTAssertFalse(Bridge.accepts(scheme: "http", host: "todo.example.com", port: 0, mainFrame: true, configured: server))
        XCTAssertFalse(Bridge.accepts(scheme: "https", host: "todo.example.com", port: 0, mainFrame: false, configured: server))
    }

    func testCapabilitiesFollowTheDevice() {
        XCTAssertEqual(Bridge.capabilities(biometric: false, share: true),
                       ["reminders", "widgets", "share", "links", "obsidian-links", "app-links", "system-bars", "pull-refresh", "first-paint", "completion-sound", "scroll-top", "focus", "haptics"])
        XCTAssertTrue(Bridge.capabilities(biometric: true, share: true).contains("biometric"))
    }

    /// shell-repairs D5, D3: haptics only with a screen and an engine; never `files`, since
    /// WebKit downloads what the web app saves.
    func testHapticsNeedAScreenAndFilesAreNeverListed() {
        XCTAssertTrue(Bridge.capabilities(biometric: false, share: true, haptics: true).contains("haptics"))
        XCTAssertFalse(Bridge.capabilities(biometric: false, share: true, haptics: false).contains("haptics"))
        XCTAssertEqual(Bridge.capabilities(biometric: false, share: false), ["reminders", "widgets", "background"])
        XCTAssertFalse(Bridge.capabilities(biometric: true, share: false, haptics: true).contains("haptics"))
        for share in [true, false] {
            XCTAssertFalse(Bridge.capabilities(biometric: true, share: share).contains("files"))
        }
    }

    /// shell-reminders-on D3, D4: the capability lists of the visible app and of a
    /// background run, against the shared bridge fixture (Android's superset, written by
    /// the web app's tests). `background` is only ever listed without a screen, `links`
    /// only with one, and iOS never lists `alarm-settings`.
    func testCapabilityListsFollowTheBridgeFixture() throws {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/bridge/capabilities.json")
        let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        let visibleOnly = Set(try XCTUnwrap(fixture["visibleOnly"] as? [String]))
        let backgroundOnly = Set(try XCTUnwrap(fixture["backgroundOnly"] as? [String]))
        // Without `push` (shell-push): reminders through UnifiedPush are the Android app's only.
        let both = Set(try XCTUnwrap(fixture["both"] as? [String])).subtracting(["push"])
        let methods = try XCTUnwrap(fixture["methods"] as? [String: String])
        XCTAssertEqual(methods["backgroundDone"], "background")
        XCTAssertEqual(methods["playCompletionSound"], "completion-sound")
        XCTAssertTrue(backgroundOnly.contains("background"))
        XCTAssertTrue(visibleOnly.contains("links"))

        let background = Set(Bridge.backgroundCapabilities)
        XCTAssertEqual(Bridge.backgroundCapabilities, Bridge.capabilities(biometric: false, share: false))
        XCTAssertTrue(background.isSuperset(of: backgroundOnly), "\(background)")
        XCTAssertTrue(background.isSuperset(of: both), "\(background)")
        XCTAssertTrue(background.isDisjoint(with: visibleOnly), "\(background)")
        XCTAssertFalse(background.contains("biometric"))

        for biometric in [true, false] {
            for haptics in [true, false] {
                let visible = Set(Bridge.capabilities(biometric: biometric, share: true, haptics: haptics))
                XCTAssertTrue(visible.isSuperset(of: both), "\(visible)")
                XCTAssertTrue(visible.isDisjoint(with: backgroundOnly), "\(visible)")
                XCTAssertTrue(visible.isSubset(of: visibleOnly.union(both).union(["biometric", "pull-refresh", FirstPaint.capability, ScrollTop.capability])), "\(visible)")
                XCTAssertTrue(visible.contains(ScrollTop.capability))
                XCTAssertTrue(visible.contains("links"))
                XCTAssertFalse(visible.contains("alarm-settings"))
            }
        }

        let origin = try XCTUnwrap(URL(string: "https://todo.example.com"))
        let script = Bridge.script(origin: origin, app: "1.2.3", capabilities: Bridge.backgroundCapabilities)
        XCTAssertTrue(script.contains("backgroundDone: function () { call('backgroundDone', []) }"))
        XCTAssertFalse(script.contains("openAlarmSettings"))
    }

    /// shell-reminders-on D4: `backgroundDone` ends a background run and is ignored by the
    /// visible app.
    func testBackgroundDoneReachesOnlyTheBackgroundRun() {
        final class Count { var ended = 0 }
        let count = Count()
        BridgeHost(interactive: false, backgroundDone: { count.ended += 1 }).bridgedBackgroundDone()
        XCTAssertEqual(count.ended, 1)
        BridgeHost(interactive: true, backgroundDone: { count.ended += 1 }).bridgedBackgroundDone()
        XCTAssertEqual(count.ended, 1)
        BridgeHost(interactive: true).bridgedBackgroundDone()
        BridgeHost(interactive: false).bridgedBackgroundDone()
        XCTAssertEqual(count.ended, 1)
    }

    /// A run without a screen sends no test notification, which would ask for the permission.
    func testTheBackgroundRunSendsNoTestNotification() async {
        let sent = await BridgeHost(interactive: false).bridgedTestNotification()
        XCTAssertFalse(sent)
    }

    func testThePageScriptOffersHaptic() throws {
        let origin = try XCTUnwrap(URL(string: "https://todo.example.com"))
        let script = Bridge.script(origin: origin, app: "1.2.3", capabilities: ["haptics"])
        XCTAssertTrue(script.contains("haptic: function (kind) { call('haptic', [String(kind)]) }"))
        XCTAssertFalse(script.contains("saveFile"))
    }

    func testCompletionSoundMatchesWebSamples() throws {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/bridge/completion-sound.json")
        let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        let rate = try XCTUnwrap(fixture["sampleRate"] as? Int)
        let frames = try XCTUnwrap(fixture["frames"] as? Int)
        let wave = BridgeHost.completionWave()
        guard wave.count == 44 + frames * 2 else { return XCTFail("Incorrect WAV length") }
        XCTAssertEqual(Int(wave[24]) | (Int(wave[25]) << 8) | (Int(wave[26]) << 16) | (Int(wave[27]) << 24), rate)
        for pair in try XCTUnwrap(fixture["samples"] as? [[Int]]) {
            let offset = 44 + pair[0] * 2
            let sample = Int16(bitPattern: UInt16(wave[offset]) | (UInt16(wave[offset + 1]) << 8))
            XCTAssertLessThanOrEqual(abs(Int(sample) - pair[1]), 1, "frame \(pair[0])")
        }
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
        for kind in kinds { XCTAssertEqual(Haptics.kind(kind).rawValue, kind) }
        let unknown = try XCTUnwrap(fixture["unknown"] as? String)
        XCTAssertEqual(Haptics.kind(unknown), .tick, unknown)
    }

    /// status-bar-scroll-top D1, D2: the capability and the script follow the shared bridge
    /// fixture, only the visible app lists it, and the decoy tells the page once per tap and
    /// never scrolls.
    func testScrollTopFollowsTheBridgeFixture() throws {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/bridge/scroll-top.json")
        let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        XCTAssertEqual(fixture["capability"] as? String, ScrollTop.capability)
        XCTAssertEqual(fixture["script"] as? String, ScrollTop.script)
        XCTAssertFalse(Bridge.backgroundCapabilities.contains(ScrollTop.capability))

        let decoy = ScrollTopDecoy()
        var taps = 0
        decoy.onTap = { taps += 1 }
        XCTAssertTrue(decoy.scrollsToTop)
        XCTAssertFalse(decoy.isUserInteractionEnabled)
        XCTAssertGreaterThan(decoy.contentSize.height, decoy.bounds.height)
        let offset = decoy.contentOffset
        XCTAssertFalse(decoy.scrollViewShouldScrollToTop(decoy))
        XCTAssertEqual(taps, 1)
        XCTAssertEqual(decoy.contentOffset, offset)
    }

    /// pull-to-sync D4: the capability and the call follow the shared bridge fixture; only
    /// the visible app, which has the refresh control, lists the capability.
    func testPullRefreshFollowsTheBridgeFixture() throws {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/bridge/pull.json")
        let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        XCTAssertEqual(fixture["capability"] as? String, PullRefresh.capability)
        XCTAssertEqual(fixture["method"] as? String, PullRefresh.method)
        // One call per page load, without arguments.
        let calls = try XCTUnwrap(fixture["calls"] as? [[Any]])
        XCTAssertEqual(calls.count, 1)
        XCTAssertTrue(calls[0].isEmpty)
        XCTAssertTrue(Bridge.capabilities(biometric: false, share: true).contains(PullRefresh.capability))
        XCTAssertFalse(Bridge.capabilities(biometric: true, share: false).contains(PullRefresh.capability))
        let origin = try XCTUnwrap(URL(string: "https://todo.example.com"))
        let script = Bridge.script(origin: origin, app: "1.2.3", capabilities: [PullRefresh.capability])
        XCTAssertTrue(script.contains("pullHandled: function () { call('pullHandled') }"))
    }

    /// shell-reveal-on-paint D1, D2: the capability and the call follow the shared bridge
    /// fixture; only the visible app, which hides its web view, lists the capability.
    func testFirstPaintFollowsTheBridgeFixture() throws {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/bridge/painted.json")
        let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        XCTAssertEqual(fixture["capability"] as? String, FirstPaint.capability)
        XCTAssertEqual(fixture["method"] as? String, FirstPaint.method)
        // One call per page load, without arguments.
        let calls = try XCTUnwrap(fixture["calls"] as? [[Any]])
        XCTAssertEqual(calls.count, 1)
        XCTAssertTrue(calls[0].isEmpty)
        XCTAssertTrue(Bridge.capabilities(biometric: false, share: true).contains(FirstPaint.capability))
        XCTAssertFalse(Bridge.capabilities(biometric: true, share: false).contains(FirstPaint.capability))
        let origin = try XCTUnwrap(URL(string: "https://todo.example.com"))
        let script = Bridge.script(origin: origin, app: "1.2.3", capabilities: [FirstPaint.capability])
        XCTAssertTrue(script.contains("painted: function () { call('painted') }"))
    }

    /// shell-reveal-on-paint D2: the visible app's call shows the web view before the page
    /// has loaded; a background run's call shows nothing.
    func testThePagesFirstFrameShowsTheWebView() throws {
        let shell = ShellController(origin: try XCTUnwrap(URL(string: "https://todo.example")))
        BridgeHost(interactive: false).bridgedPainted()
        XCTAssertFalse(shell.revealed)
        XCTAssertEqual(shell.webView.alpha, 0)
        BridgeHost(interactive: true).bridgedPainted()
        XCTAssertTrue(shell.revealed)
        XCTAssertFalse(shell.loaded)
    }

    /// pull-to-sync D4: the shell's refresh control is on until the page showing takes the
    /// pull over, and on again for the next page (an older web app never takes it).
    func testThePageTakesThePullOverUntilAnotherPageLoads() {
        var pull = PullRefresh()
        XCTAssertTrue(pull.native)
        pull.handledByPage()
        XCTAssertFalse(pull.native)
        pull.handledByPage()
        XCTAssertFalse(pull.native)
        pull.pageLoaded()
        XCTAssertTrue(pull.native)
        pull.pageLoaded()
        XCTAssertTrue(pull.native)
    }

    func testHapticKinds() {
        XCTAssertEqual(Haptics.kind("tick"), .tick)
        XCTAssertEqual(Haptics.kind("success"), .success)
        XCTAssertEqual(Haptics.kind("warning"), .warning)
        XCTAssertEqual(Haptics.kind("error"), .error)
        XCTAssertEqual(Haptics.kind("selection"), .selection)
        for other in ["", "thud", "Tick", "tick "] { XCTAssertEqual(Haptics.kind(other), .tick, other) }
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

    /// app-links D6: the link the web app hands openAppLink opens with its list, and the
    /// shared vectors (the bridge fixture app-links.json) hold for the shell's rules.
    func testAppLinksFollowTheBridgeFixture() throws {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/bridge/app-links.json")
        let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        let handed = try XCTUnwrap(fixture["handed"] as? [[String: String]])
        XCTAssertEqual(handed.count, 1)
        for call in handed { XCTAssertTrue(AppLink.allows(AppLink.list(call["schemes"] ?? ""), call["url"] ?? "")) }
        let vectors = try XCTUnwrap(fixture["vectors"] as? [String: Any])
        for c in try XCTUnwrap(vectors["links"] as? [[String: Any]]) {
            let url = try XCTUnwrap(c["url"] as? String)
            XCTAssertEqual(AppLink.scheme(url), c["scheme"] as? String, url)
        }
        for c in try XCTUnwrap(vectors["entries"] as? [[String: Any]]) {
            let entry = try XCTUnwrap(c["entry"] as? String)
            XCTAssertEqual(AppLink.validEntry(entry), c["ok"] as? Bool, entry)
        }
        for c in try XCTUnwrap(vectors["allows"] as? [[String: Any]]) {
            let list = try XCTUnwrap(c["list"] as? [String]), url = try XCTUnwrap(c["url"] as? String)
            XCTAssertEqual(AppLink.allows(list, url), c["ok"] as? Bool, "\(list) \(url)")
        }
        XCTAssertTrue(Bridge.capabilities(biometric: false, share: true).contains(AppLink.capability))
        XCTAssertFalse(Bridge.backgroundCapabilities.contains(AppLink.capability))
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

    /// shell-reminders-on D4: a loaded page is waited for until `patience` from the start
    /// of the run, at least `settle`, and the wait ends inside the budget for a page that
    /// loaded in time.
    func testALoadedPageIsWaitedForUntilPatience() {
        XCTAssertEqual(BackgroundRefresh.wait(loadedAfter: 0), 25)
        XCTAssertEqual(BackgroundRefresh.wait(loadedAfter: 2), 23)
        XCTAssertEqual(BackgroundRefresh.wait(loadedAfter: 20), 5)
        XCTAssertEqual(BackgroundRefresh.wait(loadedAfter: 24), 5)
        XCTAssertEqual(BackgroundRefresh.wait(loadedAfter: 40), 5)
        XCTAssertEqual(BackgroundRefresh.wait(loadedAfter: -1), 25)
        XCTAssertLessThan(BackgroundRefresh.patience, BackgroundRefresh.budget)
        XCTAssertLessThanOrEqual(2 + BackgroundRefresh.wait(loadedAfter: 2), BackgroundRefresh.budget)
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

    /// ios-app-banner D5: the banner's address opens the task only on the configured server.
    func testABannerLinkOpensTheTaskOnTheServerOnly() {
        let server = URL(string: "https://todo.example.com")
        let id = { (link: String) in AppModel.taskID(webLink: URL(string: link)!, server: server) }
        XCTAssertEqual(id("https://todo.example.com/task/abc"), "abc")
        XCTAssertEqual(id("https://TODO.example.com:443/task/abc"), "abc")
        XCTAssertEqual(id("https://todo.example.com/task/a%20b"), "a b")
        XCTAssertNil(id("https://evil.example.com/task/abc"), "another host")
        XCTAssertNil(id("https://todo.example.com.evil.example/task/abc"))
        XCTAssertNil(id("https://todo.example.com:8443/task/abc"), "another port")
        XCTAssertNil(id("https://todo.example.com/task/"))
        XCTAssertNil(id("https://todo.example.com/task/a/b"))
        XCTAssertNil(id("https://todo.example.com/task/abc/"))
        XCTAssertNil(id("https://todo.example.com/today"))
        XCTAssertNil(AppModel.taskID(webLink: URL(string: "https://todo.example.com/task/abc")!, server: nil), "no server yet")
        XCTAssertEqual(AppModel.taskID(webLink: URL(string: "http://192.168.1.5:8080/task/abc")!, server: URL(string: "http://192.168.1.5:8080")), "abc")
    }

    /// ios-app-banner D5: the scheme is the configured server's; the app's own links keep their own route.
    func testABannerLinkOnAnotherSchemeIsIgnored() {
        let server = URL(string: "https://todo.example.com")
        XCTAssertNil(AppModel.taskID(webLink: URL(string: "http://todo.example.com/task/abc")!, server: server))
        XCTAssertNil(AppModel.taskID(webLink: URL(string: "ftp://todo.example.com/task/abc")!, server: server))
        XCTAssertNil(AppModel.taskID(webLink: URL(string: "opentodo://task/abc")!, server: server))
        XCTAssertNil(AppModel.taskID(webLink: URL(string: "https://todo.example.com/task/abc")!, server: URL(string: "http://todo.example.com")))
    }

    /// shell-repairs D6: Done, Snooze and Dismiss build the addresses of the shared bridge
    /// fixture (the Android app's too), which the web app reads.
    private func actionsFixture() throws -> [String: Any] {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/bridge/actions.json")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
    }

    /// A query as the web app reads it (URLSearchParams): names and values, a `+` a space.
    private func query(_ path: String) -> [[String]] {
        guard path.hasPrefix("/?") else { return [] }
        return path.dropFirst(2).split(separator: "&", omittingEmptySubsequences: false).map { pair in
            pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false).map {
                $0.replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? "\u{FFFD}"
            }
        }
    }

    func testReminderActionsBuildTheFixturesAddresses() throws {
        let cases = try XCTUnwrap(try actionsFixture()["reminderActions"] as? [[String: String]])
        XCTAssertEqual(Set(cases.filter { $0["id"] == "abc" }.compactMap { $0["action"] }), Set(Notifications.actions))
        let model = AppModel()
        for c in cases {
            let id = try XCTUnwrap(c["id"])
            let path = try XCTUnwrap(c["path"])
            model.show(reminder: id, action: c["action"])
            let built = try XCTUnwrap(model.pendingPath)
            // Android writes a space as "+", this shell as "%20": the same query for the web app,
            // and the same address for every id without a space.
            XCTAssertEqual(query(built), query(path), id)
            if !id.contains(" ") { XCTAssertEqual(built, path, id) }
        }
    }

    /// A tap on a reminder and the quick-add widget open the fixture's addresses too.
    func testTaskAndQuickAddAddressesFollowTheFixture() throws {
        let fixture = try actionsFixture()
        let tasks = try XCTUnwrap(fixture["taskPaths"] as? [[String: String]])
        XCTAssertFalse(tasks.isEmpty)
        let model = AppModel()
        for t in tasks {
            model.show(task: try XCTUnwrap(t["taskId"]))
            XCTAssertEqual(model.pendingPath, t["path"])
        }
        let quickAdd = try XCTUnwrap(fixture["quickAdd"] as? [String: String])
        model.show(add: "")
        XCTAssertEqual(model.pendingPath, quickAdd["path"])
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

    /// The tests below connect a model; the saved server of the test host is put back after.
    private func keepServerOrigin() {
        let saved = Prefs.shared.serverOrigin
        addTeardownBlock { Prefs.shared.serverOrigin = saved }
    }

    /// native-shells "Quick actions on the app icon": the types of project.yml.
    @MainActor
    func testTheIconQuickActionsOpenTheirScreens() {
        let model = AppModel()
        XCTAssertTrue(model.perform(shortcut: "add-task"))
        XCTAssertEqual(model.pendingPath, "/?add=")
        XCTAssertTrue(model.perform(shortcut: "today"))
        XCTAssertEqual(model.pendingPath, "/today")
        XCTAssertFalse(model.changeServerRequested)
        XCTAssertFalse(model.perform(shortcut: "unknown"))
    }

    @MainActor
    func testTheChangeServerShortcutAsksFirst() {
        keepServerOrigin()
        let model = AppModel()
        model.connect("https://todo.example.com")
        XCTAssertTrue(model.perform(shortcut: "change-server"))
        XCTAssertTrue(model.changeServerRequested)
        XCTAssertEqual(model.origin?.absoluteString, "https://todo.example.com", "the server is kept until the user confirms")
        XCTAssertNil(model.pendingPath)
    }

    /// At a cold start the dialog waits for the window's final root (StatusBar).
    @MainActor
    func testChangeServerAtLaunchAsksOnceTheWindowIsReady() {
        keepServerOrigin()
        let model = AppModel()
        model.connect("https://todo.example.com")
        XCTAssertTrue(model.perform(shortcut: "change-server", atLaunch: true))
        XCTAssertFalse(model.changeServerRequested)
        model.windowReady()
        XCTAssertTrue(model.changeServerRequested)
        model.changeServerRequested = false
        model.windowReady()
        XCTAssertFalse(model.changeServerRequested, "asked once")
    }

    /// Without a server the first-run screen is up: nothing to change, nothing to ask.
    @MainActor
    func testChangeServerWithoutAServerDoesNothing() {
        keepServerOrigin()
        Prefs.shared.serverOrigin = nil
        let model = AppModel()
        XCTAssertNil(model.origin)
        XCTAssertFalse(model.perform(shortcut: "change-server"))
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

    func testImagesAndPDFsAreShownFirst() {
        XCTAssertTrue(Downloads.previews(mimeType: "image/jpeg", fileName: "IMG_1234.jpg"))
        XCTAssertTrue(Downloads.previews(mimeType: "image/png", fileName: "download"))
        XCTAssertTrue(Downloads.previews(mimeType: "image/heic", fileName: "photo.heic"))
        XCTAssertTrue(Downloads.previews(mimeType: "application/pdf", fileName: "invoice.pdf"))
        // A decrypted attachment from the page without a type: the name decides.
        XCTAssertTrue(Downloads.previews(mimeType: nil, fileName: "receipt.png"))
        // Saved as before: the server's own choice of a plain download, other files, and SVG.
        XCTAssertFalse(Downloads.previews(mimeType: "application/octet-stream", fileName: "photo.jpg"))
        XCTAssertFalse(Downloads.previews(mimeType: "text/plain", fileName: "opentodo-recovery-key.txt"))
        XCTAssertFalse(Downloads.previews(mimeType: "application/json", fileName: "opentodo-export.json"))
        XCTAssertFalse(Downloads.previews(mimeType: "image/svg+xml", fileName: "logo.svg"))
        XCTAssertFalse(Downloads.previews(mimeType: nil, fileName: "logo.svg"))
        XCTAssertFalse(Downloads.previews(mimeType: nil, fileName: "archive"))
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

    /// The name rules both apps read (Android's FileSaveTest too).
    private func nameCases() throws -> [String: Any] {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/file-name/cases.json")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
    }

    func testTheNameFollowsTheSharedCases() throws {
        let cases = try nameCases()
        XCTAssertEqual(try XCTUnwrap(cases["max"] as? Int), Downloads.maxNameLength)
        XCTAssertEqual(try XCTUnwrap(cases["maxBytes"] as? Int), Downloads.maxNameBytes)
        XCTAssertEqual(Downloads.fileName(""), try XCTUnwrap(cases["fallback"] as? String))
        let names = try XCTUnwrap(cases["names"] as? [[String: Any]])
        XCTAssertFalse(names.isEmpty)
        for c in names {
            let raw = try XCTUnwrap(c["raw"] as? String)
            XCTAssertEqual(Downloads.fileName(raw), try XCTUnwrap(c["name"] as? String), raw.debugDescription)
        }
    }

    func testALongNameIsCutLikeOnAndroid() throws {
        let long = try XCTUnwrap(try nameCases()["long"] as? [[String: Any]])
        XCTAssertFalse(long.isEmpty)
        for c in long {
            let fill = try XCTUnwrap(c["fill"] as? String)
            let raw = try XCTUnwrap(c["prefix"] as? String) + String(repeating: fill, count: try XCTUnwrap(c["times"] as? Int)) + (try XCTUnwrap(c["suffix"] as? String))
            let name = Downloads.fileName(raw)
            let units = Array(name.utf16)
            XCTAssertEqual(units.count, try XCTUnwrap(c["length"] as? Int), raw)
            XCTAssertLessThanOrEqual(name.utf8.count, Downloads.maxNameBytes, raw)
            XCTAssertFalse(UTF16.isLeadSurrogate(units[units.count - 1]), raw)
            // What is kept is the start of the last segment.
            let segment = String(raw.split(separator: "/", omittingEmptySubsequences: false).last ?? "")
            XCTAssertTrue(segment.utf16.starts(with: units), raw)
        }
    }
}

/// focus-live-activity tasks 2.1 to 2.4: the shared bridge fixtures the web app writes,
/// parsed here, with what the Live Activity and the session-end notification make of them.
final class FocusActivityTests: XCTestCase {
    private func fixture(_ name: String) throws -> [String: Any] {
        let file = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("android/app/src/test/resources/bridge/\(name)")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
    }

    private func number(_ o: [String: Any], _ key: String) -> Double? { (o[key] as? NSNumber)?.doubleValue }

    @discardableResult
    private func check(_ name: String) throws -> FocusPublication {
        let f = try fixture(name)
        XCTAssertEqual(f["method"] as? String, "publishFocus", name)
        let want = try XCTUnwrap(f["expect"] as? [String: Any])
        let p = FocusPublication.parse(try XCTUnwrap(f["payload"] as? String))
        XCTAssertEqual(p.state.rawValue, want["state"] as? String, name)
        XCTAssertEqual(p.title, want["title"] as? String, name)
        XCTAssertEqual(p.countsDown, want["countsDown"] as? Bool, name)
        XCTAssertEqual(p.end, number(want, "end"), name)
        XCTAssertEqual(p.countUpFrom, number(want, "countUpFrom"), name)
        XCTAssertEqual(p.frozenMs, number(want, "frozenMs"), name)
        XCTAssertEqual(p.notifyAt, number(want, "notifyAt"), name)
        XCTAssertEqual(p.cycle, (want["cycle"] as? NSNumber)?.intValue, name)
        XCTAssertEqual(p.cycleLength, (want["cycleLength"] as? NSNumber)?.intValue, name)
        return p
    }

    func testARunningPomodoroCountsDownToItsStaleDate() throws {
        let p = try check("focus-running.json")
        let content = FocusAttributes.content(p)
        XCTAssertEqual(content.phase, .work)
        XCTAssertEqual(content.cycle, 2)
        XCTAssertEqual(content.cycleLength, 4)
        XCTAssertEqual(content.end, Date(timeIntervalSince1970: try XCTUnwrap(p.plannedEndAt) / 1000))
        XCTAssertNotNil(content.start)
        XCTAssertLessThanOrEqual(try XCTUnwrap(content.start), try XCTUnwrap(content.end))
        XCTAssertEqual(content.action, .pause)
        XCTAssertFalse(content.paused)
    }

    func testPausedIsFrozenWithoutTitleOrNotification() throws {
        let p = try check("focus-paused.json")
        let content = FocusAttributes.content(p)
        XCTAssertNil(content.title)
        XCTAssertNil(content.end)
        XCTAssertEqual(content.frozenSeconds, 15 * 60)
        XCTAssertEqual(content.action, .resume)
        XCTAssertNil(p.notifyAt)
    }

    func testFlowtimeCountsUp() throws {
        let p = try check("focus-flowtime.json")
        let content = FocusAttributes.content(p)
        XCTAssertNil(content.start)
        XCTAssertEqual(content.countUpFrom, Date(timeIntervalSince1970: try XCTUnwrap(p.countUpFrom) / 1000))
    }

    func testABreakIsShortAndEndsAsBreakOver() throws {
        let p = try check("focus-break.json")
        XCTAssertTrue(p.isBreak)
        XCTAssertEqual(FocusAttributes.content(p).phase, .shortBreak)
    }

    /// A run started while the last one's "Session done" still lingers gets its own activity:
    /// an ended or dismissed one takes no updates.
    func testOnlyALiveActivityIsReused() {
        XCTAssertTrue(FocusLive.reusable(.active))
        XCTAssertTrue(FocusLive.reusable(.stale))
        XCTAssertFalse(FocusLive.reusable(.ended))
        XCTAssertFalse(FocusLive.reusable(.dismissed))
    }

    func testNoneShowsNothing() throws {
        let p = try check("focus-none.json")
        XCTAssertFalse(p.shown)
        XCTAssertNil(p.action)
    }

    func testMalformedOrUnknownVersionsReadAsNone() {
        for bad in ["", "not json", "[]", "{}", #"{"v":2,"state":"running","runningSince":1}"#, #"{"v":1,"state":"later"}"#, #"{"v":1,"state":"running"}"#] {
            XCTAssertEqual(FocusPublication.parse(bad), FocusPublication.none, bad)
        }
        XCTAssertFalse(FocusPublication.parse(#"{"v":1,"state":"done","phase":"work"}"#).shown)
    }

    /// The tap, Pause and Resume open the addresses the web app reads (actions.json).
    func testTheLinksOpenTheWebAppsAddresses() throws {
        let actions = try fixture("actions.json")
        let open = try XCTUnwrap((actions["focusOpen"] as? [String: Any])?["path"] as? String)
        XCTAssertEqual(FocusLink.path(action: nil), open)
        let paths = try XCTUnwrap(actions["focusActions"] as? [[String: Any]]).compactMap { $0["path"] as? String }
        XCTAssertEqual([FocusLink.path(action: "pause"), FocusLink.path(action: "resume")], paths)
        XCTAssertEqual(FocusLink.path(action: "stop"), open)
        XCTAssertEqual(FocusLink.url(.pause).absoluteString, "opentodo://focus?action=pause")
        XCTAssertEqual(Notifications.route(reminder: nil, task: nil, action: UNNotificationDefaultActionIdentifier, focus: true), .focus)
    }

    @MainActor
    func testTheAppOpensTheFocusAddresses() {
        let model = AppModel.shared
        let before = model.pendingPath
        model.handle(url: FocusLink.url(.pause))
        XCTAssertEqual(model.pendingPath, "/focus?action=pause")
        model.handle(url: FocusLink.open)
        XCTAssertEqual(model.pendingPath, "/focus")
        model.pendingPath = before
    }

    @MainActor
    func testThePageScriptHasPublishFocus() throws {
        let origin = try XCTUnwrap(URL(string: "https://todo.example.com"))
        let script = Bridge.script(origin: origin, app: "1.0.0", capabilities: ["focus"])
        XCTAssertTrue(script.contains("publishFocus: function (json) { call('publishFocus', [String(json)]) }"))
        XCTAssertFalse(Bridge.backgroundCapabilities.contains("focus"))
    }
}
