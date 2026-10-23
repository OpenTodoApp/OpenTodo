# Tasks

## 1. Server: channels

- [x] 1.1 Migration `0046_notification_channels` (channels and deliveries, unique `(channel_id, dedupe_key)`, cascades); verify `go test ./internal/store/...`
  - Done: `internal/store/migrations/0046_notification_channels.sql`; every package test opens it.
- [x] 1.2 `internal/channels`: store, validation (kinds, names, addresses, topics, events, the 5-channel limit), secrets file, message rendering in six languages with the content policy (D4); verify `go test ./internal/channels/...` (validation, content policy with titles on and off, encrypted account, ciphertext, languages)
  - Done: `channels.go`, `messages.go`, `switch.go`; `TestValidation`, `TestContentPolicyAndLanguages`, `TestSecretsNeverInTheDatabaseOrReads`, `TestEncryptedAccountSendsNoContent`, `TestMissingSecretAfterRestoreDoesNotSend`. An ntfy channel without a server uses `https://ntfy.sh`.
- [x] 1.3 Senders for ntfy, Pushover, Gotify and the signed webhook payload through `internal/outbound`; verify request shape tests against `httptest` servers for each kind and a signature check with `webhook.Verify`
  - Done: `send.go`; `TestKindsRequestShapes` (ntfy JSON with bearer token, Pushover form with priority, Gotify key and click extras, webhook signature and payload without content), `TestPrivateTargetAtSendIsTerminal`, `TestSendTest` (secrets scrubbed from errors).
- [x] 1.4 Sink (assigned, mentioned, unblocked, page) and the reminder hook with dedupe; the queue worker with retries, auto-disable, pruning and the hourly limit; verify worker tests (retry then success, terminal private target, 20 failures disable, rate limit skips, restart re-sends nothing twice) and a push scheduler test that a reminder reaches a channel once while pushes are retried
  - Done: `queue.go`, `next.go`, `push.Service.SetReminderHook`; `TestSinkQueuesOncePerChannelAndEvent`, `TestRetryThenSuccessAndAutoDisable`, `TestHourlyLimitSkips`, `TestOwnerSwitchOffQueuesNothing`, `TestQueueSurvivesRestartWithoutDuplicates`, `TestPruneKeepsTheNewest`, `internal/push` `TestReminderHookSeesEveryFiring`.

## 2. Server: routes and wiring

- [x] 2.1 Routes under `/api/v1/notification-channels` and `/api/v1/settings/notification-channels` through `routes.handle` with policies, `.demoDenied()` and deny-list entries; audit constructors and allow-list keys; verify `go test ./internal/httpapi/...` (policy and demo tests, CRUD, auth, other account 404, limits, private target, test route, owner switch) and `go test ./internal/audit/...`
  - Done: `internal/httpapi/channels.go`, `demo.go` entries, `audit` `NotificationChannel*` with `notification_channel_id` and `channel_kind`; `TestChannelsSwitch`, `TestChannelLifecycle`, `TestChannelWebhookSecretShownOnceAndLimits`; `channels_disabled` in the error code fixture with its message; `docs/api.md` routes and audit events.
- [x] 2.2 Tenant wiring: sink registration, reminder hook, worker on the jobs leader, never on a demo, private policy forced off on a host; verify `go test ./internal/tenant/...` and `go test ./...`
  - Done: `openChannels` in `internal/tenant/tenant.go` (nil on a demo; the webhooks' policy, forced off on a host), the worker in `StartJobs`, and on a host the channels ride on the webhooks' due entry and housekeeping (`internal/host/scheduler.go`). `go test ./...` passes.

## 3. Client

- [x] 3.1 `lib/notificationChannels.ts` API client and types; the Delivery channels card and editor in Settings → Notifications with copy, offline and encrypted states, the owner row and the secret shown once; verify `notificationChannels.test.tsx` (`npm test`), `settingsCopy.test.ts`, a story in both themes, translations in the five catalogs (`node scripts/i18n-check.mjs`), audit event labels
  - Done: `NotificationChannels.tsx`, `NotificationChannelEditor.tsx`, `notificationChannels.stories.tsx` (8 states), copy entry `notification-channels`, audit labels, 53 messages in the five catalogs; the full web suite passes with TZ=UTC.
- [x] 3.2 `npm run build` and `make ui-lint`; visual baselines for the new story
  - Done: build and `make ui-lint` pass; baselines regenerated in the pinned Playwright image.

## 4. Documentation

- [x] 4.1 `docs/notification-channels.md` (ntfy, Pushover, Gotify, the webhook payload with Apprise and Home Assistant), `docs/api.md` routes, `docs/reminders.md` and `docs/push-notifications.md` pointers, ROADMAP row, CHANGELOG Added entry; verify `make docs-check`
  - Done: the guide with its screenshot (`scripts/docs-screenshots.mjs` entry), `docs/README.md` row, the pointer in `docs/push-notifications.md`, ROADMAP row in §6, CHANGELOG upgrade note and Added entry. The guide cites `reminders` until the archive adds the new `notification-channels` spec to its `specs:` list.
- [x] 4.2 `make check` (TZ=UTC) passes
