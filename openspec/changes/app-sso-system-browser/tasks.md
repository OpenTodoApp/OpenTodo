## 1. Server

- [x] 1.1 App parameters on the start route (`app_challenge`, `app_state`), kept in the signed flow state; an app flow never links. Verified by `TestOIDCAppFlowRefusals` (malformed parameters).
- [x] 1.2 In-memory hand-off store: single use, two minutes, bound to the challenge, bounded. Verified by `go test ./internal/oidc -run Handoff`.
- [x] 1.3 Callback of an app flow: hand the identity over to `opentodo://sso` with a code, or an error code. Verified by `TestOIDCAppFlowSignsInTheWebView` and `TestOIDCAppFlowRefusals`.
- [x] 1.4 `POST /api/v1/auth/oidc/app-session`: verifier, same-origin check, sign-in or link with the callback's rules. Verified by `TestOIDCAppFlowSignsInTheWebView`, `TestOIDCAppFlowRefusals`, `TestOIDCAppFlowLinksFromASignedInWebView`, `TestRouteMatrix`.
- [x] 1.5 `app_sso` in the health answer; API reference, OpenAPI description and v1 surface. Verified by `TestHealth*`, `TestEveryRouteIsInTheAPIDoc`, `TestOpenAPIDescription`, `TestV1SurfaceIsAdditive`; `go test ./...`.

## 2. iPhone

- [x] 2.1 `SystemSignIn` rules (start route, PKCE, callback, redeem script, health flag). Verified by `SystemSignInTests` in `make ios`.
- [x] 2.2 `ShellController` opens the start route in `ASWebAuthenticationSession` when the server announces it, else in the web view; redeems the code from the server's page. Verified by `make ios` (unit tests and the unsigned Release build).
- [ ] 2.3 By hand on an iPhone or simulator against a server with Google: sign-in, linking from Settings, closing the sheet, and an older server (no `app_sso`) keeping the web view.

## 3. Android

- [x] 3.1 `SystemSignIn` rules. Verified by `SystemSignInTest` in `make android`.
- [x] 3.2 `MainActivity` opens the start route in a Custom Tab when the server announces it, else in the web view; `opentodo://sso` intent filter; the pending verifier survives process death. Verified by `make android` (unit tests, lint, debug APK).
- [ ] 3.3 By hand on an Android device against a server with Google: sign-in, linking from Settings, closing the tab, and the app killed while the tab is in front.

## 4. Docs

- [x] 4.1 `docs/self-hosting/sso.md`, `docs/ios-app.md`, `docs/android-app.md`, `docs/api.md`; `make docs-check`.
- [x] 4.2 Changelog fragment `changelog.d/Fixed/app-sso-system-browser.md`.
