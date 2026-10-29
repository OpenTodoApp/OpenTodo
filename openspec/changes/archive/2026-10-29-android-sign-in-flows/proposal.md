# Android sign-in flows: login walls and single sign-on stay in the app

## Why

Issue #471. The Android app opens every main-frame navigation to another origin in the system browser. A login wall in front of the server (Pangolin with Pocket ID, Authelia, Authentik, Cloudflare Access, oauth2-proxy…) redirects the web view to its sign-in page on another origin, so the person signs in in the browser, the session cookie lands there, and the app stays outside the wall. OpenTodo's own single sign-on has the same problem: the start route redirects to the issuer, which opens in the browser, and the sign-in never reaches the app. On top of that, the first-run check gets the wall's redirect or page for `GET /healthz` and reports "not an OpenTodo server".

## What Changes

- **Sign-in flows stay in the web view.** When a navigation on the server's origin is answered with an HTTP redirect to another origin, the shell keeps that chain in the web view as a sign-in flow: redirects, the provider's own pages and forms, and navigations nobody tapped (a provider's script) stay; the flow ends when the chain returns to the server's origin or when the person leaves it, and after 15 minutes without a navigation it no longer leads to new origins. A redirect the shell refuses never opens the browser and never leaves a blank screen: an error says signing in did not continue, with **Sign in here**. A link the person taps to a site the flow has not visited still opens in the system browser, as does every link to another site outside a flow.
- **A site bar** above the web view shows the host of a page of another origin, since the web view has no address bar, with a close button (and back) that returns to the server.
- **The bridge stays off foreign pages.** Already restricted to the server's origin by the web message listener and the document-start script; the share hand-over script now also checks the origin before it runs.
- **First run behind a login wall.** A redirect of `/healthz` to a sign-in page, or a 401/403 sign-in page, is reported as a login wall with **Sign in here**, which opens the server in a sign-in screen (same navigation rule, no bridge) that closes itself once the health check passes with the web view's cookies. An HTML page instead of the health answer says it may be a login wall and offers the same. A wrong address keeps "not an OpenTodo server".
- **Cookies:** the web view's cookies are flushed to disk when the app pauses and when a page of the server finishes loading, so a wall's session survives a restart. The hidden background run never follows a wall's redirect and never opens anything.
- Docs: the Android app guide gets "Behind a login page", the reverse-proxy and single sign-on pages point to it, CHANGELOG `### Fixed`.

## Out of scope

- Custom Tabs with a one-time code hand-over, for identity providers that refuse embedded web views (Google returns `disallowed_useragent`). Those keep failing in the app; the docs say to sign in with a password or passkey or to let the wall bypass the app's paths. A follow-up.
- Provider sign-out (RP-initiated logout) from the app: the web app navigates to the provider's end-session address by script, which still opens in the system browser.
- A wall that sends the browser on with a script on the server's origin rather than an HTTP redirect (the flow only starts on a redirect).
- HTTP basic authentication in front of the server.
- An iOS or desktop shell.

## Roadmap

Fix for the Android app (ROADMAP "native-shells"); no new roadmap item.

## Capabilities

### New Capabilities

### Modified Capabilities
- `native-shells`: sign-in flows on other origins stay in the web view with a site bar; the first-run check recognises a login wall and signs in inside the app.

## Impact

`mobile/android` only: `SignInFlow.kt` (new, the navigation rule), `SignInActivity.kt` (new), `MainActivity.kt`, `HealthCheck.kt`, `SetupActivity.kt`, `HiddenRun.kt`, layouts, strings in six languages, unit and instrumented tests. No server, web app, op log or dependency change; no new permission. Docs: `docs/android-app.md`, `docs/self-hosting/docker.md`, `docs/self-hosting/sso.md`, `CHANGELOG.md`.
