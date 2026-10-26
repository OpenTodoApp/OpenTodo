import UserNotifications

/// What a reminder's actions and taps do (ios-shell design D3). A local notification cannot
/// change anything by itself: the web app owns every op, so Snooze, Dismiss and the tap all
/// open the shell on a path the web app already understands, which is also why the two
/// actions are `.foreground` — a background launch would have no web app to talk to.
@MainActor
final class Notifications: NSObject, UNUserNotificationCenterDelegate {
    static let shared = Notifications()

    /// Set before launch finishes so a tap that started the app is not dropped.
    func start() {
        UNUserNotificationCenter.current().delegate = self
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let reminder = info["reminder"] as? String
        let task = info["task"] as? String
        let action = response.actionIdentifier
        await MainActor.run {
            guard let reminder else {
                if let task { AppModel.shared.show(task: task) }
                return
            }
            switch action {
            case UNNotificationDefaultActionIdentifier: AppModel.shared.show(task: task ?? reminder)
            case "snooze", "dismiss": AppModel.shared.show(reminder: reminder, action: action)
            default: break
            }
        }
    }

    /// A reminder that fires while the app is open is still shown: the person asked for it.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
