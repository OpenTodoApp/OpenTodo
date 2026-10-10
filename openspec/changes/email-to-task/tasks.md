# Tasks

## 1. Configuration and storage

- [ ] 1.1 `internal/config`: `OPENTODO_EMAIL_*` variables with defaults, `_PASSWORD_FILE`, all-or-nothing validation, `Email.Enabled()`; verify `TestEmailConfigPartialFails` and `TestEmailConfigDefaults` (`go test ./...`)
- [ ] 1.2 Migration `email_inboxes` and `email_receipts`; verify `store.Open` on a fresh dir creates both tables and an upgrade from the previous `user_version` applies cleanly (`go test ./...`)
- [ ] 1.3 `internal/email/inbox.go`: get-or-create per-user secret (≥128-bit, URL-safe), rotate, enable/disable, allowlist, hourly count, receipt insert; verify `TestInboxLifecycle` and `TestReceiptDedup`

## 2. Message processing

- [ ] 2.1 `internal/email/parse.go`: subject prefix stripping, plain-text preference, HTML-to-text fallback, 16 KB truncation note, attachment name and size listing, 10 MB cap; verify table-driven `TestParseMessage` with fixture `.eml` files (plain, HTML-only, multipart with PDF, no subject)
- [ ] 2.2 `internal/email/route.go`: recipient secret extraction from `Delivered-To`, `X-Original-To`, `To`, `Cc`, case-insensitive; verify `TestRouteRecipient`
- [ ] 2.3 `internal/email/process.go`: checks (enabled, allowlist, cap) → receipt + ops with `device: "server"` in one transaction via `sync.Apply`; verify `TestProcessCreatesTaskOnce` (second call with same Message-ID creates nothing), `TestRateCap` (70 → 60), `TestAllowlistRejects`, `TestUnknownSecretDiscarded`

## 3. IMAP poller

- [ ] 3.1 Add the pure-Go IMAP client dependency (pinned), `internal/email/imap.go` behind a `Source` interface, connect with TLS/STARTTLS, search unseen, size-capped fetch, mark/move/delete; verify `TestPollerAgainstFakeSource` using an in-memory `Source`, and record binary size delta in the PR description
- [ ] 3.2 Ticker goroutine started from `cmd/opentodo` only when enabled, graceful shutdown, error logged once per interval without content, resume after outage; verify `TestPollerSurvivesSourceErrors` and that `go test ./...` passes with the feature disabled by default

## 4. HTTP API

- [ ] 4.1 Routes `GET/PATCH /api/v1/email-inbox` and `POST /api/v1/email-inbox/rotate` with `requireAuth`, 409 `email_disabled` when not configured, 400 `invalid_input` on a bad allowlist; verify `TestEmailInboxRoutes` covering 401, 400, 409 and success, and that no response contains mailbox credentials
- [ ] 4.2 `docs/api.md` section for the routes; verify examples match the handlers

## 5. Web app

- [ ] 5.1 `SettingsView.tsx`: "Email to task" section (operator-disabled message, address with copy, rotate with confirmation, enable switch, allowlist editor), `lib/api.ts` wrappers; verify in the browser against an enabled test server and `npm test && npm run build` pass
- [ ] 5.2 Keyboard reachability of every control in the section; verify tabbing reaches copy, rotate, switch and allowlist in order

## 6. Integration and docs

- [ ] 6.1 End-to-end test with the fake source: forward fixture → task visible via `GET /api/v1/tasks` → device sync returns the ops; verify `TestEmailToTaskEndToEnd`
- [ ] 6.2 `docs/self-hosting/email.md` (mailbox setup with plus addressing or catch-all, Coolify secret file, provider notes), `.env.example`, compose comments, README, CHANGELOG under Unreleased; verify links resolve and `make check` passes
