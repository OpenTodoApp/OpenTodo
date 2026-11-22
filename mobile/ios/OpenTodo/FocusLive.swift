import ActivityKit
import Foundation
import UserNotifications

/// The running Focus session outside the app (focus-live-activity D2, D3, D7): at most one
/// Live Activity, drawn by the system clock so nothing updates it while the app sleeps, with
/// its stale date at the planned end, and one local notification at that end. Each
/// publication replaces both; none, sign-out and "Change server" remove them.
@MainActor
final class FocusLive {
    static let shared = FocusLive()

    nonisolated static let notificationId = "opentodo.focus.end"
    /// After the web app says the session is done, the activity stays this long on the lock screen.
    static let doneLinger: TimeInterval = 15 * 60

    private var latest: Task<Void, Never>?

    /// Applies publications in order, so a quick pause and resume cannot land reversed.
    func publish(_ json: String) {
        let publication = FocusPublication.parse(json)
        let previous = latest
        latest = Task { @MainActor in
            await previous?.value
            await self.apply(publication)
        }
    }

    /// Ends the activity and cancels the notification: "Change server".
    func clear() { publish("") }

    private func apply(_ p: FocusPublication) async {
        await scheduleEnd(p)
        let activities = Activity<FocusAttributes>.activities
        let state = FocusAttributes.content(p)
        if p.state == .done {
            let content = ActivityContent(state: state, staleDate: nil)
            for a in activities { await a.end(content, dismissalPolicy: .after(Date().addingTimeInterval(Self.doneLinger))) }
            return
        }
        // The user's switch in Settings ▸ OpenTodo ▸ Live Activities (D6) is honoured here.
        guard p.shown, ActivityAuthorizationInfo().areActivitiesEnabled else {
            for a in activities { await a.end(nil, dismissalPolicy: .immediate) }
            return
        }
        let content = ActivityContent(state: state, staleDate: state.end)
        if let first = activities.first {
            await first.update(content)
            // An activity that outlived a killed app is reused; any extra one ends (D7).
            for extra in activities.dropFirst() { await extra.end(nil, dismissalPolicy: .immediate) }
        } else {
            _ = try? Activity.request(attributes: FocusAttributes(), content: content, pushType: nil)
        }
    }

    /// "Session done" or "Break over" at the planned end, naming the task only when its title
    /// was handed over (D3, D5). Never asks for the permission: reminders ask for it.
    private func scheduleEnd(_ p: FocusPublication) async {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [Self.notificationId])
        guard let at = p.notifyAt else { return }
        let status = await center.notificationSettings().authorizationStatus
        guard status == .authorized || status == .provisional || status == .ephemeral else { return }
        let content = UNMutableNotificationContent()
        content.title = p.isBreak ? String(localized: "Break over") : String(localized: "Session done")
        content.body = p.title ?? ""
        content.sound = .default
        content.userInfo = ["focus": true]
        let interval = max(1, at / 1000 - Date().timeIntervalSince1970)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
        try? await center.add(UNNotificationRequest(identifier: Self.notificationId, content: content, trigger: trigger))
    }
}
