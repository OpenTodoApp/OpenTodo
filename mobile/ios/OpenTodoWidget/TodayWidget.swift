import SwiftUI
import WidgetKit

/// The Today widget (ios-shell design D8): today's and overdue open tasks from the last
/// publication, the count in the header, the update time in the footer, and counts only
/// when the account is locked. It reads the App Group file and never makes a request.
struct TodayEntry: TimelineEntry {
    let date: Date
    let publication: WidgetPublication.Publication?
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: Date(), publication: WidgetPublication.Publication(
            updatedAt: Date().timeIntervalSince1970 * 1000, locked: false, count: 3, overdue: 1,
            tasks: [
                .init(id: "1", title: "Call the plumber", time: "09:00", priority: 2, overdue: true),
                .init(id: "2", title: "Send the invoice", time: "11:30", priority: 1, overdue: false),
                .init(id: "3", title: "Water the plants", time: nil, priority: 0, overdue: false),
            ]))
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(TodayEntry(date: Date(), publication: WidgetPublication.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        // Reloaded whenever the app publishes; no timeline of its own.
        completion(Timeline(entries: [TodayEntry(date: Date(), publication: WidgetPublication.load())], policy: .never))
    }
}

struct TodayWidgetView: View {
    let entry: TodayEntry

    private var rows: [WidgetPublication.Task] {
        guard let publication = entry.publication, !publication.locked else { return [] }
        return Array(publication.tasks.prefix(5))
    }

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
                Text(count == 0 ? "Nothing left for today." : "Locked. Open OpenTodo to see your tasks.")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(rows, id: \.id) { task in
                    Link(destination: URL(string: "opentodo://task/\(task.id)")!) {
                        HStack(spacing: 6) {
                            Text(task.title ?? "Task").lineLimit(1).font(.caption)
                            Spacer(minLength: 4)
                            if task.overdue { Image(systemName: "exclamationmark.circle").font(.caption2) }
                            if let time = task.time { Text(time).font(.caption2).foregroundStyle(.secondary) }
                            if task.priority > 0 { Image(systemName: "flag.fill").font(.caption2) }
                        }
                    }
                }
            }
            Spacer(minLength: 0)
            if !updated.isEmpty { Text(updated).font(.caption2).foregroundStyle(.tertiary) }
        }
        .modifier(WidgetBackground())
    }

    private var count: Int { entry.publication?.count ?? 0 }

    private var header: String {
        let overdue = entry.publication?.overdue ?? 0
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
    var body: some Widget { TodayWidget() }
}
