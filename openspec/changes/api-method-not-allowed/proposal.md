# Proposal

## Why

Issue [#501](https://github.com/OpenTodoApp/OpenTodo/issues/501): an owner's **Test connection** for Google Gemini showed `{"error":{"code":"not_found","message":"unknown API route"}}`. The test route exists and works. We confirmed that reply comes only from the `/api/` catch-all, and that it is what a registered path answers when it is asked with the wrong method, for example a `GET` produced by a reverse proxy's 301 or 302 redirect, or with a trailing slash. ServeMux would answer 405 for a method mismatch, but the catch-all shadows it. So the reply pointed at OpenTodo ("unknown route") instead of at the change made on the way, and neither the reporter nor we could tell what happened.

## What Changes

- **405 for a known path.** A path under `/api/` that a route serves, asked with a method it doesn't serve, answers **405** `method_not_allowed`. The response has an `Allow` header listing the methods the path serves, and the message names both: "GET is not allowed on /api/v1/settings/assistant/test; use POST".
- **A 404 that names the request.** A path no route serves answers 404 `not_found` with "unknown API route: <method> <path>". The query string is never repeated, control characters are dropped, and the text is cut when long.
- **No false 405s.** The generic collection routes count only for a real collection, so the routes of a switched-off feature (push) stay a 404.
- **Assistant settings:** when a **Test connection** request is itself refused with one of those answers, the result reads "The server rejected the test request (405: …). A reverse proxy or a redirect may have changed it on the way; the provider was not asked." This replaces the bare server text.
- **Docs:** the API reference describes the 405 and the new 404 text. The Docker guide's reverse-proxy section gains a troubleshooting note: use no redirect, or 307 or 308, for `/api/`.

No data, op, policy or environment-variable change. The status of a request that used to get the catch-all's 404 can now be 405, but only for a method that never worked on that path. Not **BREAKING**.

**Out of scope:**
- Finding the reporter's actual proxy problem. A reply on #501 asks for the request details, and the issue stays open.
- 405 handling outside `/api/`: the web app, `/dav/` and `/mcp` keep their own behaviour.
- Changing what the generic collection handlers answer for an unknown collection.

ROADMAP.md: no row, since this is a diagnostics fix for the shipped HTTP API.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `http-api`: a new requirement, "Wrong method and unknown routes", with 405 and 404 scenarios, including authentication and the query-string rule.
- `in-app-assistant`: a new requirement, "A refused test request says so".

## Impact

- **Code:**
  - `internal/httpapi/router.go`: the catch-all.
  - `internal/httpapi/unknown_route.go`: new. It probes the mux for the methods a path serves, and words the 405 and 404.
  - `web/src/app/assistant/testRequestError.ts`: new.
  - `AssistantSettings.tsx`: both Test buttons.
  - The locale catalogs: one new sentence.
- **Tests:**
  - `internal/httpapi/unknown_route_test.go`: core routes, generic collections, route packages, anonymous and signed in, the query string, control characters and length.
  - The existing push "disabled returns not found" tests and `TestMcpGet405` keep passing.
  - `web/src/app/assistant/testRequestError.test.ts`.
- **Docs:** `docs/api.md`, `docs/self-hosting/docker.md`.
- **Size:** a few lines; no dependency; no bundle change worth measuring (one string).
- **Issue:** Refs #501.
