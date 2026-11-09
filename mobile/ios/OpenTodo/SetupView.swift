import SwiftUI

/// First run: type the address of your own OpenTodo server, check it, continue.
/// Mirrors `mobile/android/app/src/main/java/app/opentodo/SetupActivity.kt`.
struct SetupView: View {
    @EnvironmentObject private var model: AppModel

    @State private var address = ""
    @State private var message: String?
    @State private var suggestion: String?
    @State private var checking = false
    @FocusState private var editing: Bool

    /// The address as typed so far; Connect is active only while it is well-formed (ios-setup-address).
    private var parsed: ServerAddress { ServerAddress.parse(address) }

    private var insecure: Bool {
        if case .ok(_, true) = parsed { return true }
        return false
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://todo.example.com", text: $address)
                        .textContentType(.URL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($editing)
                        .onChange(of: editing) { focused in if !focused { showScheme() } }
                        .onSubmit { Task { await connect() } }
                } header: {
                    // The system's grey header and footer are small text below 4.5:1 (the
                    // accessibility audit in FirstRunTests); both are in the full text colour.
                    Text("Server address")
                        .foregroundStyle(.primary)
                } footer: {
                    VStack(alignment: .leading, spacing: 8) {
                        if insecure {
                            Label("This connection is not encrypted.", systemImage: "lock.open")
                        }
                        Text("OpenTodo runs on your own server. Enter the address you use in the browser.")
                    }
                    .foregroundStyle(.primary)
                }

                if let message {
                    Section {
                        Label(message, systemImage: "exclamationmark.triangle")
                            .fixedSize(horizontal: false, vertical: true)
                        if let suggestion {
                            // A text style, so the label follows Dynamic Type (the audit in FirstRunTests).
                            Button { address = suggestion; self.suggestion = nil } label: {
                                Text("Use \(suggestion)").font(.body)
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                }

                Section {
                    // A filled button: the accent as text (a dark teal) read as greyed out even
                    // while Connect could be tapped, worst in dark mode (#1137).
                    Button {
                        Task { await connect() }
                    } label: {
                        Text("Connect")
                            .frame(maxWidth: .infinity)
                            .overlay(alignment: .trailing) { if checking { ProgressView() } }
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(checking || parsed == .invalid)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                }
            }
            .navigationTitle("OpenTodo")
            .onAppear { if address.isEmpty { address = Prefs.shared.serverOrigin ?? "" } }
        }
    }

    /// The field shows the address the app will use: an address typed without a scheme gets
    /// its `https://`, visibly, never silently (#1136).
    private func showScheme() {
        if case let .ok(origin, _) = parsed, origin != address { address = origin }
    }

    private func connect() async {
        message = nil
        suggestion = nil
        let result = parsed
        switch result {
        case .invalid:
            message = String(localized: "That is not a usable address.")
        case let .needsHttps(https):
            message = String(localized: "This server must be reached over https.")
            suggestion = https
        case let .ok(origin, insecure):
            address = origin
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
