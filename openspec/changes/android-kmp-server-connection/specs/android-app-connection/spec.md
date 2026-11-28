# android-app-connection Specification

## Purpose

Connect the native Android app to an OpenTodo server using the official app's PKCE authentication flow.

## Requirements

### Requirement: Get started server connection

The shared app SHALL present a first-run screen where a user enters a server URL and starts a connection. The shared flow SHALL reject malformed URLs and URLs containing user info, query parameters or fragments. It SHALL allow HTTPS servers and local-only HTTP addresses, check `GET /api/v1/health` (falling back to `/healthz` when unavailable), and require `app_sign_in: true` before starting authentication. Android and iOS SHALL use this same screen and flow and show invalid-address, connection, and unsupported-server errors.

#### Scenario: Supported server
- **WHEN** the user enters a reachable OpenTodo server that reports `app_sign_in: true`
- **THEN** the app starts the native sign-in flow for that server

#### Scenario: Unsupported or unreachable server
- **WHEN** health checking fails, the server is unhealthy, or `app_sign_in` is false
- **THEN** the app shows a useful error and does not start sign-in

### Requirement: Native app sign-in

The shared flow SHALL create the PKCE verifier, S256 challenge, and unpredictable state. Android SHALL open `/app/sign-in` in a system Custom Tab; iOS SHALL use `ASWebAuthenticationSession`. Both SHALL verify the returned state before exchanging an authorization code at `POST /api/v1/app/token`. Android SHALL forward its `opentodo://signed-in` callback to shared code; iOS SHALL deliver the system authentication callback to the same flow. Both SHALL report denial, invalid callbacks, expired codes, and exchange failures without treating the user as connected. Platform HTTP clients SHALL not follow redirects.

#### Scenario: Sign-in completes
- **WHEN** the server returns a callback code with the matching state and the token exchange succeeds
- **THEN** the app stores the token pair securely and shows the connected server

#### Scenario: Callback denied or invalid
- **WHEN** the callback is denied, has a mismatched state, or the code exchange fails
- **THEN** the app keeps the user disconnected and explains that sign-in did not complete

### Requirement: Protect app credentials

The app SHALL encrypt app access and refresh tokens using Android Keystore or iOS Keychain before persisting them. It SHALL not log tokens, authorization codes, PKCE verifiers, or callback URLs. The server URL may be stored without credentials.

#### Scenario: App restarts after sign-in
- **WHEN** the app is restarted after a successful connection
- **THEN** it can identify the connected server and recover its token pair only through the platform's secure storage

#### Scenario: Same shared connection experience on iOS
- **WHEN** a user enters a supported server address in the iOS app and completes sign-in
- **THEN** the shared flow validates the address, handles the callback, stores the tokens in Keychain, and shows the connected server

