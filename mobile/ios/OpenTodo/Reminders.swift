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
    struct Handed: Equatable {
        let id: String
        let taskId: String
        let fireAt: Double
        let title: String?
    }

    /// A reminder handed over up to this late still fires, at once (ms).
    static let grace: Double = 60_000
    /// The furthest ahead a reminder is armed (ms); the web app hands over 7 days.
    static let horizon: Double = 8 * 24 * 60 * 60 * 1000

    /// The schedule the shell applies: from a minute ago (a late hand-over still fires) to the
    /// horizon, one per id (the first), earliest first, at most `limit`. The rule of Android's
    /// `ReminderSchedule.parse`; both apps read the cases in `reminders/schedule.json`.
    static func select(_ handed: [Handed], now: Date = Date(), limit: Int? = nil) -> [Handed] {
        let at = now.timeIntervalSince1970 * 1000
        var seen = Set<String>()
        return handed
            .filter { $0.fireAt >= at - grace && $0.fireAt <= at + horizon }
            .filter { seen.insert($0.id).inserted }
            .sorted { $0.fireAt < $1.fireAt }
            .prefix(limit ?? maxPending)
            .map { $0 }
    }

    /// Each entry on its own: one the shell cannot read is left out, never the whole schedule.
    static func parse(_ json: String) -> [Handed] {
        guard let data = json.data(using: .utf8),
              let list = (try? JSONSerialization.jsonObject(with: data)) as? [Any] else { return [] }
        return list.compactMap { item in
            guard let o = item as? [String: Any],
                  let id = o["id"] as? String, (1...100).contains(id.count),
                  let taskId = o["taskId"] as? String, (1...100).contains(taskId.count),
                  let number = o["fireAt"] as? NSNumber, number.doubleValue >= 0
            else { return nil }
            let title = (o["title"] as? String).map { String($0.prefix(200)) }
            return Handed(id: id, taskId: taskId, fireAt: number.doubleValue, title: title?.isEmpty == false ? title : nil)
        }
    }

    func registerCategory() {
        // `.foreground`: a local notification cannot change a task by itself, so Done, Snooze
        // and Dismiss open the shell where the web app performs them (ios-shell D3,
        // shell-repairs D6). The identifiers are `Notifications.actions`.
        let done = UNNotificationAction(identifier: "done", title: String(localized: "Done"), options: [.foreground])
        let snooze = UNNotificationAction(identifier: "snooze", title: String(localized: "Snooze 10 min"), options: [.foreground])
        let dismiss = UNNotificationAction(identifier: "dismiss", title: String(localized: "Dismiss"), options: [.foreground])
        let category = UNNotificationCategory(identifier: Self.categoryIdentifier, actions: [done, snooze, dismiss], intentIdentifiers: [])
        UNUserNotificationCenter.current().setNotificationCategories([category])
    }

    /// The hand-over in progress. The screen and a background run each have a web view and
    /// both hand over schedules; a replace waits for the one before it, so their
    /// remove-then-add steps cannot interleave and leave an older schedule behind.
    private var latestReplace: Task<String, Never>?

    /// What a hand-over does about the notification permission.
    enum Permission: Equatable {
        /// Schedule what was handed over; nothing is asked.
        case schedule
        /// Ask the person, then schedule if they allow it.
        case ask
        /// Schedule nothing and answer `denied`.
        case refuse
    }

    /// The permission rule (shell-reminders-on D2): the question comes with the first
    /// reminder and only from the visible app (`interactive`). A background run that is
    /// handed reminders before anyone was asked refuses without asking, so the visible
    /// app's next hand-over asks; iOS itself never asks twice.
    nonisolated static func permission(status: UNAuthorizationStatus, interactive: Bool, hasReminders: Bool) -> Permission {
        guard hasReminders else { return .schedule }
        switch status {
        case .authorized, .provisional, .ephemeral: return .schedule
        case .denied: return .refuse
        default: return interactive ? .ask : .refuse
        }
    }

    /// Replaces the schedule; returns what `scheduleReminders` answers the web app.
    /// `interactive`: the hand-over comes from the visible app, which may ask.
    func replace(_ json: String, interactive: Bool) async -> String {
        let previous = latestReplace
        let task = Task { @MainActor in
            _ = await previous?.value
            return await self.apply(json, interactive: interactive)
        }
        latestReplace = task
        return await task.value
    }

    private func apply(_ json: String, interactive: Bool) async -> String {
        let handed = Self.parse(json)
        let chosen = Self.select(handed)
        await removeScheduled()
        guard !chosen.isEmpty else { return "granted" }
        let center = UNUserNotificationCenter.current()
        let status = await center.notificationSettings().authorizationStatus
        switch Self.permission(status: status, interactive: interactive, hasReminders: true) {
        case .schedule: break
        case .refuse: return "denied"
        case .ask:
            let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            guard granted else { return "denied" }
        }
        registerCategory()
        // What already showed, and when: a late reminder handed over again must not alert twice,
        // but the same reminder snoozed to a later time must (Android's `wasShown`, same minute).
        let delivered = await center.deliveredNotifications().map { ($0.request.identifier, $0.date) }
        for reminder in chosen {
            let content = UNMutableNotificationContent()
            content.title = reminder.title ?? String(localized: "OpenTodo reminder")
            content.body = ""
            content.sound = .default
            content.categoryIdentifier = Self.categoryIdentifier
            content.userInfo = ["reminder": reminder.id, "task": reminder.taskId]
            let identifier = Self.identifierPrefix + reminder.id
            let fireDate = Date(timeIntervalSince1970: reminder.fireAt / 1000)
            let trigger: UNNotificationTrigger
            if fireDate.timeIntervalSinceNow <= 1 {
                // Handed over late (within `grace`): now, unless it already showed.
                let shown = delivered.contains { $0.0 == identifier && abs($0.1.timeIntervalSince(fireDate)) < Self.grace / 1000 }
                if shown { continue }
                trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
            } else {
                trigger = UNCalendarNotificationTrigger(dateMatching: Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: fireDate), repeats: false)
            }
            let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
            try? await center.add(request)
        }
        return "granted"
    }

    /// Only the visible app calls this (`BridgeHost`), so it may ask.
    func test() async -> Bool {
        let center = UNUserNotificationCenter.current()
        guard await requestAuthorization(center) else { return false }
        registerCategory()
        let content = UNMutableNotificationContent()
        content.title = String(localized: "OpenTodo reminder")
        content.body = String(localized: "This is what a reminder looks like.")
        content.sound = .default
        content.categoryIdentifier = Self.categoryIdentifier
        content.userInfo = ["reminder": Notifications.testReminder, "task": ""]
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
