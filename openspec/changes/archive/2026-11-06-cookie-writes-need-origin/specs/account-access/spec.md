## MODIFIED Requirements

### Requirement: Cross-site request protection
A state-changing request authenticated by a session cookie SHALL be refused when its `Origin` header is present and does not match the server's public origin. With `OPENTODO_BASE_URL` set, an `Origin` that is not the base URL's origin SHALL be accepted only when it names the request's host and that host is the base URL's host, so a page under another name that resolves to the server (DNS rebinding) is cross-site. The same check guards registration and sign-in. A state-changing request authenticated by a session cookie that carries no `Origin` SHALL be refused with 403 `bad_origin` when its `Sec-Fetch-Site` header is present and is not `same-origin`, and, when it carries neither header, unless it declares `Content-Type: application/json` (any parameters allowed): a browser too old to send either header can send a cross-site write only as a form or a navigation, which cannot declare that type without a CORS preflight the server never grants, while non-browser clients such as earlier `ot` releases send JSON. The refusal's message SHALL say to use an API token for scripts or to update the browser. `GET` and `HEAD` requests are not subject to this check, and requests authenticated by a bearer token are not subject to it either. The check creates no ops, so offline behaviour and convergence are unaffected.

#### Scenario: Cross-site POST with cookie
- **WHEN** a browser on another origin sends a POST that carries the session cookie
- **THEN** the response is a 403 `bad_origin` error and nothing changes

#### Scenario: Same-origin POST with cookie
- **WHEN** the app on the server's own origin sends a POST that carries the session cookie
- **THEN** the request is processed normally

#### Scenario: Rebound host name with a base URL
- **WHEN** `OPENTODO_BASE_URL` is `https://todo.example.com` and a request carries `Host: rebind.example` and `Origin: http://rebind.example`
- **THEN** it is refused with 403 `bad_origin`

#### Scenario: Cookie form write with neither Origin nor Sec-Fetch-Site
- **WHEN** a POST, PATCH, PUT or DELETE carries the session cookie, no `Origin`, no `Sec-Fetch-Site`, and a form, multipart, plain-text or no content type
- **THEN** it is refused with 403 `bad_origin` naming API tokens, and nothing changes

#### Scenario: Fetch Metadata from another site
- **WHEN** a cookie write carries no `Origin` and `Sec-Fetch-Site` is `cross-site`, `same-site` or `none`
- **THEN** it is refused with 403 `bad_origin`

#### Scenario: The app's own pages without Origin
- **WHEN** a cookie write carries no `Origin` and `Sec-Fetch-Site: same-origin`
- **THEN** it is processed normally

#### Scenario: A non-browser client with a session
- **WHEN** a client signed in with a password sends `POST /api/v1/tokens` with the session cookie, `Content-Type: application/json` and neither header
- **THEN** the token is created, as before

#### Scenario: Bearer tokens are unaffected
- **WHEN** a request authenticated by a bearer token carries neither `Origin` nor `Sec-Fetch-Site`
- **THEN** it is processed normally
