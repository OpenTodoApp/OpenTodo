## ADDED Requirements

### Requirement: The server's own single sign-on runs in the system browser
When the person starts the server's own single sign-on in a shell (a main-frame navigation to the server's start route) and the server's health answer announces `app_sso`, the shell SHALL NOT load the start route in its web view. It SHALL open the start route in the system's authentication sheet (`ASWebAuthenticationSession` on iOS, a Custom Tab on Android, or the browser where there is none) with a PKCE S256 challenge and a state of its own, and SHALL accept only the return to `opentodo://sso` carrying that state. With a code, the shell SHALL redeem it with its verifier from a page of the server in its web view, so the session belongs to the web view, and SHALL then show where the server's answer leads; with an error code, it SHALL show the sign-in screen with that code; when the sheet is closed, the screen SHALL stay as it was. A return the shell did not start, or with another state, SHALL change nothing. The verifier SHALL never leave the app, and SHALL survive the shell's process being stopped while the sheet is in front. Login walls in front of the server SHALL keep running in the web view.

#### Scenario: Google sign-in in the app
- **WHEN** the server signs in with Google and the person taps "Sign in with Google" in the Android or iPhone app
- **THEN** Google's page opens in the system's authentication sheet, and once the person chooses an account the sheet closes and the web app opens signed in, in the app

#### Scenario: Linking from Settings in the app
- **WHEN** a signed-in person links the provider from Settings → Account → Security in the app, within ten minutes of signing in
- **THEN** the provider's page opens in the sheet, and on return the identity is linked to the account signed in in the app, not to any session the system browser has

#### Scenario: Sheet closed
- **WHEN** the person closes the sheet before finishing
- **THEN** the app stays on the sign-in screen, signed out, and nothing opens in the system browser

#### Scenario: Provider refuses
- **WHEN** the provider refuses the sign-in in the sheet
- **THEN** the sheet closes and the app shows the sign-in screen with the error

#### Scenario: Forged return
- **WHEN** another app or a web page opens `opentodo://sso?code=…&state=…` with a code of its own
- **THEN** the app redeems nothing and stays as it was

#### Scenario: Older server
- **WHEN** the server's health answer does not announce `app_sso`
- **THEN** the start route loads in the web view, as in "Sign-in flows stay in the shell"

## MODIFIED Requirements

### Requirement: Sign-in flows stay in the shell
A shell SHALL keep a sign-in flow in its web view: when a navigation on the server's origin is answered with an HTTP redirect to another origin (a login wall in front of the server, or the server's own single sign-on start route on a server that does not announce single sign-on in the system browser), the shell SHALL follow it in the web view, together with the redirects that follow, the pages and form submissions of the origins the flow has visited, and navigations the person did not start. The flow SHALL end when a navigation reaches the server's origin or when the person leaves it; 15 minutes after its last navigation it SHALL stop leading to origins it has not visited. A redirect the shell does not follow SHALL NOT open the system browser and SHALL NOT leave an empty screen: the shell SHALL say that signing in did not continue and offer to sign in again from the server's address. A link the person opens to an origin the flow has not visited, and every link to another origin outside a flow, SHALL open in the system browser. While a page of another origin fills the web view, the shell SHALL show that page's host and a control that returns to the server; back SHALL return to the server when a page of the server came before, and the sign-in pages SHALL NOT stay in the back history once the flow reaches the server. Cookies the flow sets SHALL be kept across restarts of the app. The background run SHALL never follow a navigation off the server's origin and SHALL never open a browser; an expired login-wall session SHALL make it end without effect.

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
- **WHEN** the person taps "Sign in with" the server's identity provider in the Android app, and the server's health answer does not announce `app_sso`
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
- **WHEN** a login wall in front of the server signs in with an identity provider that refuses embedded web views
- **THEN** its error page shows in the app with the way back to the server, and the documentation names the fallbacks (a password or passkey, or a bypass at the wall)
