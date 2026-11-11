import Foundation

/// Which main-frame navigations stay in the web view (native-shells "Sign-in flows stay
/// in the shell"), the rule of the Android app's `SignInFlow.kt`.
///
/// The server's own origin always stays. Another origin stays only inside a sign-in flow:
/// a flow starts when a navigation on the server's origin is answered with an HTTP redirect
/// to another origin (a login wall in front of the server, or the server's own single
/// sign-on start route), because the server itself never redirects away for anything else.
/// While the flow is active, redirects to any origin, pages of origins the flow already
/// visited (the identity provider's own forms and pages) and navigations no person started
/// (a provider's script or auto-submitted form) stay too; a link the person taps to a site
/// the flow has not visited opens in the system browser. The flow ends when a navigation
/// reaches the server's origin again or the person leaves it; `timeout` after its last
/// navigation it stops leading anywhere new (only the origins it visited still stay).
///
/// No WebKit types, so the rule is unit tested on its own.
final class SignInFlow {
    enum Decision { case stay, browser }

    /// A sign-in flow with no navigation for this long is over (typing a password and a code fits).
    static let timeout: TimeInterval = 15 * 60

    private let server: String
    private let clock: () -> Date
    private let timeout: TimeInterval
    /// The origin of the page the next navigation starts from (or the one being redirected).
    private var current: String
    private var active = false
    private var lastAt = Date.distantPast
    private var visited = Set<String>()

    init(server: URL, timeout: TimeInterval = SignInFlow.timeout, clock: @escaping () -> Date = Date.init) {
        self.server = Self.originOf(server) ?? ""
        self.current = self.server
        self.timeout = timeout
        self.clock = clock
    }

    /// True while a sign-in flow is running (a foreign page that belongs to it may be showing).
    var inSignIn: Bool { expire(); return active }

    /// A main-frame navigation to `url`. `isRedirect`: an HTTP redirect of the navigation in
    /// progress; `hasGesture`: the person started it (a tap on a link).
    func decide(_ url: URL, isRedirect: Bool, hasGesture: Bool) -> Decision {
        guard let to = Self.originOf(url) else { return .browser }
        expire()
        if to == server {
            end()
            current = server
            return .stay
        }
        // After the timeout, a person still on the flow's pages can keep using them (a form sent
        // late), but nothing leads to a new origin any more.
        let withinVisited = visited.contains(current) && visited.contains(to)
        let stays: Bool
        if isRedirect { stays = current == server || active || withinVisited }
        else if active { stays = !hasGesture || visited.contains(to) }
        else { stays = withinVisited }
        guard stays else { return .browser }
        if active || current == server {
            active = true
            lastAt = clock()
        }
        visited.insert(to)
        current = to
        return .stay
    }

    /// A page of `url` started loading in the main frame (also after back and a load of the server).
    func started(_ url: URL) {
        guard let o = Self.originOf(url) else { return }
        current = o
        if o == server { end() } else if active { lastAt = clock() }
    }

    /// The person left the flow (the bar's close button): the next foreign page needs a new flow.
    func end() {
        active = false
        visited.removeAll()
    }

    /// Past the timeout the flow is no longer active; its visited origins stay until it ends.
    private func expire() {
        if active && clock().timeIntervalSince(lastAt) > timeout { active = false }
    }

    /// `scheme://host:port` for http(s) only (`Origin.signature`); nil for anything else.
    static func originOf(_ url: URL) -> String? {
        let scheme = (url.scheme ?? "").lowercased()
        guard scheme == "https" || scheme == "http", let host = url.host, !host.isEmpty else { return nil }
        return Origin.signature(url)
    }

    /// The host to show for `url`: no scheme, path or default port.
    static func hostOf(_ url: URL) -> String {
        guard originOf(url) != nil else { return "" }
        return Origin.pageOrigin(url).components(separatedBy: "://").last ?? ""
    }
}
