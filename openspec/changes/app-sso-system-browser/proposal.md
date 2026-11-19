# Single sign-on in the system browser for the Android and iPhone apps

## Why

Issue #1553. The apps keep OpenTodo's own single sign-on in their web view (`android-sign-in-flows`, `ios-shell`). Identity providers that refuse sign-in in an embedded web view break it: Google answers "Error 403: disallowed_useragent" or ends up in the system browser, where the session lands outside the app, so the app stays signed out. Google Workspace is the only identity provider of many small teams, so for them the button never works in the apps, and the documented fallback (a password or a passkey) defeats the point of single sign-on. `android-sign-in-flows` named this as its follow-up: "Custom Tabs with a one-time code hand-over".

## What Changes

- **The apps run the provider step in the system browser.** When the person taps "Sign in with …" (the server's start route) in the Android or iPhone app, and the server announces it, the app opens the start route in the system's authentication sheet (`ASWebAuthenticationSession` on iPhone, a Custom Tab on Android) with a PKCE challenge and a state of its own. The sheet shares the browser's cookies, so a provider session there is reused.
- **The server hands the result back with a single-use code.** For such a flow the callback verifies the identity as usual but signs nothing in: it sends the browser to `opentodo://sso` with a code that is valid for two minutes, bound to the app's challenge, and kept in memory only, or with an error code when the provider refused.
- **The web view redeems the code.** The app checks the state and, from a page of the server in its web view, posts the code and its verifier to `POST /api/v1/auth/oidc/app-session`. The server then finishes exactly as the callback of a flow run in that web view would: without a session there it signs in (provisioning, linking by verified email and every refusal unchanged); with one it links the identity to that account under the same freshness rule. A wrong verifier spends the code; a request from another site is refused.
- **Older servers keep working.** `GET /api/v1/health` gains `"app_sso": true`; without it the apps keep the provider's pages in the web view as today.
- Docs: the single sign-on guide, the Android and iPhone app guides, the API reference; changelog `### Fixed`.

## Out of scope

- Login walls in front of the server (Pangolin, Authelia, Cloudflare Access): they stay in the web view (`android-sign-in-flows`). A wall that itself signs in with Google still refuses the web view; its documented fallback (a bypass for the app's paths) is unchanged.
- Provider sign-out from the apps.
- The paused native app (`mobile/app`), which already signs in through the system browser (`native-app-foundation` D5).
- The desktop shell.

## Roadmap

Fix for the apps (ROADMAP "native-shells", `ios-shell`); no new roadmap item.

## Capabilities

### New Capabilities

### Modified Capabilities
- `native-shells`: OpenTodo's own single sign-on runs in the system browser on servers that announce it; login walls stay in the web view.
- `oidc-login`: an app flow that hands the verified identity to the app with a single-use code, and the route that redeems it.

## Impact

Server: `internal/oidc` (two optional fields in the signed flow state, an in-memory hand-off store), `internal/httpapi/oidc.go` (start and callback branches, one new public route), the health answer, docs/api.md, the OpenAPI description and the v1 surface (additive). Android: `SystemSignIn.kt` (new), `MainActivity.kt`, one intent filter; no new dependency or permission (the Custom Tab is asked for with its intent extra, without the AndroidX browser library). iPhone: `SignInFlow.swift`, `ShellView.swift` (`AuthenticationServices`, part of iOS). No op log, data model, web app or environment variable change. **Not breaking.**
