## 1. Status event

- [x] 1.1 `notify.StatusChanged` and `notify.StatusSink` (with `Multi` fan-out and `Nop`); `emitStatus` in `internal/sync` after commit, wired in `apply.go` next to `emitUnblocked`. Verify: `go test ./internal/sync -run Status` (completed and reopened by another member emit one event each; the assignee's own change, an unassigned task and a deleted task emit none).

## 2. Push

- [x] 2.1 Columns added by a Go step (`store.migratePushNotify`; ALTER TABLE cannot be repeated); `SubscriptionInput.Notify` and `PublicSubscription.Notify`; stored on insert and update. Verify: `go test ./internal/push ./internal/httpapi -run Push` (default off, round trip, absent keeps the stored choices, 400 on an invalid `notify`; 401 without a session in TestPushRoutesRequireAuth).
- [x] 2.2 `push.Service` implements `Assigned` and `StatusChanged`: only opted-in, enabled subscriptions; title only with titles opted in and never a placeholder; bounded background sends. Verify: `go test ./internal/push -run Notify`.
- [x] 2.3 Register the push service as a sink in `internal/tenant/services/build.go`. Verify: `go test ./internal/tenant/...` and `go test ./...`.

## 3. Channels

- [x] 3.1 `channels.EventStatus` in `Events` (not in the default set) and `Service.StatusChanged`. Verify: `go test ./internal/channels`.

## 4. Web

- [x] 4.1 `push-sw.js`: `assigned` and `status` payloads, texts in every maintained language pinned to the catalogs, tag per task, click opens the task, nothing shown with the app in front. Verify: `npx vitest run src/lib/pushWorker.test.ts`.
- [x] 4.2 `push.ts` and Settings → Notifications: the two choices, shown while push is on, re-registering the subscription; the channel editor lists the `status` event. Verify: `npx vitest run src/app/notificationsSettings` and `npm run build`.
- [x] 4.3 Strings extracted and translated in every maintained catalog. Verify: `node scripts/i18n/extract.mjs --write` and `make i18n-check`.

## 5. Docs and finish

- [x] 5.1 A new guide `docs/assignment-notifications.md`; `docs/notification-channels.md` lists the status event and `docs/notifications.md` links the guide. Verify: `make docs` and `make docs-check`.
- [x] 5.2 Changelog `changelog.d/Added/assignee-notifications.md`; `make check`; archive the change. Verify: `make openspec-validate`.
