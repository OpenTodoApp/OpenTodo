# Design: outgoing email

## Context

See proposal.md (Why). The current state that shapes the approach:

- **No sender exists; three precedents do.** Email capture reads IMAP with the standard library and refuses credentials without TLS (`internal/email/imap.go:45-153`: implicit TLS on 993, STARTTLS required elsewhere, `insecurePlaintext` for tests only). Its variables are all-or-nothing with `_PASSWORD_FILE` support (`internal/config/email.go:52-150`). Single sign-on merges owner settings with `OPENTODO_OIDC_*` overrides, reports `managedBy` per field, refuses writes to locked fields, and keeps the client secret in `<data>/secrets/oidc.json` (`internal/oidc/service.go:23-60,156-200,258-350`; `internal/settings/secrets.go`). The push test route is the model for a diagnostic that reports the remote service's outcome instead of a guess (`internal/httpapi/push.go:41-91`, `reminders` "Push test route").
- **Links already exist; only their delivery is manual.** Reset links: `issueResetTx` revokes earlier links, stores a hash, audits `password.reset_issued` (`internal/auth/users.go:397-420`); the anonymous `/reset/<token>` routes and screen exist (`internal/httpapi/users.go:254-288`, `web/src/app/ResetScreen.tsx`). Invitations and project invites return `link` once (`internal/httpapi/server.go:876`, `internal/httpapi/projectinvites.go`). Registration creates the account and session in one go (`internal/httpapi/server.go:556-600`, `internal/auth/service.go:173-235`).
- **Background jobs run on one process only** (`runJobsWhenLeader`, `cmd/opentodo/main.go:195-227`); the demo instance skips webhooks and email capture there and refuses routes by prefix (`internal/httpapi/demo.go:113-140`).
- **The audit catalogue is closed** with an allow-list of detail keys (`internal/audit/events.go:26-73,141-170`); `email` is already an allowed key ("snapshot of the account's email").
- **No user language exists.** Quick-add languages are per device (`web/src/lib/nlp/settings.ts`); `app-localization` will add a synced preference later.
- **End-to-end encryption:** server-built text must never carry content of an encrypted account; push falls back to content-free text (`internal/push/service.go:313-317`, `internal/e2ee/e2ee.go`).

## Goals / Non-Goals

**Goals:**
- One `internal/mail` package that every message goes through: configuration, transport, templates, limits and audit in one place, so later kinds (the digest) inherit the rules.
- Zero behaviour change without configuration, verified by tests that run the existing suites with the mailer absent.
- Anonymous flows that reveal nothing about accounts, with the same timing whether or not the address exists.
- Standard library only.

**Non-Goals:**
- A delivery queue with retries, bounces or delivery tracking.
- HTML mail, branding, attachments.
- Any change to email capture.

## Decisions

### D1. Configuration: settings keys plus `OPENTODO_SMTP_*` overrides, password in `secrets/smtp.json`

Settings keys `smtp.host`, `smtp.port`, `smtp.security`, `smtp.user`, `smtp.from` (JSON values in the `settings` table, as `oidc.*`). The password is key `smtp.password` of `settings.NewSecretsFile(dataDir, "smtp")`, so backups (which exclude `secrets/`) never contain it. `internal/config/smtp.go` parses `OPENTODO_SMTP_HOST` (host or `host:port`; a bare host gets port 587), `OPENTODO_SMTP_SECURITY` (`tls` | `starttls` | `none`; default `tls` for port 465, `starttls` otherwise), `OPENTODO_SMTP_USER`, `OPENTODO_SMTP_PASSWORD` or `_PASSWORD_FILE` (one of them, trailing line break stripped, as `email.go:62-74`), `OPENTODO_SMTP_FROM` (`addr` or `Name <addr>`, validated with `net/mail`). Rules: `HOST` and `FROM` together, `USER` and a password together, `none` never with a user; a violation stops startup naming the variable. `mail.Service.Config(ctx)` merges like `oidc.Service.Config`: an env value wins and marks `ManagedBy[field] = "env"`; `Save` refuses a change to a locked field with `managed_by_env`. `Enabled()` is "host and From present".

- **Alternative: environment only.** Rejected. The owner-settings path is what `multi-tenant-host` D4 needs to move to the host later, and a Coolify user should not have to redeploy to change a mail password.
- **Alternative: a single `OPENTODO_SMTP_URL` (`smtps://user:pass@host`).** Rejected: passwords in URLs end up in shell history and compose files; the file variant could not be expressed.

### D2. Transport: `net/smtp` with an explicit TLS policy, synchronous, 15-second budget

`mail.Transport.Send(ctx, msg)`: dial with a 10 s connect timeout (`net.Dialer`), implicit TLS (`tls.Client`, `MinVersion: TLS 1.2`, server name = host) for `tls`; for `starttls` dial plain, `smtp.NewClient`, require `c.Extension("STARTTLS")` and call `c.StartTLS` before anything else, else fail at stage `tls`; for `none` no TLS and no AUTH. Authentication uses `smtp.PlainAuth` (which itself refuses non-TLS connections) and, when the server advertises only `LOGIN`, a 20-line `loginAuth` implementing `smtp.Auth` (Microsoft 365 and some relays offer LOGIN only; the standard library has PLAIN and CRAM-MD5). `smtp.SendMail` is not used because it does not require STARTTLS. Stages reported: `connect`, `tls`, `auth`, `send`. The whole call is bounded by the request context plus a 15 s deadline; the connection is closed on cancellation.

Sends are synchronous inside the request (or the digest tick). Nothing is queued, nothing is retried: a failed invitation or reset is answered `502 email_failed` after revoking what was created, so no secret dangles that nobody received; anonymous flows keep their neutral answer. This follows `multi-tenant-host` D6 ("never retried in a tight loop") at the smallest size.

- **Alternative: a persistent outbox table with a worker, like `internal/webhook/worker.go`.** Rejected for now: a table, a worker, retry policy and a UI for stuck messages, for flows where the person can simply ask again. The `mail.Sender` interface leaves room for it.

### D3. Messages: five kinds, plain text, six languages, language from `Accept-Language`

`mail.Message{Kind, To, Lang, Vars}` rendered by `internal/mail/templates/<kind>.<lang>.txt` (plain text with `{{.Field}}` placeholders filled by `strings.Replacer`, embedded, subject on the first line; `text/template` was dropped before 0.5.0 because its reflection kept the linker from pruning the Anthropic SDK and grew the binary from 23 to 37 MB). Kinds: `verify_signup`, `password_reset`, `invitation`, `project_invite`, `test`. Variables are limited to: server origin, link, expiry in hours, inviter display name, project role. No entity content ever enters a template; a test asserts the variable set per kind. Headers: `From` (configured), `To`, `Subject` (`mime.QEncoding` when non-ASCII), `Date`, `Message-ID` (`<ulid@host-of-origin>`), `MIME-Version`, `Content-Type: text/plain; charset=utf-8`, `Content-Transfer-Encoding: quoted-printable` (`mime/quotedprintable`), `Auto-Submitted: auto-generated`, `X-Auto-Response-Suppress: All`. Header values are checked for CR/LF before assembly. The envelope sender is the From address, so bounces go to the operator's mailbox.

Language: `mail.LangFrom(acceptLanguage string)` parses the header (`q` values honoured), returns the first of `en de fr es it pt` by primary subtag, else `en`. Callers pass `r.Header.Get("Accept-Language")`; a pending sign-up stores the language so a resend matches. The invitee's own language is unknown; the creator's is the best available signal and the templates say in the first line, in that language, what the message is. When `app-localization` ships, the synced preference replaces the header for signed-in recipients without touching templates.

- **Alternative: HTML with a plain-text part.** Rejected: twice the templates, rendering differences across clients, and tracking-pixel suspicion for no functional gain; every message is one link.
- **Alternative: English only until `app-localization`.** Rejected by the roadmap row; the six-language set is the quick-add set and the templates are short.

### D4. Verified open sign-up: a pending sign-up, no account until the link is used

New table `signup_verifications` (migration with the next free number): `id`, `token_hash` (unique), `email` (lower-cased, unique: a new registration replaces the pending row), `name`, `password_hash`, `lang`, `created_at`, `expires_at`. `auth.Service.BeginSignup` runs only when `n > 0`, no invitation, no project invite, open sign-up on and the mailer enabled (`RegisterWithSetupToken` keeps every other path, `internal/auth/service.go:173-235`). If the address already has an account the server stores nothing and sends a `verify_signup` variant ("you already have an account; use Forgot password") so the 202 and the timing are the same. `CompleteSignup(token)` re-checks the policy and the unique email inside the transaction and creates the account through the existing insert, then the handler starts a session as `handleRegister` does. Secrets are `otv_` + 32 random bytes (`ids.Secret`), 24 h. Expired rows are pruned by the hourly audit pruner tick (`RunPruner`) to keep one background loop. Accounts created by invitations, project invites, administrators or single sign-on are not verified: someone with authority vouched for the address, and the invitation flow must keep working on servers without mail.

The verification completes on `POST`, never on `GET`, because mail scanners fetch links; the screen shows one button.

- **Alternative: create the account with `email_verified_at NULL` and refuse sign-in until verified.** Rejected: an unverified row blocks the address for its real owner, needs a cleanup job and a new sign-in error, and leaks existence through `email_taken`.
- **Alternative: an owner switch "require verification".** Rejected for now: open sign-up without verification on a server that can send mail has no use case the switch would serve; it can be added as a setting later without changing routes. Noted as an assumption for the maintainer.

### D5. Self-service reset reuses `password_resets`

`POST /api/v1/auth/password-reset` (anonymous, `s.limiter` per client address like sign-in, plus a per-email limit of 3 per hour inside the mailer's recipient limit) looks the account up by normalised email; for an active account outside SSO-only mode it calls `issueResetTx` with an empty actor (as `IssueOwnerPasswordReset` does, `users.go:425-446`) and sends `password_reset`. The existing `/reset/<token>` preview and use routes, screen, session revocation and `password.reset_completed` event are unchanged. A send failure revokes the link in a second statement and is audited; the answer stays 202. The administrator's route gains `send: true` (D6 for the response shape). Deactivated and unknown addresses run the same code path up to the point of issuing; the mailer is not called, and the handler pads every answer to the same minimum response time (200 ms) so timing does not reveal whether the address exists.

### D6. `send` on invitations, project invites and admin resets

Each creation handler accepts `send` (boolean). Rules: needs `email` (400), needs the mailer (409 `smtp_disabled`), creates as today, commits, then sends; on failure it revokes what it created (`RevokeInvitation` / project invite revoke / reset revoke) and answers 502 `email_failed`. Invitations and project invites still return `link` with `sent: true` (the creator may want to paste it in a chat too, and the secret was going to be shown to them anyway). The admin reset returns `sent: true` without `link`: the point of sending is that the administrator never handles the secret, and the Users panel offers the link variant separately. The template for `project_invite` names the inviter and the role, not the project name: project names are content (`e2ee.ContentFields`) and the audit rules already keep them out of events.

### D7. Limits and audit

`mail.Limiter`: a sliding window per `(kind, recipient)` of 5 per hour and a server-wide window of 100 transactional messages per hour (the digest in `stats-and-review` is paced by its scheduler and exempt from the server-wide window, not from the per-recipient one). Test messages use `s.smtpTestLimiter` (5 per 10 minutes per account, as the push test). Audit: names `email.sent` and `email.failed` (past tense like the rest), detail keys `email_kind` (new) and `email` (existing), `reason` for failures (`connect`, `tls`, `auth`, `send`, `rate_limited`, `encrypted_account`). `settings.changed` entries for `smtp.*` come from `Save`'s change list as for OIDC, with `smtp.password` recorded as `""` → `set` or `set` → `""`. The request logger must not log the token path segments of `/api/v1/auth/verify/{token}`, which follows the pattern used for invitations and project invites.

### D8. Encrypted accounts

`mail.Service.Build` takes the recipient's account id when known and, before rendering, asks `e2ee.Store.Enabled`; a kind flagged `carriesContent` is refused with reason `encrypted_account`. None of this change's kinds carries content, so for them the check is a no-op by construction; the flag exists so the digest cannot forget the rule.

### D9. Client

- `lib/api.ts`: `smtpSettings()`, `saveSmtpSettings()`, `testSmtp()`, `requestPasswordReset()`, `verifyPreview()`, `verifyComplete()`; `send` in `createInvitation`, `createProjectInvite`, `issueReset`. `AuthStatus` gains `outgoingEmail: {enabled}`.
- Routes `/forgot` and `/verify/<token>` in `router.ts` (next to `/reset`, `router.ts:91-101`).
- `AuthScreen`: "Forgot password?" under the password field when enabled and not SSO-only; a "check your email" state after a 202 with a resend button that posts the same registration again (rate limited server-side).
- `ForgotScreen`, `VerifyScreen`: the card style of `ResetScreen`, with loading, offline (retries when online), invalid and ready states.
- `OutgoingEmailPanel` on the Settings → Server page (owner only, after Attachments and before the audit log): a `SettingsSection` card with a state-first `SettingRow` (`settings-navigation` "Panel cards and rows", "State-first panel summaries"; the state is a badge beside the label, no header action and no help link in the card), "Configure" opens the form inline (host, port, the design-system `Select` for security, username, password with "leave empty to keep", From), locked fields rendered read-only with "Set by OPENTODO_SMTP_HOST", a "Send test email" button with the outcome line and a plaintext warning when security is `none`. The page header carries Help; the legacy screen id `settings/outgoing-email` maps to `settings/server` in `LEGACY_HELP_SCREENS` and `docs/settings-server.md` claims it. The Server description in `settingsSections.ts` becomes "Backups, attachments, outgoing email and the audit log", and `settingsIndex.ts` gets an "Outgoing email" row (keywords `smtp`, `mail`) so Settings search and the palette find it.
- "Send by email" checkbox (default on) in `MembersPanel` and `InviteLinksSection` when an email is typed and `outgoingEmail.enabled`; `UsersPanel` reset confirmation gets two actions, "Send reset email" and "Create reset link".
- Audit labels for the two new events; the Server page's demo note names outgoing email next to backups, and the card is rendered with its controls disabled there (the demo never builds the mailer).

The panel was first planned for Administration; after `ux-overhaul` reshaped Settings into nine sections it lives in Server, the owner-only section beside Backups and Attachments, which avoids an owner-only card inside the owner-and-admins People section. The spec records the visibility rule explicitly so the placement is testable.

### D10. Wiring and the demo

`main.go` builds `mail.New(db, dataDir, cfg.SMTP, mail.Options{Audit, Log, E2EE})` and passes `httpapi.WithMail(svc)`; on a demo instance it passes nothing, so `s.mail == nil` means "unconfigured" everywhere and the status reports `enabled: false` regardless of variables. `demo.go` adds `{"Password resets", false, prefix("/api/v1/auth/password-reset")}` and `{"Sign-up", false, prefix("/api/v1/auth/verify")}`; `/api/v1/settings` is already denied.

**Data model impact:** one new server table (`signup_verifications`); `password_resets`, `invitations` and `project_invites` are unchanged. No op field, no entity, no change to the op log, nothing synced; offline behaviour and convergence are unaffected. Settings rows `smtp.*` and the file `secrets/smtp.json` are additive.

### Interface budget (added after ux-overhaul)

- The Outgoing email card is one more card on the Settings → Server page, for the owner only. The forgot-password and verification screens sit outside the shell.
- "Forgot password?" is one line under the password field. "Send by email" is one checkbox that appears only once an address is typed. The reset choice replaces the existing confirmation dialog.
- No new scroll region, sidebar destination, task property, chrome row above a list, or shortcut.

## Risks / Trade-offs

- **[The server becomes a mail relay for abuse]** → Only fixed recipients: the owner (test), an account's own address (reset), the bound address of an invitation created by an owner or admin, or a self-registered address with open sign-up on. Per-recipient and server-wide limits (D7), demo refusal (D10). Open sign-up plus verification mail is the only anonymous-to-arbitrary-address path and is limited per client address and per recipient.
- **[Account enumeration through the new anonymous routes]** → Neutral 202 with a minimum response time (D5), verification 202 for taken addresses with a different message body (D4), the same 404 shape for every invalid token.
- **[Synchronous sends slow a request when the relay is slow]** → 10 s connect, 15 s total; the UI shows "Sending…" and the server's outcome. Operators who need more run a local relay.
- **[Wrong language for invitees]** → The first line of every message says in its language what it is and a reader can see the link regardless; `app-localization` improves it for signed-in recipients.
- **[Mail scanners consume links]** → Verification completes only on POST from the page (D4). Reset links already preview on GET and act on POST.
- **[A verified sign-up and an invitation race for the same address]** → `CompleteSignup` re-checks the unique email inside its transaction and answers `email_taken`; the person signs in with the account the invitation created.
- **[Operators run plaintext relays]** → Allowed only without credentials and shown with a warning in the panel; credentials always require TLS, as for IMAP.
- **[Size]** → No dependency. Templates are 30 small text files embedded in the binary (under 50 kB); Go code about 1,100 lines; JS about 15 kB minified. No new goroutine; two limiter maps bounded by their windows. Container image unchanged.

## Migration Plan

One additive migration creates `signup_verifications`. No data changes meaning; servers without configuration behave as before. Rollback is a revert: the table stays empty and unread, `smtp.*` settings rows and `secrets/smtp.json` are ignored by the previous binary, and links already issued keep working through the unchanged `password_resets` and invitation tables.

## Open Questions

- Whether the owner should be able to require verification for accounts created by project invite links when members may bring new people (`project_invites.members_create_accounts`). Today those links vouch for the address; adding verification there would be a flag on the link, settled when someone needs it, without changing these specs.
