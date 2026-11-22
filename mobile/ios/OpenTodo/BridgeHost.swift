import Foundation
import UIKit
import AVFAudio

/// What the bridge does with its methods. The visible app and the hidden background run
/// share it; the background run has no screen, so it never opens the browser or asks for
/// biometrics.
@MainActor
final class BridgeHost: BridgeActions {
    private let interactive: Bool
    private static let completionSound = CompletionSoundPlayback()
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
        guard interactive else { return }
        Haptics.play(Haptics.kind(kind))
    }

    func bridgedPlayCompletionSound() {
        guard interactive, UIApplication.shared.applicationState == .active else { return }
        Self.completionSound.play()
    }

    nonisolated static func completionWave() -> Data {
        struct Partial {
            let start, length, hz, attack, release, decay, level: Double
        }
        let sampleRate = 48_000
        let length = 0.239
        let frames = Int((Double(sampleRate) * length).rounded())
        // The same two notes and short overtones as the web cue, pinned by the shared sample fixture.
        let notes = [
            Partial(start: 0, length: 0.139, hz: 523.25, attack: 0.008, release: 0.036, decay: 17, level: 0.62),
            Partial(start: 0.072, length: length - 0.072, hz: 830.608471346744, attack: 0.004, release: 0.038, decay: 15.8, level: 0.95),
            Partial(start: 0.072, length: 0.073, hz: 2085.0233696990936, attack: 0.002, release: 0.026, decay: 58, level: 0.29),
            Partial(start: 0.072, length: 0.042, hz: 2725.998541786467, attack: 0.0015, release: 0.026, decay: 115, level: 0.29 * 0.43),
        ]
        var peak = 0.0
        let clip = (0..<frames).map { frame -> Float in
            var sample = 0.0
            for note in notes {
                let time = Double(frame) / Double(sampleRate) - note.start
                if time < 0 || time >= note.length { continue }
                let envelope = min(1, time / note.attack, (note.length - time) / note.release)
                sample += sin(2 * .pi * (note.hz * time)) * envelope * note.level * exp(-note.decay * time)
            }
            peak = max(peak, abs(sample))
            return Float(sample)
        }
        let byteCount = UInt32(frames * 2)
        var wave = Data("RIFF".utf8)
        func append<T: FixedWidthInteger>(_ value: T) {
            var littleEndian = value.littleEndian
            withUnsafeBytes(of: &littleEndian) { wave.append(contentsOf: $0) }
        }
        append(36 + byteCount)
        wave.append(contentsOf: "WAVEfmt ".utf8)
        append(UInt32(16))
        append(UInt16(1)) // PCM
        append(UInt16(1)) // mono
        append(UInt32(sampleRate))
        append(UInt32(sampleRate * 2))
        append(UInt16(2))
        append(UInt16(16))
        wave.append(contentsOf: "data".utf8)
        append(byteCount)
        for sample in clip {
            let amplitude = Float(Double(sample) * 0.12 / peak)
            append(Int16((Double(amplitude) * Double(Int16.max)).rounded()))
        }
        return wave
    }

    /// pull-to-sync D4: the visible app's web view turns its refresh control off.
    func bridgedPullHandled() {
        guard interactive else { return }
        NotificationCenter.default.post(name: PullRefresh.handled, object: nil)
    }

    /// shell-reveal-on-paint D2: the visible app's web view shows; a background run shows nothing.
    func bridgedPainted() {
        guard interactive else { return }
        NotificationCenter.default.post(name: FirstPaint.painted, object: nil)
    }

    func bridgedOpenExternal(_ url: String) {
        guard interactive, let target = URL(string: url) else { return }
        UIApplication.shared.open(target)
    }

    func bridgedOpenAppLink(_ url: String) {
        guard interactive, AppLink.scheme(url) != nil, let target = URL(string: url) else { return }
        UIApplication.shared.open(target)
    }
}

/// The audio session is shared with WebKit. Keep the mixing category only while the cue is playing.
@MainActor
private final class CompletionSoundPlayback: NSObject, AVAudioPlayerDelegate {
    private struct Settings: Equatable {
        let category: AVAudioSession.Category
        let mode: AVAudioSession.Mode
        let policy: AVAudioSession.RouteSharingPolicy
        let options: AVAudioSession.CategoryOptions

        init(_ session: AVAudioSession) {
            category = session.category
            mode = session.mode
            policy = session.routeSharingPolicy
            options = session.categoryOptions
        }
    }

    private let session = AVAudioSession.sharedInstance()
    private lazy var wave = BridgeHost.completionWave()
    private var player: AVAudioPlayer?
    private var temporarySettings: (previous: Settings, applied: Settings)?

    override init() {
        super.init()
        // This player lives for the life of the shared session. An interruption does not
        // call the player's completion delegate.
        _ = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification,
                                                  object: session, queue: .main) { [weak self] note in
            guard note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt == AVAudioSession.InterruptionType.began.rawValue else { return }
            MainActor.assumeIsolated { self?.stop() }
        }
        _ = NotificationCenter.default.addObserver(forName: UIApplication.willResignActiveNotification,
                                                  object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.stop() }
        }
    }

    func play() {
        let previous = Settings(session)
        // A recording or another audio category owns the session. The cue can be skipped.
        guard previous.category == .ambient || previous.category == .soloAmbient else { return }
        do {
            let next = try AVAudioPlayer(data: wave)
            if previous.category == .soloAmbient {
                try session.setCategory(.ambient)
                temporarySettings = (previous, Settings(session))
            }
            // A new completion restarts the cue without ending the temporary audio session.
            player?.delegate = nil
            player?.stop()
            next.delegate = self
            player = next
            if !next.play() { stop() }
        } catch {
            // The task is complete even if the audio session cannot play a cue.
        }
    }

    private func stop() {
        player?.delegate = nil
        player?.stop()
        player = nil
        let settings = temporarySettings
        temporarySettings = nil
        // Leave changes another audio client made during playback in place.
        guard let settings, Settings(session) == settings.applied else { return }
        let previous = settings.previous
        try? session.setCategory(previous.category, mode: previous.mode, policy: previous.policy, options: previous.options)
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        playbackEnded(player)
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        playbackEnded(player)
    }

    private nonisolated func playbackEnded(_ completedPlayer: AVAudioPlayer) {
        Task { @MainActor [weak self] in
            guard let self, self.player === completedPlayer else { return }
            self.stop()
        }
    }
}
