# Tasks

## 1. Event derivation

- [x] 1.1 `internal/sync`: expose per-batch winning changes `[]Change{UserID, Entity, EntityID, Fields{from,to}, Origin}` from `Apply` through an observer, emitted only after commit; verify `TestApplyReportsWinningChangesOnly` (stale ops produce no change) and existing convergence tests still pass (`go test ./...`)
- [x] 1.2 `internal/webhook/events.go`: map a change to one event by precedence (created, deleted, completed, reopened, archived, updated), build the versioned payload with `data`, `changes` and `source`; verify `TestEventPrecedence`, `TestPayloadChangesFromTo` (`go test ./...`)

## 2. Storage, queue and delivery

- [x] 2.1 Migration adding `webhooks`, `webhook_deliveries` and `settings` if absent; verify `TestMigrationWebhooks` on a database at the previous version (`go test ./...`)
- [x] 2.2 Signer: `whsec_` secret generation, `X-OpenTodo-*` headers, `v1=` HMAC-SHA256 over `timestamp.body`; verify `TestSignatureMatchesReferenceVector` with a documented vector reused in `docs/webhooks.md` (`go test ./...`)
- [x] 2.3 SSRF-safe client: scheme check, resolve-then-filter dialer (loopback, link-local, metadata, RFC 1918, CGNAT, ULA, multicast, unspecified, IPv4-mapped), no redirects, 10 s timeout, 1 KB response excerpt, owner override; verify `TestDenyListTable`, `TestDialerPinsCheckedAddress`, `TestRedirectsNotFollowed`, `TestOwnerOverrideAllowsPrivate` (`go test ./...`)
- [x] 2.4 Queue worker: enqueue after `Apply`, poll with wake-up, bounded concurrency 4, backoff schedule with jitter, 6 attempts, consecutive-failure counter and auto-disable at 20, pruning (30 days, newest 100 per webhook); verify `TestRetrySchedule`, `TestDeliveriesSurviveRestart`, `TestAutoDisableAfter20Failures`, `TestPruneKeepsNewest100` (`go test ./...`)
- [x] 2.5 Subscription matching (events set, project filter, enabled) and per-user scoping; verify `TestProjectFilterSkipsOtherProjects`, `TestDisabledWebhookGetsNoDeliveries` (`go test ./...`)

## 3. HTTP API

- [ ] 3.1 Routes `GET/POST /api/v1/webhooks`, `GET/PATCH/DELETE /api/v1/webhooks/{id}`, `POST /api/v1/webhooks/{id}/test`, `GET /api/v1/webhooks/{id}/deliveries`, `POST /api/v1/webhooks/{id}/deliveries/{did}/redeliver` behind `requireAuth`, secret only in the 201 body, limits (20 per user, URL 2 KB), validation errors incl. `private_target`; verify `TestWebhookRoutesRequireAuth`, `TestWebhookValidation400`, `TestPrivateTargetRefused400`, `TestForeignWebhook404`, `TestRedeliverUnknown404`, `TestSecretNotInReads` (`go test ./...`)
- [ ] 3.2 Owner-only `GET/PUT /api/v1/settings/webhooks` with `allow_private`, `OPENTODO_WEBHOOKS_ALLOW_PRIVATE` preset in `internal/config`; verify `TestWebhookPolicyForbidsMembers`, `TestWebhookPolicyPresetSeedsOnce` (`go test ./...`)
- [ ] 3.3 End-to-end in Go: create webhook against an in-process receiver, complete a task via `/api/v1/sync` from a fake device, assert one signed `task.completed` delivery with correct `changes`, then a 503→200 retry path; verify `TestWebhookEndToEnd` (`go test ./...`)

## 4. Web app

- [ ] 4.1 Settings → Webhooks: list with status and disabled reason, create dialog with event checkboxes, project filter and secret shown once with copy, edit, enable/disable, test with result, delivery log with redeliver, `http://` warning; owner policy toggle; offline state with cached list and disabled actions; verify `webhooksSettings.test.tsx` (`npm test`, `npm run build`) and keyboard reachability in the browser flow

## 5. Docs and integration

- [ ] 5.1 `docs/webhooks.md`: event list, payload schema v1, signature verification snippets (shell, Python, JavaScript) using the test vector, retry policy, SSRF policy and owner toggle, receiver recipes for Home Assistant, Telegram (via a small relay or n8n), n8n; verify the snippets validate the documented vector
- [ ] 5.2 `docs/api.md` routes, README feature list, `ROADMAP.md` status, `CHANGELOG.md` Unreleased; verify links resolve and `make check` passes
- [ ] 5.3 Manual run against the production binary with an n8n webhook node (or any HTTP echo receiver): create, test, complete a task from the PWA, see the delivery and verify its signature; verify no 5xx in server logs
