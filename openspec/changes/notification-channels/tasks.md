# Tasks

## 1. Server: channels

- [ ] 1.1 Migration `0046_notification_channels` (channels and deliveries, unique `(channel_id, dedupe_key)`, cascades); verify `go test ./internal/store/...`
- [ ] 1.2 `internal/channels`: store, validation (kinds, names, addresses, topics, events, the 5-channel limit), secrets file, message rendering in six languages with the content policy (D4); verify `go test ./internal/channels/...` (validation, content policy with titles on and off, encrypted account, ciphertext, languages)
- [ ] 1.3 Senders for ntfy, Pushover, Gotify and the signed webhook payload through `internal/outbound`; verify request shape tests against `httptest` servers for each kind and a signature check with `webhook.Verify`
- [ ] 1.4 Sink (assigned, mentioned, unblocked, page) and the reminder hook with dedupe; the queue worker with retries, auto-disable, pruning and the hourly limit; verify worker tests (retry then success, terminal private target, 20 failures disable, rate limit skips, restart re-sends nothing twice) and a push scheduler test that a reminder reaches a channel once while pushes are retried

## 2. Server: routes and wiring

- [ ] 2.1 Routes under `/api/v1/notification-channels` and `/api/v1/settings/notification-channels` through `routes.handle` with policies, `.demoDenied()` and deny-list entries; audit constructors and allow-list keys; verify `go test ./internal/httpapi/...` (policy and demo tests, CRUD, auth, other account 404, limits, private target, test route, owner switch) and `go test ./internal/audit/...`
- [ ] 2.2 Tenant wiring: sink registration, reminder hook, worker on the jobs leader, never on a demo, private policy forced off on a host; verify `go test ./internal/tenant/...` and `go test ./...`

## 3. Client

- [ ] 3.1 `lib/notificationChannels.ts` API client and types; the Delivery channels card and editor in Settings → Notifications with copy, offline and encrypted states, the owner row and the secret shown once; verify `notificationChannels.test.tsx` (`npm test`), `settingsCopy.test.ts`, a story in both themes, translations in the five catalogs (`node scripts/i18n-check.mjs`), audit event labels
- [ ] 3.2 `npm run build` and `make ui-lint`; visual baselines for the new story

## 4. Documentation

- [ ] 4.1 `docs/notification-channels.md` (ntfy, Pushover, Gotify, the webhook payload with Apprise and Home Assistant), `docs/api.md` routes, `docs/reminders.md` and `docs/push-notifications.md` pointers, ROADMAP row, CHANGELOG Added entry; verify `make docs-check`
- [ ] 4.2 `make check` (TZ=UTC) passes
