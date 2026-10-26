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
        if share { caps += ["share", "links"] }
        if biometric { caps.append("biometric") }
        return caps
    }

    static func available() -> Bool {
        NSClassFromString("WKScriptMessageHandlerWithReply") != nil
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
            if Self.safeExternal(url) { actions.bridgedOpenExternal(url) }
            reply(nil, nil)
        default:
            reply(nil, "unknown_method")
        }
    }

    static func safeExternal(_ url: String) -> Bool {
        guard let scheme = URLComponents(string: url)?.scheme?.lowercased() else { return false }
        return ["https", "http", "mailto", "tel"].contains(scheme)
    }

    /// The page side. The origin guard is repeated here because user scripts reach every
    /// page the web view opens; the message handler checks the origin again.
    static func script(origin: URL, app: String, capabilities: [String]) -> String {
        let caps = capabilities.map { "\"\($0)\"" }.joined(separator: ", ")
        return """
        (function () {
          if (location.origin !== "\(Origin.pageOrigin(origin))") return;
          var h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.\(handlerName);
          if (!h || window.opentodoShell) return;
          function call(m, a) { return h.postMessage({ m: m, a: a || [] }) }
          window.opentodoShell = Object.freeze({
            bridge: \(version), platform: 'ios', app: "\(app)",
            capabilities: Object.freeze([\(caps)]),
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
