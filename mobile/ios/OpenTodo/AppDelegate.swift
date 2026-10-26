import SwiftUI
import UIKit

/// The things SwiftUI does not cover: the notification category and its delegate, and the
/// background refresh registration, both needed before the first scene appears.
@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        Reminders.shared.registerCategory()
        Notifications.shared.start()
        BackgroundRefresh.register()
        return true
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        BackgroundRefresh.scheduleNext()
    }

    /// The home-screen shortcut on the app icon: "Change server" asks first, because the
    /// reset discards the web app's storage, and that can hold ops which have not synced yet.
    func application(_ application: UIApplication,
                     performActionFor shortcut: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        if shortcut.type == "change-server" { AppModel.shared.changeServerRequested = true }
        completionHandler(true)
    }
}
