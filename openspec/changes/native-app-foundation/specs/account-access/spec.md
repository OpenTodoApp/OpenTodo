## ADDED Requirements

### Requirement: App sign-in through the system browser
The server SHALL let the OpenTodo app sign in through the system's authentication sheet with an authorization code and PKCE (S256). `GET /app/sign-in` SHALL require a session, redirecting to sign-in first when there is none, and SHALL ask the user to confirm signing in the app on the named device. On confirmation it SHALL redirect to `opentodo://signed-in` with a single-use code that expires after 60 seconds and is bound to the challenge and `state`. `POST /api/v1/app/token` SHALL exchange the code and verifier for an access token valid for one hour and a refresh token. The same route SHALL exchange a refresh token for a new pair, rotating the refresh token on every use and revoking the grant when a used refresh token is presented again. The token route SHALL be rate limited and refused on a demo instance. App tokens SHALL carry the `app` scope, which is accepted wherever a `full` token is, and refused like a `full` token on credential and administration routes. App sign-in SHALL NOT depend on the owner's MCP switch.

Errors of `POST /api/v1/app/token`:

| Error | When |
|---|---|
| 400 `invalid_grant` | the code is unknown, used, expired, or does not match the verifier or the `state`; or the refresh token is unknown, revoked or reused |
| 400 `invalid_request` | a required field is missing or malformed |
| 403 `demo_restricted` | the server is a demo instance |
| 429 `rate_limited` | too many exchanges from this address |

#### Scenario: Signed in on the web already
- **WHEN** the user has a browser session and starts sign-in in the app
- **THEN** the sheet shows only the confirmation, and after Confirm the app holds an app token without the password being typed again

#### Scenario: Sign-in with a passkey
- **WHEN** the user has no session and signs in with a passkey in the sheet
- **THEN** the passkey ceremony runs as on the web, and the app receives its code after the confirmation

#### Scenario: Intercepted code
- **WHEN** another app receives the redirect and presents the code without the verifier
- **THEN** the response is 400 `invalid_grant`, no token is issued, and the code can no longer be used

#### Scenario: Not signed in at the confirmation
- **WHEN** `/app/sign-in` is opened without a session
- **THEN** the server shows its sign-in page and returns to the confirmation afterwards

#### Scenario: Reused refresh token
- **WHEN** a refresh token that was already exchanged is presented again
- **THEN** the response is 400 `invalid_grant` and every token of that grant stops working

#### Scenario: Administration route with an app token
- **WHEN** the app calls a route that requires an `admin` token or a recent session
- **THEN** the response is the same refusal a `full` token receives

### Requirement: App sessions alongside other sessions
App grants SHALL be listed with the user's sessions, showing "OpenTodo app", the device name sent at sign-in and the time of last use. Revoking one, signing out in the app, signing out everywhere, a password change or deactivation SHALL end the grant, and its tokens SHALL be refused from the next request. Signing out in the app SHALL revoke its grant on the server when online, and on the next connection otherwise.

#### Scenario: Revoke from the web
- **WHEN** the user revokes "OpenTodo app · iPhone" in the sessions list
- **THEN** the app's next request is refused with 401 and the app returns to its server screen, keeping no account data

#### Scenario: Sign out everywhere
- **WHEN** the user chooses Sign out everywhere on the web
- **THEN** the app's grant is revoked with the other sessions
