import ActivityKit
import Foundation

/// The Focus session the web app publishes (focus-live-activity D1, bridge v1
/// `publishFocus`), shared by the app, which starts and updates the Live Activity, and the
/// widget extension, which draws it. Pure, so the rules are tested against the shared bridge
/// fixtures (focus-*.json) without a device.
struct FocusPublication: Equatable {
    enum State: String { case running, paused, done, none }

    let state: State
    let taskId: String?
    let title: String?
    let isBreak: Bool
    let longBreak: Bool
    let cycle: Int?
    let cycleLength: Int?
    /// Milliseconds since 1970, as the web app sends them.
    let runningSince: Double?
    let elapsedMs: Double
    let plannedEndAt: Double?
    let plannedMs: Double?

    static let none = FocusPublication(state: .none, taskId: nil, title: nil, isBreak: false, longBreak: false, cycle: nil, cycleLength: nil,
                                       runningSince: nil, elapsedMs: 0, plannedEndAt: nil, plannedMs: nil)

    /// A publication; anything malformed or of an unknown version reads as none, so nothing stale stays shown.
    static func parse(_ json: String) -> FocusPublication {
        guard json.utf8.count <= 4096, let data = json.data(using: .utf8),
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              (o["v"] as? NSNumber)?.intValue == 1,
              let state = (o["state"] as? String).flatMap(State.init(rawValue:)), state != .none
        else { return .none }
        func number(_ key: String) -> Double? { (o[key] as? NSNumber).map(\.doubleValue).flatMap { $0 >= 0 ? $0 : nil } }
        func count(_ key: String) -> Int? { (o[key] as? NSNumber).map(\.intValue).flatMap { (1...99).contains($0) ? $0 : nil } }
        func text(_ key: String, _ max: Int) -> String? { (o[key] as? String).map { String($0.prefix(max)) }.flatMap { $0.isEmpty ? nil : $0 } }
        let runningSince = number("runningSince")
        // A running session needs to know since when; without it nothing can be drawn.
        if state == .running && runningSince == nil { return .none }
        let isBreak = (o["phase"] as? String) == "break"
        return FocusPublication(
            state: state, taskId: text("taskId", 100), title: text("title", 200),
            isBreak: isBreak, longBreak: isBreak && (o["breakKind"] as? String) == "long",
            cycle: count("cycle"), cycleLength: count("cycleLength"),
            runningSince: state == .running ? runningSince : nil,
            elapsedMs: number("elapsedMs") ?? 0,
            plannedEndAt: state == .running ? number("plannedEndAt") : nil,
            plannedMs: number("plannedMs"))
    }

    /// An activity is shown while a session runs or is paused.
    var shown: Bool { state == .running || state == .paused }

    /// The system counts down to `end` for a running timed phase.
    var countsDown: Bool { state == .running && plannedEndAt != nil }

    /// The planned end of a running timed phase, in milliseconds: the stale date and the session-end notification.
    var end: Double? { state == .running ? plannedEndAt : nil }

    /// A running Flowtime session counts up from here: the time worked before the stretch included.
    var countUpFrom: Double? {
        guard state == .running, plannedEndAt == nil, let since = runningSince else { return nil }
        return since - elapsedMs
    }

    /// While paused the clock is frozen: the time left of a timed phase, the time worked otherwise.
    var frozenMs: Double? {
        guard state == .paused else { return nil }
        return plannedMs.map { max(0, $0 - elapsedMs) } ?? elapsedMs
    }

    var notifyAt: Double? { end }

    /// Pause or Resume (focus-live-activity D4): a link that opens the app on the action.
    var action: FocusLink.Action? {
        switch state {
        case .running: return .pause
        case .paused: return .resume
        default: return nil
        }
    }
}

/// The links the activity and the session-end notification open; the app maps them to the
/// web app's `/focus` and `/focus?action=pause|resume` (bridge fixture actions.json).
enum FocusLink {
    enum Action: String { case pause, resume }

    static let open = URL(string: "opentodo://focus")!

    static func url(_ action: Action) -> URL { URL(string: "opentodo://focus?action=\(action.rawValue)")! }

    /// The web app's address for a link's action; an unknown action only opens Focus.
    static func path(action: String?) -> String {
        guard let action = action.flatMap(Action.init(rawValue:)) else { return "/focus" }
        return "/focus?action=\(action.rawValue)"
    }
}

/// The Live Activity's data. Nothing identifies the account: the title only under the
/// include-titles rule (D5), and no task id.
struct FocusAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        enum Phase: String, Codable { case work, shortBreak, longBreak }

        var title: String?
        var phase: Phase
        var cycle: Int?
        var cycleLength: Int?
        var paused: Bool
        var done: Bool
        /// The start of the running stretch and the planned end: the system counts down between them.
        var start: Date?
        var end: Date?
        /// Flowtime: the system counts up from here.
        var countUpFrom: Date?
        /// While paused: the frozen time, in seconds.
        var frozenSeconds: Double?

        var action: FocusLink.Action? { done ? nil : (paused ? .resume : .pause) }
    }

    /// What the activity shows of a publication.
    static func content(_ p: FocusPublication) -> ContentState {
        let date = { (ms: Double?) in ms.map { Date(timeIntervalSince1970: $0 / 1000) } }
        let end = date(p.end)
        let start = date(p.runningSince).map { s in end.map { min(s, $0) } ?? s }
        return ContentState(
            title: p.title,
            phase: p.isBreak ? (p.longBreak ? .longBreak : .shortBreak) : .work,
            cycle: p.cycle, cycleLength: p.cycleLength,
            paused: p.state == .paused, done: p.state == .done,
            start: p.countsDown ? start : nil, end: end,
            countUpFrom: date(p.countUpFrom),
            frozenSeconds: p.frozenMs.map { $0 / 1000 })
    }
}
