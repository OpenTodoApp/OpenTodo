import UserNotifications

/// What a reminder's actions and taps do (ios-shell design D3). A local notification cannot
/// change anything by itself: the web app owns every op, so Done, Snooze, Dismiss and the tap
/// all open the shell on a path the web app already understands, which is also why the
/// actions are `.foreground` — a background launch would have no web app to talk to.
@MainActor
final class Notifications: NSObject, UNUserNotificationCenterDelegate {
    static let shared = Notifications()

    /// Where a response leads. Pure, so the routing is testable without a delivered notification.
    enum Route: Equatable {
        case task(String)
        case reminder(String, action: String)
        /// The Focus session-end notification (focus-live-activity D3): the Focus screen.
        case focus
        /// Only bring the app forward: the test notification, or nothing usable in it.
        case app
    }

    /// The reminder id the test notification carries (`Reminders.test()`); it names no reminder.
    nonisolated static let testReminder = "test"

    /// The notification's buttons, in the order shown; each is also the `action` of the
    /// address the web app reads (`web/src/lib/shellActions.ts`, bridge fixture actions.json).
    nonisolated static let actions = ["done", "snooze", "dismiss"]

    nonisolated static func route(reminder: String?, task: String?, action: String, focus: Bool = false) -> Route {
        if focus { return .focus }
        let task = task.flatMap { $0.isEmpty ? nil : $0 }
        guard let reminder, !reminder.isEmpty, reminder != testReminder else {
            return task.map(Route.task) ?? .app
        }
        switch action {
        case UNNotificationDefaultActionIdentifier: return task.map(Route.task) ?? .app
        default: return actions.contains(action) ? .reminder(reminder, action: action) : .app
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
                               action: response.actionIdentifier, focus: info["focus"] != nil)
        await MainActor.run {
            switch route {
            case let .task(id): AppModel.shared.show(task: id)
            case let .reminder(id, action): AppModel.shared.show(reminder: id, action: action)
            case .focus: AppModel.shared.pendingPath = FocusLink.path(action: nil)
            case .app: break
            }
        }
    }

    /// A reminder that fires while the app is open is still shown: the person asked for it.
    /// The Focus session's end is not: the web app on screen shows and sounds it itself.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        notification.request.identifier == FocusLive.notificationId ? [] : [.banner, .sound]
    }
}
