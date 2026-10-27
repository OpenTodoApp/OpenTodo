## ADDED Requirements

### Requirement: Sign-in flows stay in the shell
A shell SHALL keep a sign-in flow in its web view: when a navigation on the server's origin is answered with an HTTP redirect to another origin (a login wall in front of the server, or the server's own single sign-on start route), the shell SHALL follow it in the web view, together with the redirects that follow, the pages and form submissions of the origins the flow has visited, and navigations the person did not start. The flow SHALL end when a navigation reaches the server's origin or when the person leaves it; 15 minutes after its last navigation it SHALL stop leading to origins it has not visited. A redirect the shell does not follow SHALL NOT open the system browser and SHALL NOT leave an empty screen: the shell SHALL say that signing in did not continue and offer to sign in again from the server's address. A link the person opens to an origin the flow has not visited, and every link to another origin outside a flow, SHALL open in the system browser. While a page of another origin fills the web view, the shell SHALL show that page's host and a control that returns to the server; back SHALL return to the server when a page of the server came before, and the sign-in pages SHALL NOT stay in the back history once the flow reaches the server. Cookies the flow sets SHALL be kept across restarts of the app. The background run SHALL never follow a navigation off the server's origin and SHALL never open a browser; an expired login-wall session SHALL make it end without effect.

#### Scenario: Server behind a login wall
- **WHEN** the server is behind a login wall whose sign-in page is on another origin, and the person opens the Android app
- **THEN** the wall's sign-in page shows in the app with its host named above it and without `window.opentodoShell`, and after signing in the web app opens with the bridge, and nothing opened in the system browser

#### Scenario: Health route bypassed, the app behind the wall
- **WHEN** the wall lets `/healthz` and `/api/*` through but guards the app's page, so the first-run check passes without signing in
- **THEN** opening the app shows the wall's sign-in page inside the app, and after signing in the web app opens; no browser opens and the screen is never left empty

#### Scenario: Sign-in that cannot continue
- **WHEN** a sign-in page, 15 minutes after the flow's last navigation, redirects to a site the flow has not visited
- **THEN** the shell neither follows it nor opens the browser, and shows that signing in did not continue with "Sign in here", which starts again from the server's address

#### Scenario: Single sign-on in the app
- **WHEN** the person taps "Sign in with" the server's identity provider in the Android app
- **THEN** the provider's sign-in page opens in the app and, once it sends the person back, the person is signed in to the web app in the app

#### Scenario: Leaving a sign-in page
- **WHEN** a sign-in page of another origin is showing and the person taps the close control or back
- **THEN** the app loads the server again and the flow is over

#### Scenario: Link on a sign-in page
- **WHEN** the person taps a link on the provider's page to a site the flow has not visited
- **THEN** that site opens in the system browser and the sign-in page stays

#### Scenario: Restart after signing in
- **WHEN** the person signed in through a login wall and the app is closed and opened again within the wall's session lifetime
- **THEN** the web app opens without the wall asking again

#### Scenario: Wall session expired in the background
- **WHEN** the hourly background run starts after the wall's session expired
- **THEN** it does not follow the redirect, opens nothing and ends; the next time the app is opened, the wall asks inside the app

#### Scenario: Provider refuses web views
- **WHEN** the identity provider refuses sign-in in an embedded web view
- **THEN** its error page shows in the app with the way back to the server, and the documentation names the fallbacks (a password or passkey, or a bypass at the wall)

## MODIFIED Requirements

### Requirement: A shell loads the user's server and nothing else
A native shell SHALL load the web app from the server address the user entered, over `https` (or `http` only for `localhost` and private network addresses, with a warning), in a full-screen web view that keeps the app's origin, cookies, local storage, IndexedDB and service worker, exactly like the installed web app. The shell SHALL open network connections only to that server (and, when the web app itself requests them, to the same origin), and, during a sign-in flow that server starts, to the sign-in pages it redirects to. It SHALL collect no usage data, include no analytics, crash-reporting or advertising library, and declare "no data collected" in every store listing. The shell SHALL NOT bundle a copy of the web app: the server serves the app version that matches it.

#### Scenario: Connections stay with the server
- **WHEN** the Android app is used for a session with the device's traffic inspected
- **THEN** every connection goes to the configured server's host and port, or to the sign-in pages of a sign-in flow the server started, and none to any other host

#### Scenario: Server upgraded
- **WHEN** the server is upgraded to a newer release and the Android app is opened
- **THEN** the app loads the new web app from the server without an app update, and the web app's own "Recovery after a server upgrade" behaviour applies

#### Scenario: Plain http to a public host
- **WHEN** the user enters `http://todo.example.com` on the first-run screen
- **THEN** the shell refuses it, explains that a secure address is needed and offers to try `https://todo.example.com`

#### Scenario: Private address over http
- **WHEN** the user enters `http://192.168.1.20:8080`
- **THEN** the shell accepts it after showing that the connection is not encrypted on the way to that address

### Requirement: First-run server screen
On first start, and whenever no server is configured, a shell SHALL show a screen asking for the server address with the device's language, SHALL check the address by requesting the server's health route with the web view's cookies for it, and SHALL name the reason when the check fails (no network, not an OpenTodo server, behind a login page, certificate not trusted, address refused). When the health route answers with a redirect to a sign-in page or with a sign-in page refusing access, the screen SHALL say the server is behind a login page and offer to sign in inside the app; when it answers with a web page, the screen SHALL say so and offer the same. Signing in SHALL use the shell's sign-in flow without the bridge and SHALL end, with the check repeated, once the health route answers. A trusted certificate the user installed on the device SHALL be accepted. The address SHALL be changeable later from the shell's own menu, and changing it SHALL discard the web view's storage for the old server only after the user confirms.

#### Scenario: Not an OpenTodo server
- **WHEN** the user enters `https://example.com`
- **THEN** the screen says the address does not answer as an OpenTodo server and keeps the address for editing

#### Scenario: Behind a login page
- **WHEN** the user enters the address of a server whose login wall redirects `/healthz` to its sign-in page
- **THEN** the screen says the server is behind a login page and offers "Sign in here"; after signing in there, the check passes and the app opens the server

#### Scenario: Self-signed certificate the user trusts
- **WHEN** the home server uses a certificate from a private authority installed in the device's user credentials
- **THEN** the shell accepts the connection, and a certificate the device does not trust is refused with an explanation, never silently accepted

#### Scenario: Change the server
- **WHEN** a signed-in user chooses "Change server" and confirms
- **THEN** the shell forgets the old server's storage, scheduled reminders and widget data, and shows the first-run screen

### Requirement: The bridge is optional and versioned
A shell SHALL expose a bridge object `window.opentodoShell` to pages of the configured server's origin only, carrying `bridge` (an integer version, 1 for this change), `platform` (`android`, `ios`, `desktop`), `app` (the shell's version string), `capabilities` (the names the shell implements) and the methods of that version. The web app SHALL use the bridge only when it is present and SHALL behave identically without it; a method a shell does not list in `capabilities` SHALL NOT be called. A shell with a lower bridge version than the web app expects SHALL still work for the capabilities both know, and the web app SHALL show a one-line notice in Settings when the shell is older than the server's minimum.

#### Scenario: Web app in a browser
- **WHEN** the web app runs in an ordinary browser tab
- **THEN** `window.opentodoShell` is undefined and every screen behaves as specified elsewhere

#### Scenario: Bridge on another origin
- **WHEN** the web view shows a page of another origin (a sign-in page during a sign-in flow)
- **THEN** that page has no `window.opentodoShell` and no script of the shell runs in it, and links to other sites outside a sign-in flow (an "Open in maps" link) open in the system browser instead of the web view

#### Scenario: Older shell
- **WHEN** a shell with `bridge: 1` and `capabilities: ["reminders", "share"]` loads a web app that also knows `widgets`
- **THEN** reminders and sharing work, no widget data is published, and Settings says the app is older than this server expects
