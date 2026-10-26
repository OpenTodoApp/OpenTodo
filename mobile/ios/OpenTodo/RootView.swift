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
