import Foundation
import WebKit

/// What the bridge needs from the app: prompts, the biometric store, the system browser.
@MainActor
protocol BridgeActions: AnyObject {
    func bridgedScheduleReminders(_ json: String) async -> String
    func bridgedTestNotification() async -> Bool
    func bridgedPublishWidget(_ json: String)
    func bridgedBiometricStore(_ keyB64: String) async -> Bool
    func bridgedBiometricRead() async -> String?
    func bridgedBiometricForget()
    func bridgedOpenExternal(_ url: String)
}

/// The bridge, version 1 (native-shells D5): a document-start script that defines
/// `window.opentodoShell` on the configured origin only, and one message handler that
/// answers it. Every method is optional for the web app, and the shape is the Android
/// app's, so `web/src/lib/shell.ts` needs no change.
@MainActor
final class Bridge: NSObject, WKScriptMessageHandlerWithReply {
    static let version = 1
    static let handlerName = "opentodoNative"
    static let maxMessage = 2 * 1024 * 1024

    private let origin: URL
    /// Strong: the host holds nothing back, and the message handler outlives every call.
    private let actions: BridgeActions

    init(origin: URL, actions: BridgeActions) {
        self.origin = origin
        self.actions = actions
    }

    /// The capabilities this shell offers, in the contract's names.
    static func capabilities(biometric: Bool, share: Bool) -> [String] {
        var caps = ["reminders", "widgets"]
        if share { caps += ["share", "links", "obsidian-links"] }
        if biometric { caps.append("biometric") }
        return caps
    }

    func install(into controller: WKUserContentController, app: String, capabilities: [String]) {
        controller.addScriptMessageHandler(self, contentWorld: .page, name: Self.handlerName)
        controller.addUserScript(WKUserScript(source: Self.script(origin: origin, app: app, capabilities: capabilities),
                                              injectionTime: .atDocumentStart,
                                              forMainFrameOnly: true))
    }

    nonisolated func userContentController(_ controller: WKUserContentController,
                                           didReceive message: WKScriptMessage,
                                           replyHandler: @escaping (Any?, String?) -> Void) {
        MainActor.assumeIsolated {
            let frameOrigin = message.frameInfo.securityOrigin
            let sent = Origin.signature(scheme: frameOrigin.protocol, host: frameOrigin.host, port: frameOrigin.port)
            guard message.name == Self.handlerName,
                  !frameOrigin.host.isEmpty,
                  sent == Origin.signature(origin),
                  message.frameInfo.isMainFrame,
                  let body = message.body as? [String: Any],
                  let method = body["m"] as? String
            else { return replyHandler(nil, "refused") }
            let args = (body["a"] as? [Any]) ?? []
            if let first = args.first as? String, first.utf8.count > Self.maxMessage { return replyHandler(nil, "too_large") }
            handle(method: method, args: args, reply: replyHandler)
        }
    }

    private func handle(method: String, args: [Any], reply: @escaping (Any?, String?) -> Void) {
        let string = { (i: Int) -> String in (args.count > i ? args[i] as? String : nil) ?? "" }
        let answer = { (value: Any?) in MainActor.assumeIsolated { reply(value, nil) } }
        switch method {
        case "scheduleReminders":
            let json = string(0)
            Task { @MainActor in answer(await actions.bridgedScheduleReminders(json)) }
        case "testNotification":
            Task { @MainActor in answer(await actions.bridgedTestNotification()) }
        case "publishWidget":
            actions.bridgedPublishWidget(string(0))
            reply(nil, nil)
        case "biometricStore":
            let key = string(0)
            Task { @MainActor in answer(await actions.bridgedBiometricStore(key)) }
        case "biometricRead":
            Task { @MainActor in answer(await actions.bridgedBiometricRead()) }
        case "biometricForget":
            actions.bridgedBiometricForget()
            reply(nil, nil)
        case "openExternal":
            let url = string(0)
            if Self.externalLink(url) { actions.bridgedOpenExternal(url) }
            reply(nil, nil)
        default:
            reply(nil, "unknown_method")
        }
    }

    static func safeExternal(_ url: String) -> Bool {
        guard let scheme = URLComponents(string: url)?.scheme?.lowercased() else { return false }
        return ["https", "http", "mailto", "tel"].contains(scheme)
    }

    /// What the bridge's openExternal hands to the system: `safeExternal`, or an Obsidian
    /// note link of the one accepted shape (obsidian-origin, capability `obsidian-links`).
    /// Navigation of the web view never opens an Obsidian link: only this method does.
    static func externalLink(_ url: String) -> Bool {
        safeExternal(url) || obsidianNote(url)
    }

    /// An Obsidian note link (obsidian-origin D2): `obsidian://open?` then exactly `vault`
    /// (1–255 characters) and `file` (1–1024, not starting with "/") once each, at most
    /// 2048 bytes. Every other Obsidian action can write or run something, and `path=`
    /// opens any file. The rule of internal/origin/obsidian.go and web/src/lib/taskOrigin.ts,
    /// pinned by the bridge fixture external-links.json.
    static func obsidianNote(_ url: String) -> Bool {
        let prefix = "obsidian://open?"
        guard url.hasPrefix(prefix), url.utf8.count <= 2048 else { return false }
        let parts = url.utf8.dropFirst(prefix.utf8.count).split(separator: UInt8(ascii: "&"), omittingEmptySubsequences: false)
        guard parts.count == 2 else { return false }
        var seen = Set<[UInt8]>()
        for part in parts {
            guard let eq = part.firstIndex(of: UInt8(ascii: "=")) else { return false }
            let name = Array(part[part.startIndex..<eq])
            guard seen.insert(name).inserted, let value = obsidianValue(Array(part[part.index(after: eq)...])) else { return false }
            let n = value.unicodeScalars.count
            switch String(decoding: name, as: UTF8.self) {
            case "vault": if n < 1 || n > 255 { return false }
            case "file": if n < 1 || n > 1024 || value.hasPrefix("/") { return false }
            default: return false
            }
        }
        return true
    }

    private static let obsidianValueBytes = Set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~!$'()*,;:@/%".utf8)

    /// Percent-decodes one value: only the allowed characters, well-formed escapes, valid UTF-8, no control characters.
    private static func obsidianValue(_ raw: [UInt8]) -> String? {
        var bytes: [UInt8] = []
        var i = 0
        while i < raw.count {
            let c = raw[i]
            guard obsidianValueBytes.contains(c) else { return nil }
            if c == UInt8(ascii: "%") {
                guard i + 2 < raw.count, let hi = hexDigit(raw[i + 1]), let lo = hexDigit(raw[i + 2]) else { return nil }
                bytes.append(hi << 4 | lo)
                i += 3
            } else {
                bytes.append(c)
                i += 1
            }
        }
        guard let text = String(bytes: bytes, encoding: .utf8) else { return nil }
        for s in text.unicodeScalars where s.value < 0x20 || (0x7f...0x9f).contains(s.value) { return nil }
        return text
    }

    private static func hexDigit(_ c: UInt8) -> UInt8? {
        switch c {
        case 48...57: return c - 48
        case 65...70: return c - 55
        case 97...102: return c - 87
        default: return nil
        }
    }

    /// The page side. The origin guard is repeated here because user scripts reach every
    /// page the web view opens; the message handler checks the origin again.
    static func script(origin: URL, app: String, capabilities: [String]) -> String {
        // Escaped as JavaScript literals, so a host or an app name cannot break out of its literal.
        let pageOrigin = JSON.jsString(Origin.pageOrigin(origin))
        let appLiteral = JSON.jsString(app)
        let caps = JSON.jsArray(capabilities)
        return """
        (function () {
          if (location.origin !== \(pageOrigin)) return;
          var h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.\(handlerName);
          if (!h || window.opentodoShell) return;
          function call(m, a) { return h.postMessage({ m: m, a: a || [] }) }
          window.opentodoShell = Object.freeze({
            bridge: \(version), platform: 'ios', app: \(appLiteral),
            capabilities: Object.freeze(\(caps)),
            scheduleReminders: function (json) { return call('scheduleReminders', [String(json)]) },
            testNotification: function () { return call('testNotification') },
            publishWidget: function (json) { call('publishWidget', [String(json)]) },
            biometricStore: function (key) { return call('biometricStore', [String(key)]) },
            biometricRead: function () { return call('biometricRead') },
            biometricForget: function () { call('biometricForget') },
            openExternal: function (url) { call('openExternal', [String(url)]) }
          });
        })();
        """
    }
}
