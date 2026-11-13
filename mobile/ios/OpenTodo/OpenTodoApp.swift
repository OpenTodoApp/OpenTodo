import SwiftUI

@main
struct OpenTodoApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var model = AppModel.shared

    var body: some Scene {
        WindowGroup {
            // The modifier comes first so that the model is injected above it.
            RootView()
                .modifier(ChangeServerDialog())
                .environmentObject(model)
                // The window's root answers the status bar style (shell-repairs D7).
                .background(StatusBarInstaller())
                .onOpenURL { model.handle(url: $0) }
        }
    }
}
