## Context

`GET /healthz` is a public route (`handleHealth`): it asks the database for the user count and answers `{"status":"ok","version":"…"}`, or 503 `unhealthy`. The image's `HEALTHCHECK` (`/opentodo healthcheck`), the deployment templates and the test scripts use it. The mobile apps' first-run check uses it too, from outside, through whatever proxy the owner runs.

## Decisions

### D1. A second path on the same handler, under the API

`GET /api/v1/health` is registered with the same handler and `public("health check under the API path, for proxies that reserve /healthz")`. It sits under `/api/`, which proxies pass through (the Android guide already tells login-wall users to bypass `/api/*`), does not end in `z`, and follows the v1 naming (lowercase nouns). Its answer is the same object, so a client parses one shape; the public route matrix classes it `pubStatic` (no account data, the same answer to anyone). It is a read that reaches no outbound target and writes nothing, so it needs no `.demoDenied()` and no entry in the demo deny list.

Alternative rejected: `/api/health` outside v1. Every other API route is versioned, and the v1 surface snapshot then records the route's shape as a promise.

### D2. The apps ask the new route first and fall back

Asking `/healthz` first would keep failing behind Pomerium, which answers 200 with `OK` there (a non-JSON 200 the Android app reads as a web page). So the apps ask `/api/v1/health` first. Its answer settles the check when it is OpenTodo's, or when the connection failed or the certificate was refused (the same host fails the same way on every path, and a second ten-second timeout helps nobody). Otherwise `/healthz` is asked: an older server answers there (its `/api/` catch-all answers 404 JSON for the new path). When `/healthz` does not answer OK either, Android keeps the first route's outcome, so a login wall is still reported as one; iOS, which has no login-wall outcome, reports the second.

A redirect to either health route counts as a moved server, not a login wall, as a redirect to `/healthz` did.

## Data model impact

None: no table, op field or setting.

## Size

A few lines of Go and of each app; no dependency. Binary and image size unchanged in any measurable way; no runtime memory change.
