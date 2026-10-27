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

    static func reload() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
        #endif
    }
}
