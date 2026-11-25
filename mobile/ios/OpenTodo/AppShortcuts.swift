import AppIntents
import Foundation
import UIKit

// Siri, Shortcuts and the Action Button (OpenSpec change apple-shortcuts, design D4). The
// intents never make a request: the two that open the app go through AppModel's addresses,
// as the widgets and the icon's quick actions do, and "What's on today" answers from the
// last Today publication. The phrases are translated in <lang>.lproj/AppShortcuts.strings (a
// String Catalog of phrases needs iOS 17), the titles and answers in Shared/Localizable.xcstrings.

/// Opens the app at `/today`.
struct OpenTodayIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Today"
    static let openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        ShortcutRoute.today(AppModel.shared)
        return .result()
    }
}

/// Opens the app at quick add, empty (`/?add=`), like the widgets' add button.
struct OpenQuickAddIntent: AppIntent {
    static let title: LocalizedStringResource = "Open quick add"
    static let openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        ShortcutRoute.quickAdd(AppModel.shared)
        return .result()
    }
}

/// "What's on today": answers from the last publication without opening the app. Siri may
/// run it on a locked phone, so it then answers with counts only.
struct TodayIntent: AppIntent {
    static let title: LocalizedStringResource = "What's on today"

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text = TodaySummary.text(WidgetPublication.load(), phoneLocked: !UIApplication.shared.isProtectedDataAvailable)
        // The text is already localised: built from a variable, the dialog is no catalog key.
        return .result(dialog: IntentDialog(LocalizedStringResource(stringLiteral: text)))
    }
}

/// Every intent as an App Shortcut, so Siri, Spotlight, the Action Button and the Shortcuts
/// app offer them without any setup. Each phrase names the app, as the system requires. The
/// optional title and symbol pick the iOS 16 initialiser; the non-optional one needs iOS 17.
struct OpenTodoShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: TodayIntent(), phrases: [
            "What's on today in \(.applicationName)",
            "What do I have today in \(.applicationName)",
        ], shortTitle: "What's on today" as LocalizedStringResource?, systemImageName: "checklist" as String?)
        AppShortcut(intent: OpenTodayIntent(), phrases: ["Open Today in \(.applicationName)"],
                    shortTitle: "Open Today" as LocalizedStringResource?, systemImageName: "sun.max" as String?)
        AppShortcut(intent: OpenQuickAddIntent(), phrases: ["Open quick add in \(.applicationName)"],
                    shortTitle: "Open quick add" as LocalizedStringResource?, systemImageName: "plus" as String?)
    }
}

/// Where the opening intents lead: the addresses the widgets and the icon's quick actions open.
@MainActor
enum ShortcutRoute {
    static func today(_ model: AppModel) { model.pendingPath = "/today" }
    static func quickAdd(_ model: AppModel) { model.show(add: "") }
}

/// The answer of "What's on today" (design D4), one sentence per line: the count and the
/// overdue count, up to five titles with their times, and the time of the publication. A
/// publication made while the account was locked gives counts only, as the Today widget does,
/// and so does a locked phone. A publication from an earlier day starts with its date instead
/// of ending with its time. Before the first unlock after a restart nothing can be read.
enum TodaySummary {
    static let maxTitles = 5

    static func text(_ publication: WidgetPublication.Publication?, phoneLocked: Bool = false,
                     now: Date = Date(), calendar: Calendar = .current) -> String {
        lines(publication, phoneLocked: phoneLocked, now: now, calendar: calendar).joined(separator: "\n")
    }

    static func lines(_ publication: WidgetPublication.Publication?, phoneLocked: Bool = false,
                      now: Date = Date(), calendar: Calendar = .current) -> [String] {
        guard let p = publication else {
            return [phoneLocked ? String(localized: "Unlock to see today.") : String(localized: "Open OpenTodo once to see today here.")]
        }
        var lines: [String] = []
        let date = Date(timeIntervalSince1970: p.updatedAt / 1000)
        let earlierDay = p.updatedAt > 0 && !calendar.isDate(date, inSameDayAs: now)
        if earlierDay {
            lines.append(String(localized: "This list is from \(date.formatted(date: .abbreviated, time: .shortened))."))
        }
        if p.count <= 0 {
            lines.append(String(localized: "Nothing left for today."))
        } else {
            lines.append(p.overdue > 0 ? String(localized: "\(p.count) today · \(p.overdue) overdue") : String(localized: "\(p.count) today"))
            if p.locked {
                lines.append(String(localized: "Locked. Open OpenTodo to see your tasks."))
            } else if !phoneLocked, !p.tasks.isEmpty {
                lines.append(ListFormatter.localizedString(byJoining: p.tasks.prefix(maxTitles).map(item)))
            }
        }
        if p.updatedAt > 0, !earlierDay {
            lines.append(String(localized: "Updated \(date.formatted(date: .omitted, time: .shortened))"))
        }
        return lines
    }

    private static func item(_ task: WidgetPublication.Task) -> String {
        let title = task.title ?? String(localized: "Task")
        guard let time = task.time, !time.isEmpty else { return title }
        return String(localized: "\(title) at \(time)")
    }
}
