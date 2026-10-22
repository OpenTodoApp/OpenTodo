# Design

## Context

`handleDAV` answered `/.well-known/caldav` with `http.Redirect(w, r, "/dav/", 301)`, a relative `Location`. `publicOrigin(r)` already exists for the CalDAV address Settings shows, feeds and copied links: the configured base URL, else the request's origin with the trusted-proxy headers honoured. Every WebDAV method outside `/dav/` reached the web app handler, which answers anything but GET and HEAD with `405 method not allowed` and no `DAV` or `Allow` header (the 19-byte response in the issue's log).

## Decisions

**D1. Absolute `Location` from `publicOrigin`.** The redirect is `publicOrigin(r) + "/dav/"`. Alternative: the request's `Host` only. Rejected: behind a reverse proxy that would name the internal address; `publicOrigin` is the one rule the project already uses for addresses a client is told.

**D2. Root probes redirect; `OPTIONS` answers.** `PROPFIND /` redirects (301) to `/dav/` and `/principals/…` to `/dav/principals/…`, with D1's absolute `Location`; `OPTIONS /` answers 200 with `DAV: 1, 3, calendar-access` and `Allow: OPTIONS, PROPFIND` without credentials. Alternative: serve the DAV multistatus at the root by rewriting the path to `/dav/`. Rejected: the `href`s in the answer would not match the request URL, which some clients refuse; a redirect is what every CalDAV server does for the well-known address, and Apple follows it once the `Location` is absolute. The `OPTIONS` answer reveals that CalDAV is on, as the well-known redirect already does; the principal still needs an app password.

**D3. Exact root patterns.** The routes are `PROPFIND /{$}` and `OPTIONS /{$}`: a subtree pattern with a method would be ambiguous with `/dav/` in the standard mux. `/principals` and `/principals/` are plain subtree patterns under the web app's `/`.

**D4. Disabled: as before.** With the owner switch off, the root answers 405 for the probes (what the web app answered) and `/principals/` 404, so the switch keeps the endpoint invisible ("Off by default").

**D5. Demo.** The deny list refuses `PROPFIND` and `OPTIONS` on `/` (method-aware, so the web app's `GET /` and the 405 a `POST /` gets stay) and everything under `/principals`; the policy test keeps the list and the route policies in agreement.

## Data model

None.
