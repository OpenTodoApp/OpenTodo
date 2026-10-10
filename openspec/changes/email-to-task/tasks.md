# Tasks

## 1. Configuration and storage

- [x] 1.1 `internal/config`: `OPENTODO_EMAIL_*` variables with defaults, `_PASSWORD_FILE`, all-or-nothing validation, `Email.Enabled()`; verify `TestEmailConfigPartialFails` and `TestEmailConfigDefaults` (`go test ./...`)
- [x] 1.2 Migration `email_inboxes` and `email_receipts`; verify `store.Open` on a fresh dir creates both tables and an upgrade from the previous `user_version` applies cleanly (`go test ./...`)
- [x] 1.3 `internal/email/inbox.go`: get-or-create per-user secret (≥128-bit, URL-safe), rotate, enable/disable, allowlist, hourly count, receipt insert; verify `TestInboxLifecycle` and `TestReceiptDedup`

## 2. Message processing

- [x] 2.1 `internal/email/parse.go`: subject prefix stripping, plain-text preference, HTML-to-text fallback, 16 KB truncation note, attachment name and size listing, 10 MB cap; verify table-driven `TestParseMessage` with fixture `.eml` files (plain, HTML-only, multipart with PDF, no subject)
- [x] 2.2 `internal/email/route.go`: recipient secret extraction from `Delivered-To`, `X-Original-To`, `To`, `Cc`, case-insensitive; verify `TestRouteRecipient`
- [x] 2.3 `internal/email/process.go`: checks (enabled, allowlist, cap) → receipt + ops with `device: "server"` in one transaction via `sync.Apply`; verify `TestProcessCreatesTaskOnce` (second call with same Message-ID creates nothing), `TestRateCap` (70 → 60), `TestAllowlistRejects`, `TestUnknownSecretDiscarded`

## 3. IMAP poller

- [x] 3.1 Add the pure-Go IMAP client dependency (pinned), `internal/email/imap.go` behind a `Source` interface, connect with TLS/STARTTLS, search unseen, size-capped fetch, mark/move/delete; verify `TestPollerAgainstFakeSource` using an in-memory `Source`, and record binary size delta in the PR description (implemented as a stdlib client with no dependency, see design D3: +224 KB)
- [x] 3.2 Ticker goroutine started from `cmd/opentodo` only when enabled, graceful shutdown, error logged once per interval without content, resume after outage; verify `TestPollerSurvivesSourceErrors` and that `go test ./...` passes with the feature disabled by default

## 4. HTTP API

- [x] 4.1 Routes `GET/PATCH /api/v1/email-inbox` and `POST /api/v1/email-inbox/rotate` with `requireAuth`, 409 `email_disabled` when not configured, 400 `invalid_input` on a bad allowlist; verify `TestEmailInboxRoutes` covering 401, 400, 409 and success, and that no response contains mailbox credentials
- [x] 4.2 `docs/api.md` section for the routes; verify examples match the handlers

## 5. Web app

- [x] 5.1 `SettingsView.tsx`: "Email to task" section (operator-disabled message, address with copy, rotate with confirmation, enable switch, allowlist editor), `lib/api.ts` wrappers; verify in the browser against an enabled test server and `npm test && npm run build` pass
- [x] 5.2 Keyboard reachability of every control in the section; verify tabbing reaches copy, rotate, switch and allowlist in order

## 6. Integration and docs

- [x] 6.1 End-to-end test with the fake source: forward fixture → task visible via `GET /api/v1/tasks` → device sync returns the ops; verify `TestEmailToTaskEndToEnd`
- [x] 6.2 `docs/email.md` (instead of `docs/self-hosting/email.md`, see design notes) (mailbox setup with plus addressing or catch-all, Coolify secret file, provider notes), `.env.example`, compose comments, README, CHANGELOG under Unreleased; verify links resolve and `make check` passes

## Notes

- 3.1/3.2 and 6.1 are verified against an in-memory `Source` and an in-process fake IMAP server, not against real providers (Fastmail, Gmail, Microsoft 365, Dovecot); that needs a real mailbox.
- 5.1/5.2 were checked once in a browser against a server with email enabled and an unreachable IMAP host: address shown, copy, rotate with confirmation, allowlist saved, controls tab in the order copy → rotate → switch → allowlist → save.
