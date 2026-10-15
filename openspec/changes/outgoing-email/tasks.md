# Tasks

## 1. Configuration and secrets (design D1)

- [x] 1.1 Add `internal/config/smtp.go` parsing `OPENTODO_SMTP_HOST`, `_SECURITY`, `_USER`, `_PASSWORD` / `_PASSWORD_FILE` and `_FROM` with the all-or-nothing rules (host and From together, user and password together, `none` never with a user, bare host → port 587, default security by port), wired into `config.Load`. Verify with table-driven tests in `internal/config/smtp_test.go` for each rule and the file variant, and `go test ./internal/config/...`.
- [x] 1.2 Create `internal/mail` with `Service.Config(ctx)` merging `smtp.*` settings rows, `secrets/smtp.json` and the env overrides into `Config{…, ManagedBy, PasswordSet}`, `Enabled()`, and `Save(ctx, Update)` returning the change list with `managed_by_env` refusals, the password recorded as set/unset, and validation (`port`, `security`, `from`, `username` without password). Verify with tests mirroring `internal/oidc/service_test.go` (env wins and locks, password never in the settings table, backup exclusion by path) and `go test ./internal/mail/...`.

## 2. Transport and templates (design D2, D3, D7, D8)

- [x] 2.1 Implement `mail.Transport.Send` on `net/smtp` and `crypto/tls`: implicit TLS, STARTTLS required before AUTH, `none` without AUTH, PLAIN and the `loginAuth` fallback, 10 s dial and 15 s total budget, failures typed by stage (`connect`, `tls`, `auth`, `send`). Add `internal/mail/smtptest`, an in-process SMTP server (like `internal/oidc/oidctest`) that records envelopes and can refuse STARTTLS or credentials. Verify with tests for each stage, the "no STARTTLS → no credentials sent" case and the timeout, and `go test ./internal/mail/...`.
- [x] 2.2 Add the embedded templates for `verify_signup` (two variants: new address, address with an account), `password_reset`, `invitation`, `project_invite` and `test` in `en`, `de`, `fr`, `es`, `it`, `pt`, the message assembler (quoted-printable body, encoded subject, Message-ID, Date, `Auto-Submitted`, CR/LF rejection in headers) and `LangFrom(acceptLanguage)`. Verify with golden tests per kind and language, a test that the variable set per kind contains no entity content, header-injection tests, and `LangFrom` tests for `de-CH, fr;q=0.8`, `ja` and an absent header.
- [x] 2.3 Add `mail.Limiter` (5 per kind and recipient per hour, 100 transactional per hour server-wide), the `email.sent` / `email.failed` audit events with detail key `email_kind` in `internal/audit/events.go` (`Names`, allow-list, constructors), and the `encrypted_account` refusal for kinds flagged as carrying content. Verify with limiter tests, audit validation tests (unknown key refused, link never in details) and an `e2ee` test with a fake content-bearing kind; `go test ./internal/audit/... ./internal/mail/...`.

## 3. Owner routes and panel (design D1, D9, D10)

- [x] 3.1 Register `GET` / `PUT /api/v1/settings/smtp` (owner; `PUT` behind `requireFresh`) and `POST /api/v1/settings/smtp/test` (owner, `smtpTestLimiter` 5 per 10 min, 404 `smtp_disabled`), add `httpapi.WithMail`, the `outgoingEmail` field of `GET /api/v1/auth/status`, and the wiring in `cmd/opentodo/main.go` (no mailer on a demo instance). Verify with `internal/httpapi` tests for every scenario of the `outgoing-email` spec's configuration, password, test and availability requirements, including the demo status, and `go test ./...`.
- [x] 3.2 Build `OutgoingEmailPanel` (state-first card, "Configure" inline form with env-locked read-only fields, plaintext warning for `none`, "Send test email" with the outcome, offline state, help id `settings/outgoing-email`), mount it for the owner in `AdministrationSections`, update the Administration description in `settingsSections.ts`, and add a story to `administrationSettings.stories.tsx`. Verify with component tests (not configured, configured with a failed `auth` test, admin sees no card, offline) plus the `settingsSections` test, `npm test` and `npm run build` in web/, and `make ui-check`.
- [x] 3.3 Document the panel in `docs/settings.md` (Administration) and write `docs/self-hosting/outgoing-email.md` (what it enables, Settings and environment configuration, Docker secret for the password, provider notes for Gmail app passwords, Microsoft 365 LOGIN, local relays with `none`, troubleshooting by stage, security notes) with `specs: [outgoing-email]`; add the row to `docs/README.md`, the variables to the README configuration table and the routes to `docs/api.md`. Verify with `make docs-check`.

## 4. Self-service password reset (design D5, D6)

- [x] 4.1 Add `auth.Service.RequestPasswordReset(ctx, email)` (lookup by normalised email, active account, not SSO-only, `issueResetTx` with no actor, revoke on send failure) and `POST /api/v1/auth/password-reset` (anonymous, `s.limiter` per address, 404 `smtp_disabled`, 400 `invalid_input`, 202 always, 200 ms minimum response time), plus `send: true` on `POST /api/v1/users/{id}/password-reset` (201 with `sent` and no `link`, 502 `email_failed` with the link revoked, 409 `smtp_disabled`). Verify with `httpapi` tests for every scenario of the `account-access` "Self-service password reset request" and `user-administration` "Password reset links" requirements, a timing test comparing known and unknown addresses, and `go test ./...`.
- [x] 4.2 Add `/forgot` to `router.ts`, `ForgotScreen`, the "Forgot password?" link in `AuthScreen` (only with `outgoingEmail.enabled` and not SSO-only), the "Send reset email" / "Create reset link" choice in `UsersPanel`, and `lib/api.ts` methods. Verify with component tests (link absent without outgoing email, neutral confirmation, offline message, Users panel sent state and failure fallback), `npm test` and `npm run build`.
- [x] 4.3 Update `docs/account-security.md` ("Forgot it?" paragraph) and the Users part of `docs/settings.md`. Verify with `make docs-check`.

## 5. Verified open sign-up (design D4)

- [x] 5.1 Add the `signup_verifications` migration (next free number) and `auth.Service.BeginSignup` / `CompleteSignup` / `PruneSignups` (replace a pending row per email, 24 h expiry, policy and unique-email re-check in the completing transaction, account creation through the existing insert), hooked into the hourly pruner. Verify with `internal/auth` tests for replace, expiry, used, policy changed and the race with an invitation, and `go test ./internal/auth/...`.
- [x] 5.2 Route the 202 path in `handleRegister` when open sign-up, outgoing email and no invitation apply (same 202 and the "already has an account" message for taken addresses), add `GET` / `POST /api/v1/auth/verify/{token}` (anonymous, `s.limiter`, 404 `verification_invalid`, session start on completion, `login.succeeded` with method `register`), redact the token in the request logger, and add both anonymous routes to the demo deny list. Verify with `httpapi` tests for every scenario of the modified "Sign-up policy", "Verifying a pending sign-up" and demo "Restricted features" requirements, including that servers without mail keep creating accounts directly, and `go test ./...`.
- [x] 5.3 Add `/verify/<token>` to `router.ts`, `VerifyScreen` (preview, "Create my account" button, invalid and offline states), and the "check your email" state with resend in `AuthScreen`. Verify with component tests (no completion on load, invalid link, resend posts registration again), `npm test` and `npm run build`.
- [x] 5.4 Document verified sign-up in `docs/self-hosting/outgoing-email.md` and the open sign-up paragraph of `docs/self-hosting/docker.md`. Verify with `make docs-check`.

## 6. Invitations and project invites by email (design D6)

- [x] 6.1 Accept `send` on `POST /api/v1/invitations` and `POST /api/v1/projects/{id}/invites` (400 without `email`, 409 `smtp_disabled`, send after commit, revoke and 502 `email_failed` on failure, `sent: true` in the response; `project_invite` template without the project name). Verify with `httpapi` tests for the new scenarios of the `invitations` and `project-sharing` deltas and the audit scenarios of the `audit-log` delta, and `go test ./...`.
- [x] 6.2 Add the "Send by email" checkbox (default on, shown only with an email and `outgoingEmail.enabled`) and the sent confirmation to `MembersPanel` and `InviteLinksSection`, with `send` in the API client. Verify with component tests (option absent without outgoing email, sent message with the link still shown once), `npm test` and `npm run build`.
- [x] 6.3 Update `docs/sharing.md` ("Invite someone new", "Invite with a link") and `docs/api.md` (`send` fields, new error codes). Verify with `make docs-check`.

## 7. Integration

- [x] 7.1 Run the full existing `internal/httpapi` and web suites with no mailer configured and assert no test changed its expectation (nothing changes without configuration); add one `cli-smoke`-style end-to-end test against `smtptest`: configure through the API, send a test, request a reset, use the mailed link, sign in with the new password. Verify with `go test ./...`.
- [x] 7.2 Manual smoke on `make dev` with a local SMTP sink (for example `smtptest` run as a binary, or any relay on the LAN): configure in Settings, send a test, invite by email, verify a sign-up in a German browser profile, reset a password. Record the result in the change folder notes.
- [x] 7.3 Run `make check` (go test, web test and build, ui lint, docs check, openspec validate). Verify it passes.

## Workflow follow-up

- Add the CHANGELOG.md entry under Unreleased ("Outgoing email: optional SMTP, forgot password, verified sign-up, invitations by email").
- Update `multi-tenant-host/tasks.md` phase 2 to point at this change, and its design D6 to cite the shipped decisions.
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes.
