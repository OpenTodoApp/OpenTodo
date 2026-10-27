import SwiftUI

/// First run: type the address of your own OpenTodo server, check it, continue.
/// Mirrors `mobile/android/app/src/main/java/app/opentodo/SetupActivity.kt`.
struct SetupView: View {
    @EnvironmentObject private var model: AppModel

    @State private var address = ""
    @State private var message: String?
    @State private var suggestion: String?
    @State private var checking = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("todo.example.com", text: $address)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit { Task { await connect() } }
                } header: {
                    Text("Server address")
                } footer: {
                    Text("OpenTodo runs on your own server. Enter the address you use in the browser.")
                }

                if let message {
                    Section {
                        Label(message, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.secondary)
                        if let suggestion {
                            Button("Use \(suggestion)") { address = suggestion; self.suggestion = nil }
                        }
                    }
                }

                Section {
                    Button {
                        Task { await connect() }
                    } label: {
                        HStack {
                            Text("Connect")
                            if checking { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(checking || address.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .navigationTitle("OpenTodo")
            .onAppear { if address.isEmpty { address = Prefs.shared.serverOrigin ?? "" } }
        }
    }

    private func connect() async {
        message = nil
        suggestion = nil
        switch ServerAddress.parse(address) {
        case .invalid:
            message = String(localized: "That is not a usable address.")
        case let .needsHttps(https):
            message = String(localized: "This server must be reached over https.")
            suggestion = https
        case let .ok(origin, insecure):
            checking = true
            let answer = await HealthCheck.check(origin: origin)
            checking = false
            switch answer.outcome {
            case .ok:
                if insecure { Prefs.shared.insecureLocalServer = true }
                model.connect(origin)
            case .noNetwork:
                message = String(localized: "No answer from that address. Check the address and your connection.")
            case .notOpenTodo:
                message = String(localized: "That address does not answer like an OpenTodo server.")
            case .untrusted:
                message = String(localized: "The certificate of that server is not trusted by this device.")
            }
        }
    }
}
