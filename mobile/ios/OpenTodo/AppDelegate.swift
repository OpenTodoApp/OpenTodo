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

    /// The quick actions on the app icon (AppModel.perform(shortcut:)). A SwiftUI app runs in
    /// scenes, so UIKit hands them to the scene's delegate, never to this one: the item that
    /// launched the app comes with the scene's connection, a later one to QuickActionSceneDelegate.
    func application(_ application: UIApplication,
                     configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        if let item = options.shortcutItem { AppModel.shared.perform(shortcut: item.type) }
        let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)
        configuration.delegateClass = QuickActionSceneDelegate.self
        return configuration
    }
}

/// A quick action chosen while the app is running; SwiftUI keeps drawing the window.
@MainActor
final class QuickActionSceneDelegate: NSObject, UIWindowSceneDelegate {
    func windowScene(_ windowScene: UIWindowScene,
                     performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        completionHandler(AppModel.shared.perform(shortcut: shortcutItem.type))
    }
}
