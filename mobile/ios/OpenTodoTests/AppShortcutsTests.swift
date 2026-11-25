import XCTest
@testable import OpenTodo

/// apple-shortcuts D4: where the opening intents lead and what "What's on today" answers.
@MainActor
final class AppShortcutsTests: XCTestCase {
    func testOpenTodayAndQuickAddOpenTheWidgetsAddresses() {
        let model = AppModel()
        ShortcutRoute.today(model)
        XCTAssertEqual(model.pendingPath, "/today")
        ShortcutRoute.quickAdd(model)
        XCTAssertEqual(model.pendingPath, "/?add=")
    }

    func testTheOpeningIntentsOpenTheAppAndTheAnswerDoesNot() {
        XCTAssertTrue(OpenTodayIntent.openAppWhenRun)
        XCTAssertTrue(OpenQuickAddIntent.openAppWhenRun)
        XCTAssertFalse(TodayIntent.openAppWhenRun)
    }
}

final class TodaySummaryTests: XCTestCase {
    private typealias Publication = WidgetPublication.Publication
    private typealias Task = WidgetPublication.Task

    /// 09:12 on 2026-11-25 in this device's time zone, in milliseconds as the web app publishes it.
    private let at: Double = {
        var parts = DateComponents(year: 2026, month: 11, day: 25, hour: 9, minute: 12)
        parts.calendar = Calendar.current
        return parts.date!.timeIntervalSince1970 * 1000
    }()

    /// Later the same day, when Siri is asked.
    private var now: Date { Date(timeIntervalSince1970: at / 1000 + 3 * 3600) }

    private func answer(_ p: Publication?, phoneLocked: Bool = false) -> [String] {
        TodaySummary.lines(p, phoneLocked: phoneLocked, now: now)
    }

    private var updated: String {
        let time = Date(timeIntervalSince1970: at / 1000).formatted(date: .omitted, time: .shortened)
        return String(localized: "Updated \(time)")
    }

    private func task(_ id: String, _ title: String?, time: String? = nil, overdue: Bool = false) -> Task {
        Task(id: id, title: title, time: time, priority: 4, overdue: overdue)
    }

    func testNothingPublishedYet() {
        XCTAssertEqual(answer(nil), ["Open OpenTodo once to see today here."])
    }

    func testCountOverdueTitlesWithTimesAndTheTime() {
        let p = Publication(updatedAt: at, locked: false, count: 3, overdue: 1, tasks: [
            task("a", "Call the dentist", time: "10:00", overdue: true),
            task("b", "Buy stamps"),
            task("c", nil, time: "17:30"),
        ])
        let titles = ListFormatter.localizedString(byJoining: ["Call the dentist at 10:00", "Buy stamps", "Task at 17:30"])
        XCTAssertEqual(answer(p), ["3 today · 1 overdue", titles, updated])
        XCTAssertEqual(TodaySummary.text(p, now: now), ["3 today · 1 overdue", titles, updated].joined(separator: "\n"))
    }

    func testAtMostFiveTitles() {
        let tasks = (1...8).map { task("t\($0)", "T\($0)") }
        let p = Publication(updatedAt: at, locked: false, count: 8, overdue: 0, tasks: tasks)
        let lines = answer(p)
        XCTAssertEqual(lines.first, "8 today")
        XCTAssertEqual(lines[1], ListFormatter.localizedString(byJoining: ["T1", "T2", "T3", "T4", "T5"]))
    }

    /// A publication made while an encrypted account was locked: counts only, never a title.
    func testLockedGivesCountsOnly() {
        let p = Publication(updatedAt: at, locked: true, count: 3, overdue: 1, tasks: [task("a", "Secret")])
        let lines = answer(p)
        XCTAssertEqual(lines, ["3 today · 1 overdue", "Locked. Open OpenTodo to see your tasks.", updated])
        XCTAssertFalse(TodaySummary.text(p, now: now).contains("Secret"))
    }

    func testNothingLeft() {
        let p = Publication(updatedAt: at, locked: false, count: 0, overdue: 0, tasks: [])
        XCTAssertEqual(answer(p), ["Nothing left for today.", updated])
    }

    /// The sign-out publication carries no time: no "Updated" line.
    func testNoTimeWithoutAPublicationTime() {
        let p = Publication(updatedAt: 0, locked: false, count: 0, overdue: 0, tasks: [])
        XCTAssertEqual(answer(p), ["Nothing left for today."])
    }

    /// Siri on a locked phone: counts only, never a title, even from an unlocked publication.
    func testALockedPhoneGivesCountsOnly() {
        let p = Publication(updatedAt: at, locked: false, count: 2, overdue: 0, tasks: [task("a", "Secret", time: "10:00"), task("b", "Other")])
        XCTAssertEqual(answer(p, phoneLocked: true), ["2 today", updated])
        XCTAssertFalse(TodaySummary.text(p, phoneLocked: true, now: now).contains("Secret"))
    }

    /// Before the first unlock after a restart the publication cannot be read: ask to unlock.
    func testNothingReadableOnALockedPhone() {
        XCTAssertEqual(answer(nil, phoneLocked: true), ["Unlock to see today."])
    }

    /// A publication from yesterday says so with its date instead of answering as today's.
    func testAnEarlierDayNamesItsDate() {
        let yesterday = at - 24 * 3600 * 1000
        let p = Publication(updatedAt: yesterday, locked: false, count: 1, overdue: 0, tasks: [task("a", "Buy stamps")])
        let date = Date(timeIntervalSince1970: yesterday / 1000).formatted(date: .abbreviated, time: .shortened)
        XCTAssertEqual(answer(p), [String(localized: "This list is from \(date)."), "1 today", "Buy stamps"])
    }
}
