import Foundation
import UserNotifications

/// Reminders without a push service (ios-shell design D3): the web app hands over the
/// next 7 days, the shell schedules one local notification each, and iOS decides when a
/// background refresh runs.
@MainActor
final class Reminders {
    static let shared = Reminders()

    static let identifierPrefix = "opentodo.reminder."
    static let categoryIdentifier = "opentodo.reminder"
    /// iOS keeps at most 64 pending notifications per app.
    static let maxPending = 64

    /// One handed-over reminder, as `web/src/lib/shell.ts` `ShellReminder` sends it.
    struct Handed: Decodable, Equatable {
        let id: String
        let taskId: String
        let fireAt: Double
        let title: String?
    }

    /// The schedule the shell applies: due in the future, earliest first, at most `limit`.
    static func select(_ handed: [Handed], now: Date = Date(), limit: Int? = nil) -> [Handed] {
        handed
            .filter { $0.fireAt / 1000 > now.timeIntervalSince1970 }
            .sorted { $0.fireAt < $1.fireAt }
            .prefix(limit ?? maxPending)
            .map { $0 }
    }

    static func parse(_ json: String) -> [Handed] {
        guard let data = json.data(using: .utf8) else { return [] }
        return (try? JSONDecoder().decode([Handed].self, from: data)) ?? []
    }

    func registerCategory() {
        // `.foreground`: a local notification cannot change a task by itself, so Snooze and
        // Dismiss open the shell where the web app performs them (design D3).
        let snooze = UNNotificationAction(identifier: "snooze", title: String(localized: "Snooze 10 min"), options: [.foreground])
        let dismiss = UNNotificationAction(identifier: "dismiss", title: String(localized: "Dismiss"), options: [.foreground])
        let category = UNNotificationCategory(identifier: Self.categoryIdentifier, actions: [snooze, dismiss], intentIdentifiers: [])
        UNUserNotificationCenter.current().setNotificationCategories([category])
    }

    /// Replaces the schedule; returns what `scheduleReminders` answers the web app.
    func replace(_ json: String) async -> String {
        let handed = Self.parse(json)
        let chosen = Self.select(handed)
        await removeScheduled()
        guard !chosen.isEmpty else { return "granted" }
        let center = UNUserNotificationCenter.current()
        let granted = await requestAuthorization(center)
        guard granted else { return "denied" }
        registerCategory()
        for reminder in chosen {
            let content = UNMutableNotificationContent()
            content.title = reminder.title ?? String(localized: "OpenTodo reminder")
            content.body = ""
            content.sound = .default
            content.categoryIdentifier = Self.categoryIdentifier
            content.userInfo = ["reminder": reminder.id, "task": reminder.taskId]
            let fireDate = Date(timeIntervalSince1970: reminder.fireAt / 1000)
            let trigger = UNCalendarNotificationTrigger(dateMatching: Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: fireDate), repeats: false)
            let request = UNNotificationRequest(identifier: Self.identifierPrefix + reminder.id, content: content, trigger: trigger)
            try? await center.add(request)
        }
        return "granted"
    }

    func test() async -> Bool {
        let center = UNUserNotificationCenter.current()
        guard await requestAuthorization(center) else { return false }
        registerCategory()
        let content = UNMutableNotificationContent()
        content.title = String(localized: "OpenTodo reminder")
        content.body = String(localized: "This is what a reminder looks like.")
        content.sound = .default
        content.categoryIdentifier = Self.categoryIdentifier
        content.userInfo = ["reminder": "test", "task": ""]
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 2, repeats: false)
        return (try? await center.add(UNNotificationRequest(identifier: Self.identifierPrefix + "test", content: content, trigger: trigger))) != nil
    }

    /// Deletes the schedule: sign-out, a locked encrypted account, a changed server.
    func clear() async {
        await removeScheduled()
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
    }

    private func requestAuthorization(_ center: UNUserNotificationCenter) async -> Bool {
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return true
        case .denied: return false
        default: return (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        }
    }

    private func removeScheduled() async {
        let pending = await UNUserNotificationCenter.current().pendingNotificationRequests()
        let ids = pending.map(\.identifier).filter { $0.hasPrefix(Self.identifierPrefix) }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
    }
}
