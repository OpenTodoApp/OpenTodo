# Cookie writes need an Origin, Fetch Metadata or a JSON body

## Why

The threat model (`docs/security/threat-model.md`, task 6.4 of `external-security-review`) notes that a write authenticated by the session cookie with no `Origin` header is accepted, relying on `SameSite=Lax` alone to keep the cookie off cross-site requests. A browser that ignores `SameSite` and sends no `Origin` could then deliver a cross-site form post with the person's session.

## What Changes

- A cookie-authenticated write (any method but `GET` and `HEAD`) with no `Origin`:
  - is refused with 403 `bad_origin` when `Sec-Fetch-Site` is present and not `same-origin`;
  - with neither header, is accepted only when it declares `Content-Type: application/json`. A form, multipart, plain-text or bodiless write naming neither header is refused, with a message pointing to API tokens and browser updates.
- Writes with an `Origin` are checked exactly as before; bearer-token requests and reads are unchanged.

Clients checked: every browser the app supports sends `Origin` on a write (Safari before 16.4 sends `Origin` but no `Sec-Fetch-Site`); the Android shell (Chromium WebView) and the iOS shell (WKWebView) load the app from the server and send writes through the page's `fetch`, while their native code only makes `GET` requests (health check, shell cache); the service worker's upload sends `Origin` and `Sec-Fetch-Site: same-origin`; the share target's `POST /share` is a public route without the cookie check; the extension, the Obsidian plugin, CalDAV and MCP use tokens or app passwords. `ot login` creates its token with the session cookie and a JSON body and no `Origin`, which is why a JSON body still passes.

Not **BREAKING** for the op log; no new route, field or environment variable.

Out of scope: `SameSite=Strict`, CSRF tokens, the share target's own Fetch Metadata check (`share-target-fetch-metadata`), first-run setup (`host-check-without-base-url`).

ROADMAP: hardening of a shipped feature (`account-access`), follow-up 6.4 of `external-security-review`.

## Capabilities

### Modified Capabilities

- `account-access`: "Cross-site request protection" covers writes without `Origin`.

## Impact

- `internal/httpapi/middleware.go` (`cookieWriteAllowed`).
- Tests: `TestCrossSiteCookieWritesAreRejected` (`server_test.go`), the route matrix's new pass, a test transport that makes the package's test clients send `Sec-Fetch-Site: same-origin` like a browser (`browser_transport_test.go`).
- Docs: `docs/api.md`, `docs/security/threat-model.md`; CHANGELOG `### Security`.
