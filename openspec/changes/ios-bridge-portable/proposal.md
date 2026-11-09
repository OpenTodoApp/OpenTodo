# Proposal

## Why

The iPhone app from the App Store (1.2.0, and TestFlight 1.3.0 build 10300) never gets the bridge. Its Today widget stays at "0 today / Open OpenTodo to fill this widget", Settings → Notifications says the browser cannot receive push notifications, reminders are never scheduled on the phone, and a share sheet hand-over with files does not arrive. The web page behaves as in a browser because `window.opentodoShell` does not exist.

The cause is the build, not the server. The portable build declares `WKAppBoundDomains` with a placeholder host (`none.invalid`). WebKit's App-Bound Domains rules apply as soon as the key is present: on every page outside the listed domains, user scripts, `evaluateJavaScript` and script message handlers are denied (WebKit, "App-Bound Domains", 2020). The bridge is a document-start user script plus a message handler, so on any real server it silently does not exist. ios-shell design D2 had already rejected "app-bound domains always on, with a placeholder"; the implementation shipped the placeholder anyway.

## What Changes

- The portable build (the one in TestFlight and the App Store) declares no `WKAppBoundDomains` key at all. The key is added only to the one-server build, by a build phase, when `OPENTODO_APP_BOUND_HOST` names a host (up to ten, comma separated). The setting's default becomes empty instead of `none.invalid`.
- The one-server build keeps its offline start (ios-shell D2); nothing else in the portable build changes.
- The bridge's page-side origin guard leaves out only the scheme's own default port, like `location.origin` (`https://host:80` kept its port wrongly dropped before).
- A test on the simulator loads a page from a server on an ordinary host in the real shell and checks that the page sees `window.opentodoShell` and the message handler; another checks the portable build's bundle has no `WKAppBoundDomains`.
- No server, web app or op-log change. Not **BREAKING**. Users get the fix with a new App Store build.

Out of scope: a service worker for the portable build (iOS gives it only to app-bound domains), APNs push, any change to the bridge contract.

Roadmap: a fix to `ios-shell` and `ios-distribution` (the iPhone app in TestFlight and the App Store).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: the iOS bridge exists on every server the portable build opens; only a one-server build declares app-bound domains.
