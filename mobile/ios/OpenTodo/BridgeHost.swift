import Foundation
import UIKit

/// What the bridge does with its methods. The visible app and the hidden background run
/// share it; the background run has no screen, so it never opens the browser or asks for
/// biometrics.
@MainActor
final class BridgeHost: BridgeActions {
    private let interactive: Bool

    init(interactive: Bool) { self.interactive = interactive }

    func bridgedScheduleReminders(_ json: String) async -> String { await Reminders.shared.replace(json) }

    func bridgedTestNotification() async -> Bool { await Reminders.shared.test() }

    func bridgedPublishWidget(_ json: String) { WidgetPublication.publish(json) }

    func bridgedBiometricStore(_ keyB64: String) async -> Bool {
        guard interactive, let key = BiometricKeyStore.decode(keyB64) else { return false }
        return BiometricKeyStore.store(key)
    }

    /// Off the main actor: `SecItemCopyMatching` blocks until the Face ID prompt is answered.
    func bridgedBiometricRead() async -> String? {
        guard interactive else { return nil }
        return await Task.detached { BiometricKeyStore.read() }.value
    }

    func bridgedBiometricForget() { if interactive { BiometricKeyStore.forget() } }

    func bridgedOpenExternal(_ url: String) {
        guard interactive, let target = URL(string: url) else { return }
        UIApplication.shared.open(target)
    }
}
