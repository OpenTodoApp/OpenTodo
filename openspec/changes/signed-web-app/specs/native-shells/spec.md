## MODIFIED Requirements

### Requirement: A shell loads the user's server and nothing else
A native shell SHALL load the web app from the server address the user entered, over `https` (or `http` only for `localhost` and private network addresses, with a warning), in a full-screen web view that keeps the app's origin, cookies, local storage and IndexedDB, exactly like the installed web app. Where a shell checks the web app's signature itself (the Android app), it SHALL serve the web app's files to its web view from its own verified copy instead of a service worker. The shell SHALL open network connections only to that server (and, when the web app itself requests them, to the same origin), and, during a sign-in flow that server starts, to the sign-in pages it redirects to. It SHALL collect no usage data, include no analytics, crash-reporting or advertising library, and declare "no data collected" in every store listing. The shell SHALL NOT bundle a copy of the web app: the server serves the app version that matches it.

#### Scenario: Connections stay with the server
- **WHEN** the Android app is used for a session with the device's traffic inspected
- **THEN** every connection goes to the configured server's host and port, or to the sign-in pages of a sign-in flow the server started, and none to any other host

#### Scenario: Server upgraded
- **WHEN** the server is upgraded to a newer signed release and the Android app is opened
- **THEN** the app verifies and loads the new web app from the server without an app update, and the web app's own "Recovery after a server upgrade" behaviour applies

#### Scenario: Plain http to a public host
- **WHEN** the user enters `http://todo.example.com` on the first-run screen
- **THEN** the shell refuses it, explains that a secure address is needed and offers to try `https://todo.example.com`

#### Scenario: Private address over http
- **WHEN** the user enters `http://192.168.1.20:8080`
- **THEN** the shell accepts it after showing that the connection is not encrypted on the way to that address

### Requirement: Offline start
Once the web app has been loaded once, a shell SHALL open offline and show the app with the local data, like the installed web app. The Android app SHALL open from its own verified copy, online or offline. On a self-built server, or where the origin cannot install a service worker (plain http other than localhost), it SHALL keep the same files itself after a successful load and open from that copy offline. Other shells open from the service worker's set. The first start SHALL need the network and SHALL say so when it is missing.

#### Scenario: Opened in flight mode
- **WHEN** the user has used the Android app before and opens it with no network
- **THEN** the Today list shows the locally stored tasks, and the sync indicator reads offline

#### Scenario: Server on the local network switched off
- **WHEN** the user has opened the Android app on `http://192.168.1.20:8080` and opens it again with that server switched off
- **THEN** the Today list shows the locally stored tasks, and the sync indicator reads offline

#### Scenario: First start offline
- **WHEN** the app is opened for the first time with no network
- **THEN** the first-run screen explains that the first start needs a connection, and retries when the network returns

## ADDED Requirements

### Requirement: The Android app checks the web app's signature
Once refusal is on (signed-web-app, "Report-only first, then refusal"), the Android app SHALL carry the trusted public keys in its own package. It SHALL serve every web app file to its web view only after checking it against a list signed by a trusted key, and SHALL apply the web app's rules for updates: install all at once, refuse unsigned or older versions, never move from signed back to self-built for a server. It SHALL refuse every service worker request in its web view. It SHALL show the signature state and the key's short fingerprint on its own native server screen, with a Verify action that opens the website in the system browser. A server whose list is missing or unsigned at first contact SHALL work as self-built and be shown as such. Offline, the app opens from its verified copy and checks nothing. No operation is written, so sync and convergence are unaffected.

#### Scenario: Tampered file from the server
- **WHEN** the Android app is in signed mode and the server serves a chunk that does not match the verified list
- **THEN** the web view does not receive the chunk, and the app keeps the version it has and shows the refusal message

#### Scenario: Signature state on the native screen
- **WHEN** the user opens the app's server screen while connected to an official server
- **THEN** it reads "Signed by OpenTodo" with the same short fingerprint the website publishes, drawn by the app and not by the web page

#### Scenario: Self-built server
- **WHEN** the Android app connects for the first time to a server that serves no signed list
- **THEN** the web app loads as before, and the server screen reads "Self-built: updates are not signature-checked"

