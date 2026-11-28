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
        // The Today widget's ticks wait for the app (ios-widget-complete D3). A scene-based
        // app is told it became active through this notification, not this delegate.
        _ = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
            MainActor.assumeIsolated { WidgetCompletions.apply() }
        }
        return true
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        BackgroundRefresh.scheduleNext()
    }

    /// The quick actions on the app icon (AppModel.perform(shortcut:)). A SwiftUI app runs in
    /// scenes, so UIKit hands them to the scene's delegate, never to this one. The item is read
    /// there too, not here: a restored scene session connects without asking for a configuration.
    func application(_ application: UIApplication,
                     configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)
        if session.role == .windowApplication { configuration.delegateClass = QuickActionSceneDelegate.self }
        return configuration
    }
}

/// The icon's quick actions, at a cold start (the connection's item) and while the app runs;
/// SwiftUI keeps drawing the window.
@MainActor
final class QuickActionSceneDelegate: NSObject, UIWindowSceneDelegate {
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let item = connectionOptions.shortcutItem else { return }
        AppModel.shared.perform(shortcut: item.type, atLaunch: true)
    }

    func windowScene(_ windowScene: UIWindowScene,
                     performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        completionHandler(AppModel.shared.perform(shortcut: shortcutItem.type))
    }
}
