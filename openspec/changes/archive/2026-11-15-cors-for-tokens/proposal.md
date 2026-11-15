# Cross-origin API calls with a token

## Why

A browser page on another origin, such as a static review dashboard, cannot call `/api/v1/` today: the server sends no CORS headers and a preflight `OPTIONS` answers 405 (#1374). The page holds an API token, typically a `read` one, so nothing it does needs the person's browser session.

## What Changes

- An optional `OPENTODO_CORS_ORIGINS`: exact origins separated by commas (`https://dash.example.com`). Unset, the default, changes nothing. An entry that is not an exact origin (a path, a query, a wildcard, another scheme) stops startup naming the variable. It cannot be combined with `OPENTODO_DEMO` or host mode.
- For a listed origin, under `/api/v1/` except the sign-in flows (`/api/v1/auth/*`, `/api/v1/app/*`, `/api/v1/demo/*`):
  - a preflight answers 204 with the allowed methods, the request headers the API reads (`Authorization`, `Content-Type`, `Idempotency-Key`, `If-Match`) and `Access-Control-Max-Age: 600`, before any route;
  - a request with `Authorization: Bearer …` gets `Access-Control-Allow-Origin` with its origin and `Access-Control-Expose-Headers`.
- `Access-Control-Allow-Credentials` is never sent. A request with only the session cookie gets no CORS headers, and its writes are refused by the existing cross-site check.
- Every `/api/v1/` response carries `Vary: Origin` while the list is set.

Not **BREAKING**: no new mandatory variable, no op log change, no new route.

Out of scope: wildcard or pattern origins, credentialed CORS (cookies), CORS on CalDAV, MCP, the OAuth endpoints or public pages, per-owner origins in Settings, host mode.

ROADMAP: none; a request from the community (#1374) on the shipped `http-api`.

## Capabilities

### Modified Capabilities

- `http-api`: new requirement "Cross-origin requests with an API token".
- `account-access`: "Cross-site request protection" no longer says the server never grants a preflight; it says why the grant does not reach cookie writes.

## Impact

- `internal/config/cors.go`, `config.go` (`CORSOrigins`, `ParseOrigin`).
- `internal/httpapi/cors.go` (middleware), `server.go` (in the handler chain, before the demo and host guards and the router).
- Tests: `internal/config/cors_test.go`, `internal/httpapi/cors_test.go`.
- Docs: `docs/api.md`, `docs/self-hosting/configuration.md`, `SECURITY.md`, `docs/security/threat-model.md`; `changelog.d/Added/cors-for-tokens.md`.
