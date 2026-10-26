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

    func bridgedBiometricRead() async -> String? { interactive ? BiometricKeyStore.read() : nil }

    func bridgedBiometricForget() { if interactive { BiometricKeyStore.forget() } }

    func bridgedOpenExternal(_ url: String) {
        guard interactive, let target = URL(string: url) else { return }
        UIApplication.shared.open(target)
    }
}
