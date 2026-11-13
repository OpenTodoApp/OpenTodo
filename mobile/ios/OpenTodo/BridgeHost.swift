import Foundation
import UIKit

/// What the bridge does with its methods. The visible app and the hidden background run
/// share it; the background run has no screen, so it never opens the browser or asks for
/// biometrics.
@MainActor
final class BridgeHost: BridgeActions {
    private let interactive: Bool
    /// The background run's end (shell-reminders-on D4); the visible app has none.
    private let backgroundDone: (@MainActor () -> Void)?

    init(interactive: Bool, backgroundDone: (@MainActor () -> Void)? = nil) {
        self.interactive = interactive
        self.backgroundDone = backgroundDone
    }

    /// shell-reminders-on D2: only the visible app may ask for the notification permission.
    func bridgedScheduleReminders(_ json: String) async -> String {
        await Reminders.shared.replace(json, interactive: interactive)
    }

    /// The test notification asks for the permission, so a run without a screen sends none.
    func bridgedTestNotification() async -> Bool {
        guard interactive else { return false }
        return await Reminders.shared.test()
    }

    /// shell-reminders-on D4: the web app of a background run is done; the visible app ignores it.
    func bridgedBackgroundDone() {
        guard !interactive else { return }
        backgroundDone?()
    }

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

    /// theme-engine D8: a malformed payload keeps the bars and is not logged.
    func bridgedSetSystemBars(_ json: String) {
        guard interactive, SystemBars.parse(json) != nil else { return }
        Prefs.shared.systemBars = json
        NotificationCenter.default.post(name: SystemBars.changed, object: nil, userInfo: ["json": json])
    }

    /// shell-repairs D5: only with a screen, and only a kind the contract names.
    func bridgedHaptic(_ kind: String) {
        guard interactive, let kind = Haptics.kind(kind) else { return }
        Haptics.play(kind)
    }

    func bridgedOpenExternal(_ url: String) {
        guard interactive, let target = URL(string: url) else { return }
        UIApplication.shared.open(target)
    }
}
