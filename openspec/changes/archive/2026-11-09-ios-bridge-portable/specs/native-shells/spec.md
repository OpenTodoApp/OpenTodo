## ADDED Requirements

### Requirement: The iOS bridge exists on every server
The iOS app's bridge (`window.opentodoShell` and its message handler) SHALL exist on the pages of the configured server's origin in every build, whatever that server's host. The portable build, which is the one published through TestFlight and the App Store, SHALL NOT declare `WKAppBoundDomains`, not even a placeholder, because WebKit denies user scripts, `evaluateJavaScript` and message handlers outside the declared domains as soon as the key is present. Only a one-server build SHALL declare app-bound domains, and only the hosts its builder names. The page-side origin check SHALL compare against what `location.origin` prints, which leaves out only the scheme's own default port. The iOS tests SHALL load a page from a server on an ordinary host in the real shell and check that the page sees the bridge.

#### Scenario: Widget and reminders on a self-hosted server
- **WHEN** a person installs the App Store build, connects it to `https://todo.example.com` and signs in
- **THEN** the page sees `window.opentodoShell` with `platform: "ios"`, the Today widget shows that day's tasks, and Settings offers the phone's reminders instead of the browser's push text

#### Scenario: The portable build declares no app-bound domain
- **WHEN** the app is built without `OPENTODO_APP_BOUND_HOST`
- **THEN** its Info.plist has no `WKAppBoundDomains` key and no navigation is limited to app-bound domains

#### Scenario: One-server build
- **WHEN** the app is built with `OPENTODO_APP_BOUND_HOST=todo.example.com` and connected to `https://todo.example.com`
- **THEN** its Info.plist lists that host, the web view limits navigation to it, the bridge exists, and the app starts offline from the precache after one online start

#### Scenario: A port that is not the scheme's default
- **WHEN** the configured server is `https://todo.example.com:80`
- **THEN** the bridge's origin check expects `https://todo.example.com:80`, the origin the page reports, and the bridge exists
