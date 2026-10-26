import SwiftUI
import UIKit

/// The two things SwiftUI does not cover: the notification category and the background
/// refresh registration, both needed before the first scene appears.
@MainActor
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        Reminders.shared.registerCategory()
        BackgroundRefresh.register()
        return true
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        BackgroundRefresh.scheduleNext()
    }

    /// The home-screen shortcut on the app icon: "Change server" forgets the current
    /// one and shows the first-run screen again (`UIApplicationShortcutItemType` in
    /// Info.plist).
    func application(_ application: UIApplication,
                     performActionFor shortcut: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        if shortcut.type == "change-server" { AppModel.shared.forgetServer() }
        completionHandler(true)
    }
}
