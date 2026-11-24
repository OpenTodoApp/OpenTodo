import CryptoKit
import Foundation
import UserNotifications
#if canImport(AlarmKit)
// ios-urgent-alarms D7: only an SDK with AlarmKit (iOS 26, Xcode 26) compiles the alarms; with
// an older one every urgent reminder is a notification. The framework is weak-linked, so the
// app still starts on iOS 16.4 to 25 (`ios-testflight.sh archive` checks it).
import AlarmKit
import AppIntents
import SwiftUI
#endif

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
        /// Rings as an alarm where it can (ios-urgent-alarms D3); absent in the hand-over means no.
        var urgent = false
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
            return Handed(id: id, taskId: taskId, fireAt: number.doubleValue, title: title?.isEmpty == false ? title : nil,
                          urgent: (o["urgent"] as? Bool) == true)
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
        guard !chosen.isEmpty else {
            _ = await AlarmScheduler.replace([], interactive: false)
            return "granted"
        }
        let center = UNUserNotificationCenter.current()
        let status = await center.notificationSettings().authorizationStatus
        // ios-urgent-alarms D3: the notification permission is the master switch; refused, no
        // alarm rings either.
        switch Self.permission(status: status, interactive: interactive, hasReminders: true) {
        case .schedule: break
        case .refuse:
            _ = await AlarmScheduler.replace([], interactive: false)
            return "denied"
        case .ask:
            let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            guard granted else {
                _ = await AlarmScheduler.replace([], interactive: false)
                return "denied"
            }
        }
        registerCategory()
        // Urgent reminders still ahead ring as alarms where AlarmKit is there and allowed; the
        // rest, and an urgent one that could not be armed, are notifications.
        let armed = await AlarmScheduler.replace(Alarms.candidates(chosen), interactive: interactive)
        // What already showed, and when: a late reminder handed over again must not alert twice,
        // but the same reminder snoozed to a later time must (Android's `wasShown`, same minute).
        let delivered = await center.deliveredNotifications().map { ($0.request.identifier, $0.date) }
        for reminder in chosen where !armed.contains(reminder.id) {
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
        _ = await AlarmScheduler.replace([], interactive: false)
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

/// Urgent reminders as alarms (OpenSpec change ios-urgent-alarms): the rules, pure so the
/// unit tests run on any SDK. The AlarmKit calls are in `AlarmKitScheduler` below.
enum Alarms {
    /// AlarmKit's authorization, without AlarmKit's type (it exists only in the iOS 26 SDK).
    enum Authorization: Equatable { case notDetermined, authorized, denied }

    /// What an urgent reminder becomes.
    enum Route: Equatable {
        /// An alarm: AlarmKit is there and allowed.
        case alarm
        /// Ask the person, then an alarm if they allow it.
        case ask
        /// An ordinary notification.
        case notification
    }

    /// The permission rule (design D4), the notification permission's own: the question comes
    /// with the first urgent reminder and only from the visible app; a background run leaves
    /// it to the visible app's next hand-over, and iOS never asks twice.
    static func route(available: Bool, state: Authorization, interactive: Bool) -> Route {
        guard available else { return .notification }
        switch state {
        case .authorized: return .alarm
        case .denied: return .notification
        case .notDetermined: return interactive ? .ask : .notification
        }
    }

    /// The urgent reminders an alarm can ring for (design D3): still more than a second away.
    /// One handed over at its time is a notification, whose duplicate check can see that it
    /// already showed; an alarm that rang leaves nothing to check.
    static func candidates(_ chosen: [Reminders.Handed], now: Date = Date()) -> [Reminders.Handed] {
        let at = now.timeIntervalSince1970 * 1000
        return chosen.filter { $0.urgent && $0.fireAt > at + 1000 }
    }

    /// The alarm's id for a reminder (design D5): the first 16 bytes of SHA-256 of
    /// `opentodo.reminder.<id>`, marked as a version 5 UUID, so a reminder keeps its alarm.
    static func alarmID(_ reminderId: String) -> UUID {
        var b = Array(SHA256.hash(data: Data(("opentodo.reminder." + reminderId).utf8)).prefix(16))
        b[6] = (b[6] & 0x0F) | 0x50
        b[8] = (b[8] & 0x3F) | 0x80
        return UUID(uuid: (b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7], b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]))
    }

    /// What an armed alarm was armed with: the time and a digest of the title, so a moved or
    /// renamed reminder is armed again, without keeping the title itself.
    static func signature(_ r: Reminders.Handed) -> String {
        let title = SHA256.hash(data: Data((r.title ?? "").utf8)).prefix(8).map { String(format: "%02x", $0) }.joined()
        return "\(Int64(r.fireAt))|\(title)"
    }

    /// The difference between the alarms the system holds (id → the signature they were armed
    /// with, nil when unknown) and the ones wanted (design D5): an unchanged alarm is left
    /// alone, a moved or renamed one is cancelled and armed again, any other one is cancelled.
    static func changes(current: [UUID: String?], wanted: [Reminders.Handed]) -> (cancel: [UUID], schedule: [Reminders.Handed]) {
        var keep = Set<UUID>()
        var schedule: [Reminders.Handed] = []
        for r in wanted {
            let id = alarmID(r.id)
            if case let .some(.some(armed)) = current[id], armed == signature(r) {
                keep.insert(id)
            } else {
                schedule.append(r)
            }
        }
        let cancel = current.keys.filter { !keep.contains($0) }.sorted { $0.uuidString < $1.uuidString }
        return (cancel, schedule)
    }
}

/// The alarms of the app, armed or cancelled with the schedule. Without AlarmKit (an older
/// SDK or iOS) nothing is armed and every urgent reminder is a notification.
@MainActor
enum AlarmScheduler {
    /// Arms `candidates` where it can and cancels every other alarm of the app; returns the
    /// reminder ids armed as alarms, which then get no notification.
    static func replace(_ candidates: [Reminders.Handed], interactive: Bool) async -> Set<String> {
        #if canImport(AlarmKit)
        if #available(iOS 26.0, *) {
            return await AlarmKitScheduler.replace(candidates, interactive: interactive)
        }
        #endif
        return []
    }
}

#if canImport(AlarmKit)
/// What an alarm carries: the reminder and its task, never the title.
@available(iOS 26.0, *)
struct ReminderAlarm: AlarmMetadata {
    var reminder: String
    var task: String
}

@available(iOS 26.0, *)
@MainActor
enum AlarmKitScheduler {
    /// The signatures of the armed alarms (`Alarms.signature`) by alarm id, in the app's own
    /// defaults; emptied with the alarms.
    private static let signaturesKey = "opentodo.alarms"

    static func authorization() -> Alarms.Authorization {
        switch AlarmManager.shared.authorizationState {
        case .authorized: return .authorized
        case .denied: return .denied
        case .notDetermined: return .notDetermined
        @unknown default: return .denied
        }
    }

    static func replace(_ candidates: [Reminders.Handed], interactive: Bool) async -> Set<String> {
        let manager = AlarmManager.shared
        var wanted = candidates
        if !candidates.isEmpty {
            switch Alarms.route(available: true, state: authorization(), interactive: interactive) {
            case .alarm: break
            case .notification: wanted = []
            case .ask:
                let state = try? await manager.requestAuthorization()
                if state != .authorized { wanted = [] }
            }
        }
        let stored = UserDefaults.standard.dictionary(forKey: signaturesKey) as? [String: String] ?? [:]
        let ids = ((try? manager.alarms) ?? []).map(\.id)
        let current = Dictionary(ids.map { ($0, stored[$0.uuidString]) }, uniquingKeysWith: { a, _ in a })
        let plan = Alarms.changes(current: current, wanted: wanted)
        var signatures = stored.filter { key, _ in ids.contains { $0.uuidString == key } }
        for id in plan.cancel {
            try? manager.cancel(id: id)
            signatures[id.uuidString] = nil
        }
        var armed = Set(wanted.map(\.id))
        for reminder in plan.schedule {
            let id = Alarms.alarmID(reminder.id)
            do {
                _ = try await manager.schedule(id: id, configuration: configuration(reminder))
                signatures[id.uuidString] = Alarms.signature(reminder)
            } catch {
                armed.remove(reminder.id)
            }
        }
        UserDefaults.standard.set(signatures, forKey: signaturesKey)
        return armed
    }

    /// The alarm: the task's title or the generic text, Stop (the system's, design D6) and
    /// Snooze 10 min, which opens the app on the reminder's snooze address.
    private static func configuration(_ r: Reminders.Handed) -> AlarmManager.AlarmConfiguration<ReminderAlarm> {
        let title: LocalizedStringResource = r.title.map { LocalizedStringResource(stringLiteral: $0) } ?? "OpenTodo reminder"
        let alert = AlarmPresentation.Alert(
            title: title,
            stopButton: AlarmButton(text: "Stop", textColor: .white, systemImageName: "stop.circle"),
            secondaryButton: AlarmButton(text: "Snooze 10 min", textColor: .white, systemImageName: "zzz"),
            secondaryButtonBehavior: .custom)
        let attributes = AlarmAttributes(presentation: AlarmPresentation(alert: alert),
                                         metadata: ReminderAlarm(reminder: r.id, task: r.taskId),
                                         tintColor: Color.accentColor)
        return AlarmManager.AlarmConfiguration(schedule: .fixed(Date(timeIntervalSince1970: r.fireAt / 1000)),
                                               attributes: attributes,
                                               secondaryIntent: SnoozeReminderIntent(reminder: r.id))
    }
}

/// An alarm's Snooze 10 min (design D6): opens the app at `/?reminder=<id>&action=snooze`, the
/// address of the notification's Snooze, so the web app moves the reminder through its own op.
@available(iOS 26.0, *)
struct SnoozeReminderIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Snooze 10 min"
    static let openAppWhenRun = true
    static let isDiscoverable = false

    @Parameter(title: "Reminder")
    var reminder: String

    init() {}

    init(reminder: String) {
        self.reminder = reminder
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        AppModel.shared.show(reminder: reminder, action: "snooze")
        return .result()
    }
}
#endif
