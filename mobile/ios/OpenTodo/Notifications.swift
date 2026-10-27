import UserNotifications

/// What a reminder's actions and taps do (ios-shell design D3). A local notification cannot
/// change anything by itself: the web app owns every op, so Snooze, Dismiss and the tap all
/// open the shell on a path the web app already understands, which is also why the two
/// actions are `.foreground` — a background launch would have no web app to talk to.
@MainActor
final class Notifications: NSObject, UNUserNotificationCenterDelegate {
    static let shared = Notifications()

    /// Where a response leads. Pure, so the routing is testable without a delivered notification.
    enum Route: Equatable {
        case task(String)
        case reminder(String, action: String)
        /// Only bring the app forward: the test notification, or nothing usable in it.
        case app
    }

    /// The reminder id the test notification carries (`Reminders.test()`); it names no reminder.
    nonisolated static let testReminder = "test"

    nonisolated static func route(reminder: String?, task: String?, action: String) -> Route {
        let task = task.flatMap { $0.isEmpty ? nil : $0 }
        guard let reminder, !reminder.isEmpty, reminder != testReminder else {
            return task.map(Route.task) ?? .app
        }
        switch action {
        case "snooze", "dismiss": return .reminder(reminder, action: action)
        case UNNotificationDefaultActionIdentifier: return task.map(Route.task) ?? .app
        default: return .app
        }
    }

    /// Set before launch finishes so a tap that started the app is not dropped.
    func start() {
        UNUserNotificationCenter.current().delegate = self
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let route = Self.route(reminder: info["reminder"] as? String, task: info["task"] as? String,
                               action: response.actionIdentifier)
        await MainActor.run {
            switch route {
            case let .task(id): AppModel.shared.show(task: id)
            case let .reminder(id, action): AppModel.shared.show(reminder: id, action: action)
            case .app: break
            }
        }
    }

    /// A reminder that fires while the app is open is still shown: the person asked for it.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
