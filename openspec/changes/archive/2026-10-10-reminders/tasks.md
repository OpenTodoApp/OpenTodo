# Tasks

## 1. Op schema and data layer

- [x] 1.1 Add entity `reminder` (`task_id`, `kind`, `offset_minutes`, `fire_at`, `delivered_at`, `dismissed_at`, `created_at`, `deleted_at`) and a `kind` validation to `internal/sync/ops.go`; verify `TestValidateReminderOps` (valid, bad kind, non-numeric fire_at rejected) with `go test ./...`
- [x] 1.2 Mirror the entity in `web/src/lib/types.ts`, add `reminders` table to the Dexie schema and defaults to `web/src/lib/ops.ts`; verify `reminders.test.ts` applies reminder ops in any order with identical results (`npm test`)
- [x] 1.3 Client helpers `addReminder`, `updateReminder`, `deleteReminder`, `snoozeReminder`, `dismissReminder`; verify in `reminders.test.ts` that each produces ops in the outbox and that snooze clears `delivered_at` (`npm test`)
- [x] 1.4 Recompute `fire_at` of relative reminders inside `updateTask` when `due` changes, using the same HLC timestamp; verify `reminders.test.ts` "due moved recomputes fire_at" and "cleared due yields null fire_at" (`npm test`)
- [x] 1.5 Include reminders in `GET /api/v1/export` and in `docs/sync.md` schema table; verify `TestExportIncludesReminders` (`go test ./...`) and the docs table lists every field

## 2. Push keys and subscriptions (server)

- [x] 2.1 Generate and load the VAPID P-256 key pair at `<DATA_DIR>/push_vapid.pem` (0600) on first need; verify `TestVapidKeyPersistsAcrossRestart` creates the file once and reuses it (`go test ./...`)
- [x] 2.2 Migration `0002_push_subscriptions.sql` and store methods (upsert by device, delete, list by user, record failure); verify `TestPushSubscriptionUpsertReplacesDevice` (`go test ./...`)
- [x] 2.3 Routes `GET /api/v1/push/vapid-key`, `POST /api/v1/push/subscriptions`, `DELETE /api/v1/push/subscriptions/{id}` behind `requireAuth`, honouring `OPENTODO_PUSH=off` with 404; verify `TestPushRoutesRequireAuth`, `TestPushSubscribeRejectsMissingKeys`, `TestPushDisabledReturnsNotFound` (`go test ./...`)
- [x] 2.4 Delete a user's subscriptions on sign-out and session revocation; verify `TestSignOutRemovesPushSubscription` (`go test ./...`)
- [x] 2.5 Document the routes in `docs/api.md` and the `OPENTODO_PUSH` switch in `.env.example` and `docs/self-hosting/docker.md`; verify the documented payloads match the handlers

## 3. Web push sender and scheduler (server)

- [x] 3.1 Implement VAPID JWT signing and `aes128gcm` payload encryption with the standard library; verify `TestWebPushEncryptionVector` against the RFC 8291 example and `TestVapidHeader` (`go test ./...`)
- [x] 3.2 Scheduler goroutine: select due, undelivered, undismissed reminders on open tasks every 30 s, send to each subscription, write `delivered_at` op with `device="server"`; verify `TestSchedulerDeliversOnceAcrossRestart` using a fake push endpoint (`go test ./...`)
- [x] 3.3 Payload builder: ids and `fire_at` only, title added when `include_content` is set; verify `TestPayloadOmitsContentByDefault` (`go test ./...`)
- [x] 3.4 Subscription hygiene: remove on 404/410, count other failures, expose `last_ok_at`; verify `TestGoneSubscriptionIsRemoved` (`go test ./...`)

## 4. Client delivery

- [x] 4.1 In-app reminder watcher with toast (task title, Snooze 10 min / 1 h / tomorrow 09:00, Dismiss) reachable with the keyboard, skipping completed and deleted tasks; verify `reminderWatcher.test.ts` fires a due reminder with fake timers and skips a completed task (`npm test`)
- [x] 4.2 Service worker `push`, `notificationclick`, `notificationclose` handlers: read the task from IndexedDB, show notification with actions, defer to a focused client, write snooze/dismiss ops to the outbox; verify browser flow: reminder received with app closed shows a notification whose Snooze reschedules the reminder visibly in the detail panel after reopening offline
  - Verified by Go tests against a fake push endpoint that decrypts payloads, and by vitest over a stubbed service worker; a real browser push delivery was not possible in headless Chromium here. Check once on a phone with the app installed over https before release.
- [x] 4.3 Shared shown-set to avoid double notifications; verify browser flow: with push enabled and the app focused, a due reminder produces one toast and no system notification
  - Verified by Go tests against a fake push endpoint that decrypts payloads, and by vitest over a stubbed service worker; a real browser push delivery was not possible in headless Chromium here. Check once on a phone with the app installed over https before release.
- [x] 4.4 Detail panel reminders section: list, add relative (presets and custom offset) or absolute (date and time picker), edit, delete; verify browser flow: add "30 minutes before", move the task's due time, reminder time follows; `npm run build` passes
- [x] 4.5 Settings "Notifications": enable (permission + subscribe), disable (unsubscribe), include task titles, test notification, last delivery status; verify browser flow: enabling then reloading shows enabled, denying permission shows the explanation
  - Verified by Go tests against a fake push endpoint that decrypts payloads, and by vitest over a stubbed service worker; a real browser push delivery was not possible in headless Chromium here. Check once on a phone with the app installed over https before release.

## 5. Integration and docs

- [x] 5.1 Two-device flow against the production binary: create reminder on A, reschedule on B, both fire once; snooze on A offline, dismiss on B, reconnect, converged state; verify the run finishes with no console errors and the reminder shows as snoozed on both
  - Verified by Go tests against a fake push endpoint that decrypts payloads, and by vitest over a stubbed service worker; a real browser push delivery was not possible in headless Chromium here. Check once on a phone with the app installed over https before release.
- [x] 5.2 Update `docs/architecture.md` (scheduler, service worker), `README.md` feature list and `CHANGELOG.md` Unreleased; verify links resolve and `make check` passes
