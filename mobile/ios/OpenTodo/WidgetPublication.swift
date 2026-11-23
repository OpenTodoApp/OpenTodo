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
    }

    @discardableResult
    static func publish(_ json: String) -> Bool {
        guard let data = json.data(using: .utf8),
              let publication = try? JSONDecoder().decode(Publication.self, from: data) else { return false }
        Store.write(data, fileName)
        reload()
        return publication.count >= 0
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

        private static func isDay(_ s: String) -> Bool {
            s.range(of: #"^\d{4}-\d\d-\d\d$"#, options: .regularExpression) != nil
        }

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
