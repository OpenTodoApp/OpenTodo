## ADDED Requirements

### Requirement: Cross-origin requests with an API token
The server SHALL accept an optional `OPENTODO_CORS_ORIGINS`: exact origins (`http` or `https`, a host and an optional port) separated by commas. Unset, the server SHALL send no CORS headers and answer an `OPTIONS` request as any other unserved method. An entry with a path, a query, a fragment, credentials, a wildcard or another scheme SHALL stop startup with a message naming the variable, and so SHALL the variable together with `OPENTODO_DEMO` or host mode. While it is set, for a path under `/api/v1/` other than `/api/v1/auth/*`, `/api/v1/app/*` and `/api/v1/demo/*`:
- a request whose `Origin` is listed and that carries `Authorization: Bearer` SHALL get `Access-Control-Allow-Origin` naming that origin and `Access-Control-Expose-Headers`;
- an `OPTIONS` request with `Access-Control-Request-Method` whose `Origin` is listed SHALL answer 204 with `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers` (at least `Authorization`, `Content-Type` and `Idempotency-Key`) and `Access-Control-Max-Age`, without reaching any route;
- every response SHALL carry `Vary: Origin`.
`Access-Control-Allow-Credentials` SHALL never be sent. A request that carries no bearer token SHALL get no CORS headers, whatever its `Origin`, so a listed origin's page can never use a browser's session cookie; such a request's writes stay subject to the cross-site request protection. The token's scope and the route's policy SHALL apply unchanged. Other paths (`/dav/`, `/mcp`, the OAuth endpoints, `/healthz`) SHALL be unaffected. The headers create no ops, so offline behaviour and convergence are unaffected.

#### Scenario: Off by default
- **WHEN** `OPENTODO_CORS_ORIGINS` is unset and a page on `https://dash.example.com` sends a preflight for `/api/v1/tasks`
- **THEN** the response is 405 as before, with no CORS headers

#### Scenario: A dashboard with a read token
- **WHEN** `OPENTODO_CORS_ORIGINS=https://dash.example.com` and a page there sends `GET /api/v1/tasks` with a `read` token
- **THEN** the response is 200 with `Access-Control-Allow-Origin: https://dash.example.com`, `Vary: Origin` and no `Access-Control-Allow-Credentials`

#### Scenario: Preflight from a listed origin
- **WHEN** a page on a listed origin sends `OPTIONS /api/v1/tasks/{id}` with `Access-Control-Request-Method: PATCH`
- **THEN** the response is 204 naming the origin, the methods `GET, HEAD, POST, PUT, PATCH, DELETE`, the headers `Authorization, Content-Type, Idempotency-Key, If-Match` and a max age, and no handler runs

#### Scenario: The token's scope still decides
- **WHEN** a page on a listed origin sends `POST /api/v1/tasks` with a `read` token
- **THEN** the response is 403 `insufficient_scope` with `Access-Control-Allow-Origin`, so the page can read why, and nothing changes

#### Scenario: Origin not listed
- **WHEN** a page on `https://evil.example` sends a preflight, or a request with a token
- **THEN** no CORS headers are sent and the preflight answers 405, so the browser blocks the page

#### Scenario: Never with the session cookie
- **WHEN** a page on a listed origin sends a request that carries the session cookie and no bearer token
- **THEN** the response has no CORS headers, and a `POST`, `PUT`, `PATCH` or `DELETE` is refused with 403 `bad_origin` and nothing changes

#### Scenario: Sign-in stays same-origin
- **WHEN** a page on a listed origin sends a preflight for `/api/v1/auth/login`, `/api/v1/app/token`, `/dav/` or `/mcp`
- **THEN** it gets no CORS headers

#### Scenario: Invalid entry
- **WHEN** `OPENTODO_CORS_ORIGINS=https://dash.example.com/app` or `*` is set
- **THEN** the process exits non-zero with a message naming `OPENTODO_CORS_ORIGINS`
