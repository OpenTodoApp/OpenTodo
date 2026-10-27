import SwiftUI

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        if let origin = model.origin {
            ShellView(origin: origin)
        } else {
            SetupView()
        }
    }
}

/// The "Change server" shortcut resets the app, so it asks first — the web app's storage can
/// hold changes that have not reached the server yet.
struct ChangeServerDialog: ViewModifier {
    @EnvironmentObject private var model: AppModel

    func body(content: Content) -> some View {
        content.confirmationDialog("Change server?",
                                   isPresented: $model.changeServerRequested,
                                   titleVisibility: .visible) {
            Button("Remove the server and its data", role: .destructive) { model.forgetServer() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Changes that have not reached the server are lost. Your tasks stay on the server.")
        }
    }
}
