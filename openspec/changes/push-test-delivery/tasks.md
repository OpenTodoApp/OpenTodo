# Tasks

## 1. Server: test push

- [x] 1.1 Add `SendTest(ctx, sub)` to `internal/push/service.go`: build a `{"type":"test","testId","sentAt"}` payload with a random id and send it through `Send` with topic `test` (design D1). Verify with a unit test in `internal/push/service_test.go` against an `httptest` push service: the payload decrypts to type `test` with no task fields, 201 updates `last_ok_at`, 410 deletes the row, and 500 increments `failures`. Run `go test ./internal/push/...`.
- [x] 1.2 Register `POST /api/v1/push/test` with `requireAuth` in `registerPushRoutes`, plus a `pushTestLimiter` (5 per account per 10 minutes) on `Server` (design D2, D3). Verify with tests in `internal/httpapi/push_test.go` covering outcomes `sent`, `no_subscription`, `gone`, `failed`; 400 `bad_request` without `deviceId`; 401 without auth; 403 `insufficient_scope` with a read token and an agent token; 429 `rate_limited` on the 6th call, with no outbound request made; 404 with push off; 403 `demo_restricted` in demo mode, with the fake push service seeing no request. Run `go test ./internal/httpapi/...`.
- [x] 1.3 Document `POST /api/v1/push/test` in `docs/api.md` (route table and the "Reminders and push" section, with request, outcomes and limits). Verify that the doc examples match the handler's JSON by running the docs check (`cd web && npm run docs:check`).

## 2. Service worker: always notify and report receipt

- [x] 2.1 Handle `type: "test"` in `web/public/push-sw.js`: show a system notification even when a window is focused, with tag `opentodo-test:<testId>`, then post `{type:'push:test-received', testId, receivedAt}` to every window client. A click on it opens `/settings/notifications` (design D4). Verify with new cases in `web/src/lib/pushWorker.test.ts`: a focused window still gets `showNotification`, two tests get distinct tags, the receipt is posted, and no IndexedDB write occurs. Run `cd web && npm test`.

## 3. Client: real test, receipt and checklist

- [x] 3.1 Add `sendTestPush(deviceId)` and a receipt waiter (10 s) to `web/src/lib/push.ts`, returning `received | accepted_not_seen | no_subscription | gone | failed | rate_limited | offline | server_too_old` (design D5, migration). Verify with vitest cases that mock fetch and the `serviceWorker` message channel, covering each outcome including a receipt arriving after the timeout. Run `cd web && npm test`.
- [x] 3.2 Add a derived checklist model (`pushChecklist(state, lastTest, online)`) to `push.ts` (design D6). Verify with unit tests: with no service worker, the service-worker step fails and Enable is hidden; with permission denied, later steps read "not checked"; offline, the server steps read "can't check offline"; with failures > 0, the server step shows the last error and offers Re-enable. Run `cd web && npm test`.
- [x] 3.3 Rebuild the test area of `NotificationsSettings.tsx`: the checklist rows with fix actions, a "Send test notification" button that calls `sendTestPush` and shows the outcome copy (never "sent" without server confirmation), "Show a local notification" as a secondary action labeled local when there's no subscription (design D7), and the dev-build explanation (design D8). Verify with a component test (new `notificationsSettings.test.tsx`) for the no-subscription, received and accepted-not-seen states, and run `cd web && npm test && npm run build`.
- [x] 3.4 Update `docs/notifications.md`: the test steps, what "received" vs "accepted, not seen" means, the checklist and its fixes, OS notification settings per platform, and the dev-build note in the contributor docs if present. Regenerate the screenshot and help bundle if the docs pipeline needs it. Verify with `cd web && npm run docs:build && npm run docs:check`.

## 4. Integration

- [ ] 4.1 Manual check on a production build (`make web && go build -o bin/opentodo ./cmd/opentodo && ./bin/opentodo`, http://localhost:8080) in Chrome and Firefox. Enable notifications, then run the test with the settings page focused: a system notification appears and Settings says "received". Turn off the browser's notifications in the OS: Settings says "accepted, not seen" with the macOS hint. On `make dev` (:5173), the checklist explains there is no service worker. Record the results in the PR description.
- [ ] 4.2 Run `make check` and verify it passes, including `npx @fission-ai/openspec validate --all --strict`.

## Workflow follow-up

- Archive with `/opsx:archive` once merged, add a CHANGELOG.md entry under Unreleased, and confirm `openspec validate --all --strict` passes afterwards.
