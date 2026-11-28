import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

/// The Today list the widget draws (ios-shell design D8). The web app publishes it; the
/// shell stores it where the widget extension can read it and relays the timeline reload.
/// The widget itself never requests anything.
enum WidgetPublication {
    static let fileName = "widget.json"
    static let kind = "TodayWidget"
    /// The Completed widget (completed-widget D1), drawn from the same publication.
    static let completedKind = "CompletedWidget"

    struct Task: Decodable, Equatable {
        let id: String
        let title: String?
        let time: String?
        let priority: Int
        let overdue: Bool
        /// The task's due date, the occurrence a tick names (android-upcoming-calendar-widgets D6).
        var due: String? = nil

        /// Priorities run 1 (highest) to 4, which means "no priority"; only 1-3 get a flag.
        var flagged: Bool { (1...3).contains(priority) }

        /// `opentodo://task/<id>`, or nil for an id that cannot be a link. The id comes from
        /// the server's data, so it is percent-encoded rather than trusted to be URL-safe.
        var link: URL? { WidgetPublication.taskLink(id) }
    }

    /// Unreserved characters only, so a slash, a space or a `?` in an id stays inside the
    /// one path segment instead of adding a segment or a query of its own.
    private static let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    static func taskLink(_ id: String) -> URL? {
        guard !id.isEmpty, let encoded = id.addingPercentEncoding(withAllowedCharacters: unreserved) else { return nil }
        var components = URLComponents()
        components.scheme = "opentodo"
        components.host = "task"
        components.percentEncodedPath = "/" + encoded
        return components.url
    }

    struct Publication: Decodable, Equatable {
        let updatedAt: Double
        let locked: Bool
        let count: Int
        let overdue: Int
        let tasks: [Task]
        /// What the web app applies from the widget (android-widget-list D3): `complete`, and
        /// `complete-on` when a tick may name its occurrence. Absent from an older web app.
        var actions: [String]? = nil

        /// The completion circle (ios-widget-complete D1): a web app that applies `?complete=`, and an unlocked account.
        var canComplete: Bool { !locked && (actions ?? []).contains("complete") }
        var canCompleteOn: Bool { canComplete && (actions ?? []).contains("complete-on") }

        /// What a run sends for a tick on `task`: `<id>@<due>` when the web app reads it, so an
        /// occurrence is completed once (Android's WidgetModel.completion).
        func completion(_ task: Task) -> String {
            if canCompleteOn, let due = task.due, WidgetPublication.isDay(due) { return "\(task.id)@\(due)" }
            return task.id
        }

        /// The rows still shown once the `hidden` ticks are left out; none while locked.
        func visibleTasks(hidden: Set<String>) -> [Task] { locked ? [] : tasks.filter { !hidden.contains($0.id) } }

        /// The header's counts: the published ones less the rows hidden as completed.
        func visibleCount(hidden: Set<String>) -> Int { max(0, count - tasks.filter { hidden.contains($0.id) }.count) }
        func visibleOverdue(hidden: Set<String>) -> Int { max(0, overdue - tasks.filter { $0.overdue && hidden.contains($0.id) }.count) }
    }

    @discardableResult
    static func publish(_ json: String) -> Bool {
        guard let data = json.data(using: .utf8),
              let publication = try? JSONDecoder().decode(Publication.self, from: data) else { return false }
        Store.write(data, fileName)
        // android-widget-list D2: a tick the publication confirms (the row is gone) is done.
        savePending(Pending.prune(loadPending(), published: publication, now: Date().timeIntervalSince1970 * 1000))
        reload()
        return publication.count >= 0
    }

    /// `YYYY-MM-DD` in ASCII digits and nothing after, as Kotlin's Regex.matches on Android.
    static func isDay(_ s: String) -> Bool {
        s.range(of: #"\A[0-9]{4}-[0-9]{2}-[0-9]{2}\z"#, options: .regularExpression) != nil
    }

    // MARK: Completing from the Today widget (ios-widget-complete D2, D3)

    static let pendingFileName = "widget-pending.json"
    static let queueFileName = "widget-queue.json"
    /// The web app applies at most 50 ids from one address (shellActions.ts).
    static let maxQueued = 50

    /// The ticks no publication has confirmed yet, `{id: ms}`: Android's WidgetPending for the
    /// Today list. A row is hidden while its tick is queued, and for `hideFor` after the run
    /// that took it, so a completion that never applied shows the task again. Pure for tests.
    enum Pending {
        static let hideFor: Double = 30 * 60 * 1000

        static func parse(_ data: Data?) -> [String: Double] {
            guard let data, let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return [:] }
            return o.compactMapValues { ($0 as? NSNumber)?.doubleValue }.filter { $0.value > 0 }
        }

        /// The ids ticked less than `hideFor` ago, and every id still in the queue.
        static func hidden(_ pending: [String: Double], queued: [String], now: Double) -> Set<String> {
            Set(pending.filter { now - $0.value >= 0 && now - $0.value < hideFor }.keys).union(queued.map(WidgetPublication.taskID))
        }

        /// After a publication: only the ticks it still lists and that are not too old.
        static func prune(_ pending: [String: Double], published: Publication?, now: Double) -> [String: Double] {
            let listed = Set(published?.tasks.map(\.id) ?? [])
            return pending.filter { listed.contains($0.key) && now - $0.value >= 0 && now - $0.value < hideFor }
        }

        /// The earliest moment a hidden row comes back by itself, for the widget's timeline.
        static func nextReturn(_ pending: [String: Double], queued: [String], now: Double) -> Double? {
            let waiting = Set(queued.map(WidgetPublication.taskID))
            return pending.filter { !waiting.contains($0.key) && $0.value + hideFor > now }.map { $0.value + hideFor }.min()
        }
    }

    /// The task of a queued completion: `a@2026-10-23` is the task `a`.
    static func taskID(_ completion: String) -> String {
        if let at = completion.lastIndex(of: "@"), isDay(String(completion[completion.index(after: at)...])) {
            return String(completion[..<at])
        }
        return completion
    }

    static func loadPending() -> [String: Double] { Pending.parse(Store.read(pendingFileName)) }

    static func savePending(_ pending: [String: Double]) {
        if pending.isEmpty { return Store.remove(pendingFileName) }
        if let data = try? JSONSerialization.data(withJSONObject: pending) { Store.write(data, pendingFileName) }
    }

    static func loadQueue() -> [String] {
        guard let data = Store.read(queueFileName), let list = (try? JSONSerialization.jsonObject(with: data)) as? [Any] else { return [] }
        return list.compactMap { $0 as? String }
    }

    private static func saveQueue(_ queue: [String]) {
        if queue.isEmpty { return Store.remove(queueFileName) }
        if let data = try? JSONSerialization.data(withJSONObject: queue) { Store.write(data, queueFileName) }
    }

    /// The rows the widget hides at `now`.
    static func hidden(now: Date = Date()) -> Set<String> {
        Pending.hidden(loadPending(), queued: loadQueue(), now: now.timeIntervalSince1970 * 1000)
    }

    /// When a hidden row comes back by itself, nil when none does.
    static func nextReturn(after now: Date = Date()) -> Date? {
        Pending.nextReturn(loadPending(), queued: loadQueue(), now: now.timeIntervalSince1970 * 1000)
            .map { Date(timeIntervalSince1970: $0 / 1000) }
    }

    /// The circle's tap: hide the row now and queue the completion for the web app, which
    /// applies it as its own op the next time the app runs; never written here. False, with
    /// nothing changed, when the stored publication cannot complete or does not list the task.
    @discardableResult
    static func complete(taskID id: String, now: Date = Date()) -> Bool {
        guard let publication = load(), publication.canComplete,
              let task = publication.tasks.first(where: { $0.id == id }) else { return false }
        var pending = loadPending()
        pending[id] = now.timeIntervalSince1970 * 1000
        savePending(pending)
        var queue = loadQueue()
        let completion = publication.completion(task)
        if !queue.contains(completion) && queue.count < maxQueued { queue.append(completion) }
        saveQueue(queue)
        reload()
        return true
    }

    /// The address one hidden run completes every queued task at (shared fixture
    /// bridge/actions.json `completePaths`), emptying the queue so each is sent once; nil when
    /// nothing is queued. The 30 minutes of the rows it hid start now (ios-widget-complete D3).
    static func takeCompletePath(now: Date = Date()) -> String? {
        let queue = loadQueue()
        guard !queue.isEmpty else { return nil }
        Store.remove(queueFileName)
        var pending = loadPending()
        let at = now.timeIntervalSince1970 * 1000
        // Every tick taken, also one a publication pruned while it waited: still listed then.
        for completion in queue { pending[taskID(completion)] = at }
        savePending(pending)
        return completePath(queue)
    }

    /// Java's URLEncoder, as the Android app writes it: letters, digits and `.-*_` stay, a space is `+`.
    private static let formSafe = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.-*_ ")

    static func completePath(_ completions: [String]) -> String {
        "/?" + completions.map { "complete=" + ($0.addingPercentEncoding(withAllowedCharacters: formSafe) ?? "").replacingOccurrences(of: " ", with: "+") }
            .joined(separator: "&")
    }

    /// The old server's ticks go with its widget data.
    static func clearCompletions() {
        Store.remove(pendingFileName)
        Store.remove(queueFileName)
    }

    static func load() -> Publication? {
        guard let data = Store.read(fileName) else { return nil }
        return try? JSONDecoder().decode(Publication.self, from: data)
    }

    /// What the Completed widget shows (completed-widget D1, D2), built from the last publication
    /// only: today's completions and, while the account is readable, the last 7 days. A locked
    /// account publishes today's count alone, so no days. The rule of Android's CompletedModel,
    /// pinned by the shared fixtures widget-completed.json and widget-completed-locked.json.
    struct Completed: Equatable {
        struct Day: Equatable {
            let day: String
            let done: Int
        }

        let updatedAt: Double
        let locked: Bool
        let today: Int
        let days: [Day]

        static let dayCount = 7

        /// Nil when nothing was published yet, or by a web app that publishes no completions.
        static func parse(_ data: Data?) -> Completed? {
            guard let data, let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                  let c = o["completed"] as? [String: Any] else { return nil }
            let locked = o["locked"] as? Bool ?? false
            var days: [Day] = []
            if !locked, let list = c["days"] as? [Any] {
                for item in list {
                    guard let d = item as? [String: Any], let day = d["day"] as? String, isDay(day) else { continue }
                    days.append(Day(day: day, done: max(0, (d["done"] as? NSNumber)?.intValue ?? 0)))
                }
            }
            return Completed(updatedAt: (o["updatedAt"] as? NSNumber)?.doubleValue ?? 0, locked: locked,
                             today: max(0, (c["today"] as? NSNumber)?.intValue ?? 0), days: Array(days.suffix(dayCount)))
        }

        private static func isDay(_ s: String) -> Bool { WidgetPublication.isDay(s) }

        /// A bar's height out of 100: the day's count over the busiest day's; a day with any completion keeps a sliver.
        static func barLevel(done: Int, max: Int) -> Int {
            guard max > 0, done > 0 else { return 0 }
            return Swift.min(100, Swift.max(6, done * 100 / max))
        }

        /// The day's weekday as one letter in `locale` (S, M… in English; L for lunedì).
        static func weekdayLetter(_ day: String, locale: Locale = .current) -> String {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone(identifier: "UTC")!
            calendar.locale = locale
            let parser = DateFormatter()
            parser.calendar = calendar
            parser.locale = Locale(identifier: "en_US_POSIX")
            parser.timeZone = calendar.timeZone
            parser.dateFormat = "yyyy-MM-dd"
            guard let date = parser.date(from: day) else { return "" }
            return calendar.veryShortStandaloneWeekdaySymbols[calendar.component(.weekday, from: date) - 1]
        }
    }

    static func loadCompleted() -> Completed? { Completed.parse(Store.read(fileName)) }

    static func reload() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
        WidgetCenter.shared.reloadTimelines(ofKind: completedKind)
        #endif
    }
}
