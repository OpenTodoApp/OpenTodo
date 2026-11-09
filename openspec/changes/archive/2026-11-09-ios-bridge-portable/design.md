# Design

## Context

Reported on the App Store build 1.2.0 and TestFlight 1.3.0 (10300): the Today widget never fills and Settings → Notifications shows the web-push text. Both mean `web/src/lib/shell.ts` finds no `window.opentodoShell`, so the web app never calls `publishWidget` or `scheduleReminders`.

Two causes were tested:

- **A. App-Bound Domains.** `Info.plist` declared `WKAppBoundDomains = [$(OPENTODO_APP_BOUND_HOST)]`, `none.invalid` in the portable build. WebKit ("App-Bound Domains", webkit.org, 2020): once an app declares the key, "JavaScript injection, custom style sheets, cookie manipulation, and message handler use is denied" in every web view by default; a view with `limitsNavigationsToAppBoundDomains` gets them back, but only on app-bound pages; a view without the flag can navigate anywhere but cannot use them. `addUserScript`, `evaluateJavaScript` and `window.webkit.messageHandlers` are named. The bridge is a document-start `WKUserScript` and a `WKScriptMessageHandlerWithReply`; the share hand-over uses `evaluateJavaScript`.
- **B. Origin mismatch.** The injected script returns unless `location.origin` equals `Origin.pageOrigin(configured)`. `ServerAddress` already normalises scheme and host case, a trailing dot, brackets and the scheme's default port, and a redirect to another origin is never followed in the web view (the navigation delegate sends it to the system browser), so a normal address matches. One real defect: `pageOrigin` dropped port 443 or 80 whatever the scheme, so `https://host:80` never matched.

`BridgeOnAServerTests` decides between them on the simulator: it serves a page from the test process on the Mac's own network address, loads it in the real `ShellController`, and the page's own script reports `typeof window.opentodoShell` and the message handler with a request to its server, so the answer does not depend on the APIs under suspicion. The first version served on `127.0.0.1` and passed with the placeholder key: WebKit treats localhost and loopback addresses as app-bound whatever the app declares (`shouldTreatURLProtocolAsAppBound` in `WebPageProxy.cpp`), which is also why every local check (ios-shell's measurements on `localhost`, the walkthrough on `127.0.0.1`) saw a working bridge. On an ordinary address (`http://192.168.64.7:…` on the CI runner), with the placeholder key, the page reported `origin` equal to the configured one and `shell=undefined`: the document-start user script never ran, though the handler's name was still listed on `window.webkit.messageHandlers`. That rules out B for that address and proves A. Without the key the page reports `shell=object`, `platform=ios`.

## Decisions

**D1. The portable build declares no `WKAppBoundDomains`.** This is what ios-shell D2 decided and the implementation did not do: the plist and `project.yml` carried the key with a placeholder, which turns the restrictions on for every server. The key is removed from both.

**D2. A build phase adds the key to a one-server build.** The last phase of the app target, "App-bound domains", deletes the key from the processed Info.plist and, when `OPENTODO_APP_BOUND_HOST` is not empty, writes one entry per comma-separated host (at most ten, Apple's limit; anything that is not a host name fails the build). It runs before signing, so the signature covers the result. The alternatives were worse: a second Info.plist drifts from the first; Info.plist preprocessing (`#ifdef`) is lost on the next `xcodegen generate` and is fragile with `//` in the plist. The phase edits a file it does not declare as an output, which the user-script sandbox forbids, so `ENABLE_USER_SCRIPT_SANDBOXING` is off for the app target only (the script is the project's own, a few lines, no input from outside the build settings). The one-server build behaves as before: `AppBoundDomains.limitsNavigation(to:)` is on for a listed host and the web app gets its service worker and offline start.

**D3. `pageOrigin` drops only the scheme's own default port**, as `location.origin` does. Pinned by `OriginTests` for every shape of address the first-run screen accepts.

## Risks

- A one-server build is now produced by a build phase rather than by the plist alone. `AppBoundDomainsTests` covers the portable side on every iOS CI run; the one-server side is checked by hand as in ios-shell task 1.5.
- Users on 1.2.0 keep the bug until the next App Store build.

## Impact

No server, web app, op or dependency change. App size unchanged.
