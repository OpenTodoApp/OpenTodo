import SwiftUI
import WidgetKit

/// The Completed widget (completed-widget D1, D2), as on Android: how many tasks were completed
/// today and a bar per day for the last 7 days, scaled to the busiest day; a locked account
/// shows today's count alone. It reads the same App Group file as the Today widget and never
/// makes a request. A tap opens Statistics.
struct CompletedEntry: TimelineEntry {
    let date: Date
    let completed: WidgetPublication.Completed?
}

struct CompletedProvider: TimelineProvider {
    func placeholder(in context: Context) -> CompletedEntry {
        CompletedEntry(date: Date(), completed: WidgetPublication.Completed(
            updatedAt: Date().timeIntervalSince1970 * 1000, locked: false, today: 3,
            days: ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"]
                .enumerated().map { .init(day: $1, done: [2, 4, 1, 0, 3, 5, 3][$0]) }))
    }

    func getSnapshot(in context: Context, completion: @escaping (CompletedEntry) -> Void) {
        completion(CompletedEntry(date: Date(), completed: WidgetPublication.loadCompleted()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CompletedEntry>) -> Void) {
        // Reloaded whenever the app publishes; no timeline of its own.
        completion(Timeline(entries: [CompletedEntry(date: Date(), completed: WidgetPublication.loadCompleted())], policy: .never))
    }
}

struct CompletedWidgetView: View {
    let entry: CompletedEntry

    private var days: [WidgetPublication.Completed.Day] {
        guard let days = entry.completed?.days, days.count == WidgetPublication.Completed.dayCount else { return [] }
        return days
    }

    private var updated: String {
        guard let at = entry.completed?.updatedAt, at > 0 else { return "" }
        let date = Date(timeIntervalSince1970: at / 1000)
        return String(localized: "Updated \(date.formatted(date: .omitted, time: .shortened))")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Completed").font(.headline)
            if let completed = entry.completed {
                Text("\(completed.today)").font(.title.weight(.semibold))
                if completed.locked {
                    Text("Locked: today’s count only").font(.caption).foregroundStyle(.secondary)
                } else if !days.isEmpty {
                    bars
                }
            } else {
                Text("Open OpenTodo to fill this widget.").font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            if !updated.isEmpty { Text(updated).font(.caption2).foregroundStyle(.tertiary) }
        }
        .widgetURL(URL(string: "opentodo://stats"))
        .modifier(WidgetBackground())
    }

    private var bars: some View {
        let busiest = days.map(\.done).max() ?? 0
        return HStack(alignment: .bottom, spacing: 4) {
            // By position: a malformed payload could name a day twice.
            ForEach(Array(days.enumerated()), id: \.offset) { _, day in
                VStack(spacing: 2) {
                    // The accent over a track, as the system resolves both for light and dark.
                    GeometryReader { geo in
                        ZStack(alignment: .bottom) {
                            RoundedRectangle(cornerRadius: 2).fill(.quaternary)
                            RoundedRectangle(cornerRadius: 2).fill(.tint)
                                .frame(height: geo.size.height * CGFloat(WidgetPublication.Completed.barLevel(done: day.done, max: busiest)) / 100)
                        }
                    }
                    Text(WidgetPublication.Completed.weekdayLetter(day.day)).font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .frame(height: 34)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "Completed per day: \(spoken)"))
    }

    /// "Monday 2, Tuesday 0, …" for VoiceOver.
    private var spoken: String {
        days.map { day in
            let parser = DateFormatter()
            parser.locale = Locale(identifier: "en_US_POSIX")
            parser.timeZone = TimeZone(identifier: "UTC")
            parser.dateFormat = "yyyy-MM-dd"
            let name = parser.date(from: day.day).map { date -> String in
                let out = DateFormatter()
                out.timeZone = TimeZone(identifier: "UTC")
                out.dateFormat = "EEEE"
                return out.string(from: date)
            } ?? day.day
            return "\(name) \(day.done)"
        }.joined(separator: ", ")
    }
}

struct CompletedWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetPublication.completedKind, provider: CompletedProvider()) { entry in
            CompletedWidgetView(entry: entry)
        }
        .configurationDisplayName("Completed")
        .description("How many tasks you completed this week")
        .supportedFamilies([.systemSmall])
    }
}
