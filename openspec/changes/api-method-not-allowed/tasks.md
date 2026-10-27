# Tasks

## 1. Server: 405 and a descriptive 404

- [x] 1.1 Replace the `/api/` catch-all with `routes.unknownAPIRoute` (`internal/httpapi/unknown_route.go`):
  - probe the mux for the methods the path serves;
  - answer 405 `method_not_allowed` with `Allow`, else 404 "unknown API route: <method> <path>";
  - never repeat the query string or control characters, and cut long paths (design D1, D3).

  Verify: `go test ./internal/httpapi -run 'TestWrongMethodIs405|TestUnknownAPIRouteNamesTheRequest'`.
- [x] 1.2 Count generic collection matches only for a real collection (design D2). Verify: `TestPushDisabledReturnsNotFound` and `TestPushTestNotFoundWhenPushOff` still answer 404; the new 404 case `POST /api/v1/nothing/here`.
- [x] 1.3 Route packages, policies and other endpoints are unaffected. Verify:
  - the 405 table covers the speech and maps routes, anonymous and signed in;
  - `POST` still gets 401 from its policy;
  - the full `go test ./internal/httpapi/... ./internal/host/...` passes, including the policy, demo, `/mcp` 405 and CalDAV tests.

## 2. Web: a refused test request says so

- [x] 2.1 Add `testRequestError` (`web/src/app/assistant/testRequestError.ts`) and use it for the owner's and the member's Test connection failures in `AssistantSettings.tsx` (design D4). Verify: `cd web && npx vitest run src/app/assistant/testRequestError.test.ts src/app/assistantSettings.test.tsx`.
- [x] 2.2 Add the new sentence to the catalogs: `node scripts/i18n/extract.mjs --write`, then translations in de, es, fr, it and pt. Verify: `make i18n-check`.

## 3. Docs and release

- [x] 3.1 Describe the 405 and the new 404 text in `docs/api.md`, and add a reverse-proxy troubleshooting note to `docs/self-hosting/docker.md`. Verify: `cd web && npm run docs:check`.
- [x] 3.2 Add a CHANGELOG.md entry under Unreleased (Refs #501). Verify: `npm run docs:check`.
- [x] 3.3 Run `go test ./...`, `cd web && npm test && npm run build`, `make openspec-validate`. Verify: all pass, then CI on the pull request.
- [ ] 3.4 After merge, comment on issue #501: the diagnostics landed, what the reporter will now see, and a repeated request for their failed request's URL, method and status. Keep the issue open. Verify: `gh issue view 501 -R OpenTodoApp/OpenTodo` shows the comment and state OPEN.
