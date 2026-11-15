## Why

Anyone may build a client on OpenTodo's REST API, and `docs/stability.md` promises it stays compatible through 1.x. But the API is described only in prose (`docs/api.md`, about 2,800 lines), so each client author copies types and calls by hand, and nothing a tool can read says what a route takes or returns. The code already knows: the v1 surface test (`internal/httpapi/surface_test.go`) reads every route's policy, success statuses and request and response fields from the handlers. This change turns that knowledge into a published OpenAPI description, so people can generate clients, explore the API in standard tools, and check their code against a file that cannot drift from the server. Issue #1416.

## What Changes

- An OpenAPI 3.1 description of every `/api/v1/` route, generated from the route table and the same static analysis as the v1 surface, never written by hand: paths and path parameters, the auth a route accepts (session, token scopes), request and response schemas, success statuses, the JSON error envelope and the error codes a route can answer, and deprecations with their sunset dates.
- A test fails while the committed description is stale; one command rewrites it.
- The server serves it at `GET /api/v1/openapi.json`, without signing in. It describes routes, not accounts, and is the same on every server of a release.
- Each release attaches it, and the site bundle carries it, so the website's developer page links the description of the pinned release.
- `docs/api.md` says where it is and what it does and does not cover.

## Capabilities

### New Capabilities

- `api-description`: the generated, published OpenAPI description of the v1 REST API.

## Impact

- New: a generator in `internal/httpapi` (test code, not linked into the server), the committed `internal/httpapi/openapi.json` (embedded, served gzip-compressed), one public route, a release asset and a site-bundle file.
- Binary: the description is embedded once. Expected size about 400 KB raw, about 40 KB gzip; design D4 says how it is stored. No new dependency.
- No op, schema or data change, no new environment variable, nothing **BREAKING**.

## Out of scope

- Generated SDKs, which can follow once people ask for a language.
- The sync exchange's op payloads beyond their envelope (`docs/sync.md` stays the reference), CalDAV, MCP and the webhook payloads (`docs/webhooks.md`).
- Hand-written prose per route in the description: summaries come from the route's group in `docs/api.md` only where the generator can link it (design D5).
- Third-party sign-in for apps (issue #1418) and the client guide (issue #1417), which link to this description.

Advances the shipped stability contract (`stability-contract`) and "REST API and API tokens for scripts" (`bootstrap-core-platform`) in ROADMAP.md.
