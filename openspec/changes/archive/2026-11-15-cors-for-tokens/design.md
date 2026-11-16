# Design: cross-origin API calls with a token

## Context

The API has two credentials: the session cookie (the web app) and bearer tokens (scripts, the CLI, assistants). Cookie writes are protected by the `Origin`/Fetch Metadata check in `requireAuth` (`cookieWriteAllowed`); bearer requests are not, because a token is never sent by a browser on its own. CORS only decides whether a browser lets a page *read* a cross-origin response and send non-simple requests; it never stops a request from reaching the server.

## Decisions

### D1. Opt-in, exact origins, validated at startup

`OPENTODO_CORS_ORIGINS` lists exact origins. Each entry is parsed as an http(s) URL with a host, no credentials, no path other than `/`, no query or fragment and no `*`, and normalised as browsers write `Origin` (lower case, default port dropped). One bad entry stops startup, like `OPENTODO_BASE_URL`: a list the operator thinks is in force but isn't would only confuse. Empty entries (a trailing comma) are skipped. No wildcard: `*` with tokens would let any page that obtained a token use it, and the operator would no longer know which pages talk to the server.

### D2. Bearer requests only, never credentials

The response to a listed origin carries `Access-Control-Allow-Origin` only when the request has `Authorization: Bearer`. `Access-Control-Allow-Credentials` is never sent, so a browser does not expose a response to a request it sent with cookies (`credentials: "include"`). A cookie request from a listed origin is therefore exactly as today: the browser hides its response, and its writes carry `Origin: <listed origin>`, which `originAllowed` refuses with 403 `bad_origin`. `cookieWriteAllowed`'s no-`Origin` branch (JSON body accepted) is unaffected: every browser that sends a preflight also sends `Origin` on the request that follows, so the grant cannot reach that branch. A request with both a bearer token and a cookie is authenticated by the token (`authenticateScoped`), so the cookie adds nothing.

What a listed origin gains is only the ability to read responses to requests made with a token it already holds; the token's scope, workspace limit and every route policy apply unchanged. The residual risk is the listed site itself: script running there can read the token it holds. The docs say to list only origins the operator controls and to prefer `read` tokens.

### D3. A middleware before the router, no route

Preflights carry no credentials, so they must not reach `requireAuth` or a handler. The middleware `cors` sits in `New`'s chain after the audit context and before the demo and host guards and the mux. It answers `OPTIONS` with `Access-Control-Request-Method` from a listed origin with 204 and passes everything else through. No route is registered, so the route table, `public(...)` reasons and `policy_test.go` are untouched: there is no new handler that could serve data. A preflight from an unlisted origin, or any `OPTIONS` without `Access-Control-Request-Method`, reaches the router and answers 405 as today. The preflight is answered for any `/api/v1/` path, existing or not; the real request then gets its normal answer.

Allowed methods are the ones the API serves (`GET, HEAD, POST, PUT, PATCH, DELETE`). Allowed request headers are the non-safelisted ones the API reads: `Authorization`, `Content-Type` (JSON is not a simple type), `Idempotency-Key` and `If-Match` (notes). `Max-Age` is 600 seconds, so a changed list takes effect within ten minutes. Exposed headers are the ones responses carry for clients: `ETag`, `Retry-After`, `X-Row-Count`, `Content-Disposition`, `Allow`, `Deprecation`, `Sunset`, `Link`.

### D4. Only the data API

Paths are cleaned before matching. CORS applies under `/api/v1/` except:

- `/api/v1/auth/*`: password, passkey, second-factor and single sign-on sign-in, sign-up, verification, reset requests and sign-out. They set or clear the session cookie and take passwords; a third-party page should never be where someone types their OpenTodo password.
- `/api/v1/app/*`: the app sign-in code exchange and sign-out, an OAuth-like flow meant for the native app.
- `/api/v1/demo/*`: sandbox creation, which sets a cookie (and demo mode refuses the variable anyway).

`/dav/`, `/mcp` (which refuses foreign origins itself), `/oauth/*`, `/.well-known/*`, `/healthz`, the web app and public pages are outside `/api/v1/` and untouched. Public `/api/v1/` routes such as health get no headers either, because they are called without a token.

### D5. `Vary: Origin`

While the list is set, every response under `/api/v1/` outside the exclusions carries `Vary: Origin`, whether or not it got CORS headers, so a shared cache never serves one origin's answer to another.

### D6. Not in demo or host mode

A demo instance cannot create API tokens (`/api/v1/tokens` is demo-denied), so CORS would do nothing there; refusing the combination at startup is clearer than ignoring it. In host mode one operator variable would apply to every tenant's API, while tokens and data belong to each tenant's owner; per-tenant origins can come later if asked for.

## Data model, size and memory

No data model change, no op, no migration. No dependency; a few hundred bytes of code and one small map of origins per server.

## Risks

- An operator lists an origin they don't control: its pages can use any token a person pastes there. Mitigated by exact origins only and the docs.
- A future cookie-setting route outside `/api/v1/auth/` would still get no CORS headers for cookie requests (D2); the exclusions are defence in depth.
