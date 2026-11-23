import Foundation
import WebKit

/// "Use my location" (native-shells "Position for the web app"). WebKit answers a page's
/// request for the position itself, asking iOS for the app's location the first time, and
/// gives an app no say per origin. So a script runs at the start of every frame, before the
/// page's own: on any page other than the configured server's it replaces `navigator.geolocation`
/// with one that refuses at once, without a prompt, as the Android app refuses other origins.
/// With no server (the first-run sign-in sheet, the background run) every page is refused.
/// WebKit runs no app script in a frame's first empty document, so a page written to get
/// around this can still reach WebKit's geolocation that way (see the OpenSpec change
/// ios-web-location); WebKit gives a position only to a secure page.
enum WebLocation {
    /// The code WebKit's refusal carries (`GeolocationPositionError.PERMISSION_DENIED`).
    static let refused = 1

    static func script(allowing origin: URL?) -> String {
        let pageOrigin = origin.map { JSON.jsString(Origin.pageOrigin($0)) } ?? "null"
        return """
        (function () {
          var allowed = \(pageOrigin);
          if (allowed !== null && location.origin === allowed) return;
          function refuse(ok, fail) {
            if (typeof fail !== 'function') return;
            setTimeout(function () {
              fail({ code: \(refused), message: 'User denied Geolocation', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
            }, 0);
          }
          var none = Object.freeze({
            getCurrentPosition: refuse,
            watchPosition: function (ok, fail) { refuse(ok, fail); return 0; },
            clearWatch: function () {}
          });
          try { Object.defineProperty(Object.getPrototypeOf(navigator), 'geolocation', { get: function () { return none; }, configurable: false }); } catch (e) {}
          try { Object.defineProperty(navigator, 'geolocation', { get: function () { return none; }, configurable: false }); } catch (e) {}
        })();
        """
    }

    /// Before the web view is created, as the bridge: WebKit copies the configuration.
    static func install(into controller: WKUserContentController, allowing origin: URL?) {
        controller.addUserScript(WKUserScript(source: script(allowing: origin), injectionTime: .atDocumentStart,
                                              forMainFrameOnly: false, in: .page))
    }
}
