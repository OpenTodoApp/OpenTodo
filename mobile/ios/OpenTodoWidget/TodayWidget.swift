import AppIntents
import SwiftUI
import WidgetKit

/// The Today widget (ios-shell design D8): today's and overdue open tasks from the last
/// publication, the count in the header, the update time in the footer, and counts only
/// when the account is locked. It reads the App Group file and never makes a request.
/// On iOS 17 each row has a completion circle (ios-widget-complete D1).
struct TodayEntry: TimelineEntry {
    let date: Date
    let publication: WidgetPublication.Publication?
    /// The rows ticked on the widget that no publication has confirmed yet.
    var hidden: Set<String> = []
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: Date(), publication: WidgetPublication.Publication(
            updatedAt: Date().timeIntervalSince1970 * 1000, locked: false, count: 3, overdue: 1,
            tasks: [
                .init(id: "1", title: "Call the plumber", time: "09:00", priority: 2, overdue: true),
                .init(id: "2", title: "Send the invoice", time: "11:30", priority: 1, overdue: false),
                .init(id: "3", title: "Water the plants", time: nil, priority: 4, overdue: false),
            ]))
    }

    private func entry(at date: Date) -> TodayEntry {
        TodayEntry(date: date, publication: WidgetPublication.load(), hidden: WidgetPublication.hidden(now: date))
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(entry(at: Date()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        // Reloaded whenever the app publishes or a row is ticked; a second entry shows a
        // hidden row again once its 30 minutes are over (ios-widget-complete D3).
        let now = Date()
        var entries = [entry(at: now)]
        if let back = WidgetPublication.nextReturn(after: now) { entries.append(entry(at: back)) }
        completion(Timeline(entries: entries, policy: .never))
    }
}

/// The completion circle's action (ios-widget-complete D1, D2): hides the row and queues the
/// tick for the web app, which completes the task as its own op the next time the app runs.
/// Runs in the widget's process, writes no task data and makes no request.
struct CompleteTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "Complete task"
    static let isDiscoverable = false

    @Parameter(title: "Task")
    var taskID: String

    init() {}

    init(taskID: String) {
        self.taskID = taskID
    }

    func perform() async throws -> some IntentResult {
        WidgetPublication.complete(taskID: taskID)
        return .result()
    }
}

struct TodayWidgetView: View {
    let entry: TodayEntry

    private var rows: [WidgetPublication.Task] {
        Array((entry.publication?.visibleTasks(hidden: entry.hidden) ?? []).prefix(5))
    }

    private var canComplete: Bool { entry.publication?.canComplete ?? false }

    private var updated: String {
        guard let at = entry.publication?.updatedAt, at > 0 else { return "" }
        let date = Date(timeIntervalSince1970: at / 1000)
        return String(localized: "Updated \(date.formatted(date: .omitted, time: .shortened))")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("Today").font(.headline)
                Spacer()
                Text(header).font(.subheadline).foregroundStyle(.secondary)
            }
            if entry.publication == nil {
                Text("Open OpenTodo to fill this widget.").font(.caption).foregroundStyle(.secondary)
            } else if rows.isEmpty {
                Text(entry.publication?.locked == true && count > 0 ? "Locked. Open OpenTodo to see your tasks." : "Nothing left for today.")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(rows, id: \.id) { task in
                    HStack(spacing: 6) {
                        if canComplete { circle(task) }
                        // No force unwrap: the id is the server's data, and a widget that crashes
                        // shows nothing at all. A row without a usable link is shown, not tappable.
                        if let link = task.link {
                            Link(destination: link) { row(task) }
                        } else {
                            row(task)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
            if !updated.isEmpty { Text(updated).font(.caption2).foregroundStyle(.tertiary) }
        }
        .modifier(WidgetBackground())
    }

    /// Below iOS 17 a widget cannot run an intent, so the row is drawn as before.
    @ViewBuilder
    private func circle(_ task: WidgetPublication.Task) -> some View {
        if #available(iOS 17.0, *) {
            Button(intent: CompleteTaskIntent(taskID: task.id)) {
                Image(systemName: "circle").font(.caption).foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Complete \(task.title ?? String(localized: "Task"))"))
        }
    }

    private func row(_ task: WidgetPublication.Task) -> some View {
        HStack(spacing: 6) {
            Text(task.title ?? "Task").lineLimit(1).font(.caption)
            Spacer(minLength: 4)
            if task.overdue { Image(systemName: "exclamationmark.circle").font(.caption2) }
            if let time = task.time { Text(time).font(.caption2).foregroundStyle(.secondary) }
            if task.flagged { Image(systemName: "flag.fill").font(.caption2) }
        }
    }

    private var count: Int { entry.publication?.visibleCount(hidden: entry.hidden) ?? 0 }

    private var header: String {
        let overdue = entry.publication?.visibleOverdue(hidden: entry.hidden) ?? 0
        return overdue > 0 ? String(localized: "\(count) today · \(overdue) overdue") : String(localized: "\(count) today")
    }
}

/// iOS 17 paints the widget's own background; iOS 16 still shows the system's.
struct WidgetBackground: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.containerBackground(.fill.tertiary, for: .widget)
        } else {
            content.padding()
        }
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetPublication.kind, provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Today's and overdue tasks from your own server.")
        .supportedFamilies([.systemMedium])
    }
}

@main
struct OpenTodoWidgets: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        FocusActivityWidget()
        CompletedWidget()
    }
}
