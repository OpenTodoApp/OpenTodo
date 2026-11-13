import SwiftUI
import UIKit

/// The status bar icons (shell-repairs D7, native-shells "System bars follow the app's
/// theme"): light on a bar colour that needs light icons, dark otherwise, whatever the
/// phone's appearance is. Only `preferredStatusBarStyle` is used: a colour scheme
/// override would also change `prefers-color-scheme` inside the web view, and a theme
/// that follows the system would flip.
@MainActor
enum StatusBar {
    /// The style of a choice; without one (no bars handed over yet) the system decides.
    nonisolated static func style(lightIcons: Bool?) -> UIStatusBarStyle {
        switch lightIcons {
        case .some(true): return .lightContent
        case .some(false): return .darkContent
        case .none: return .default
        }
    }

    /// The style of the remembered bars (`Prefs.systemBars`); a malformed or missing value is no choice.
    nonisolated static func style(stored json: String?) -> UIStatusBarStyle {
        style(lightIcons: json.flatMap { SystemBars.parse($0) }?.lightIcons)
    }

    /// What the root controller answers. Starts from the remembered bars, so the icons are
    /// right at launch, before the page draws.
    private(set) static var current: UIStatusBarStyle = style(stored: Prefs.shared.systemBars)
    private static weak var controller: StatusBarController?

    /// A new choice: the bridge handed bars over, or the server was forgotten (`nil`).
    static func show(lightIcons: Bool?) {
        current = style(lightIcons: lightIcons)
        controller?.setNeedsStatusBarAppearanceUpdate()
    }

    /// Puts the window's root controller inside one that answers the status bar style.
    /// SwiftUI's own root keeps everything it does (scenes, `onOpenURL`, dialogs); it only
    /// stops being asked for the style. Safe to call again for the same window.
    static func install(in window: UIWindow?) {
        guard let window, let root = window.rootViewController, !(root is StatusBarController) else { return }
        let wrapper = StatusBarController(content: root)
        window.rootViewController = wrapper
        controller = wrapper
        wrapper.setNeedsStatusBarAppearanceUpdate()
    }
}

/// The window's root: SwiftUI's hosting controller as its only child, and the status bar style.
final class StatusBarController: UIViewController {
    private let content: UIViewController

    init(content: UIViewController) {
        self.content = content
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) is not used")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        addChild(content)
        content.view.frame = view.bounds
        content.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(content.view)
        content.didMove(toParent: self)
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { StatusBar.current }
    // The style is this controller's; everything else stays the content's.
    override var childForStatusBarStyle: UIViewController? { nil }
    override var childForStatusBarHidden: UIViewController? { content }
    override var childForHomeIndicatorAutoHidden: UIViewController? { content }
    override var childForScreenEdgesDeferringSystemGestures: UIViewController? { content }
}

/// An empty view behind the app's content that finds the window SwiftUI made and has
/// `StatusBar` take its root. SwiftUI's app lifecycle offers no other way to the root
/// controller without replacing the window it manages.
struct StatusBarInstaller: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView { Probe() }
    func updateUIView(_ uiView: UIView, context: Context) {}

    private final class Probe: UIView {
        override init(frame: CGRect) {
            super.init(frame: frame)
            isUserInteractionEnabled = false
            isAccessibilityElement = false
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) {
            fatalError("init(coder:) is not used")
        }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard window != nil else { return }
            // After this pass: the root is not replaced while the view tree is being built.
            Task { @MainActor [weak self] in StatusBar.install(in: self?.window) }
        }
    }
}
