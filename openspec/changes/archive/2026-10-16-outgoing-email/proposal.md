# Outgoing email

## Why

OpenTodo cannot send a single email. Every flow that needs to reach a person hands a link to an administrator instead: a forgotten password means asking the owner for a reset link (`docs/account-security.md:64`, `POST /api/v1/users/{id}/password-reset` in `internal/httpapi/users.go:178-205`), an invitation is a link the creator copies (`internal/httpapi/server.go:876`), a project invite link likewise (`project-sharing`), and open sign-up (`OPENTODO_ALLOW_SIGNUP=true`) accepts any address without checking that someone reads it (`internal/auth/service.go:173-235`). For a household or small team this is a daily nuisance, and it is the first thing the hosted offering needs (`multi-tenant-host` design D6, phase 2). The server already speaks IMAP for email capture with the standard library (`internal/email/imap.go`), so sending over SMTP the same way is a small, dependency-free addition.

## What Changes

- **Optional SMTP transport.** The owner configures an SMTP server in Settings → Server → Outgoing email, or the operator sets `OPENTODO_SMTP_*` variables (each one set overrides and locks that field, as `OPENTODO_OIDC_*` does for single sign-on). The password lives in `<data>/secrets/smtp.json`, never in the database. Implicit TLS or STARTTLS; credentials are never sent in clear. A "Send test email" action mails the owner and reports the SMTP outcome. **Without configuration nothing changes:** no route sends, no screen offers email, the server makes no outbound connection.
- **Self-service password reset.** The sign-in screen gets "Forgot password?" when outgoing email is configured. `POST /api/v1/auth/password-reset` with an email answers neutrally and mails a single-use link, valid 24 hours, that opens the existing `/reset/<token>` screen. Administrators can also send their reset link by email instead of copying it.
- **Verified open sign-up.** When open sign-up is on and outgoing email is configured, registering creates no account until the person opens a verification link (valid 24 hours) from `/verify/<token>`. The response is the same whether or not the address already has an account, so sign-up no longer reveals who has one.
- **Invitations and project invite links by email.** An invitation or project invite link bound to an email can be sent by the server (`send: true`); the share dialog and the Members panel get a "Send by email" option. The link is still shown once to the creator.
- **Templates in six languages.** Subject and plain-text body for each message kind in English, German, French, Spanish, Italian and Portuguese (the quick-add languages). The language is the first supported one in the `Accept-Language` header of the request that causes the message (the visitor for sign-up and reset, the creator for invitations), falling back to English; `app-localization` will replace this with the user's synced preference later.
- **Limits, audit, privacy.** Per-recipient and per-server sending limits; `email.sent` and `email.failed` audit events that record the kind and recipient but never a body or a link; messages built for an account with end-to-end encryption on carry no task content (nothing in this change does, and the rule binds every later message kind such as the digest in `stats-and-review`). On a demo instance the transport is never built and the new anonymous routes are refused.

Out of scope:
- The digest email (roadmap row 9 mentions a daily digest; `stats-and-review` specifies a weekly review digest on this transport instead, so the two are not designed twice).
- Email notifications for mentions, assignments or comments, and any HTML message body. Messages are plain text.
- Email change with re-verification, and verification for accounts created by administrators, invitations or single sign-on (their address was vouched for by whoever created them).
- A built-in SMTP receiver (`email-smtp-receiver`, Future ideas) and changes to email capture.
- Host-level mail configuration for host mode (`multi-tenant-host` phase 3 moves the owner panel to the host).

ROADMAP: advances row 9 of "Next: Parity and depth" (`outgoing-email`), phase 2 of `multi-tenant-host` split out. Refinements recorded: templates are plain text; the language comes from `Accept-Language` until `app-localization` ships; the digest moves to `stats-and-review`.

Nothing here is **BREAKING**: every new environment variable is optional, the op log is untouched, and no dependency is added.

## Capabilities

### New Capabilities
- `outgoing-email`: the optional SMTP transport: configuration by owner settings or environment with the password in the secrets directory, the test message, which messages exist and in which languages, sending limits, failure and audit behaviour, the no-content rule for encrypted accounts, and the guarantee that nothing is sent without configuration.

### Modified Capabilities
- `account-access`: open sign-up requires email verification when outgoing email is configured (neutral response, pending sign-up, verification route); self-service password reset request; the authentication status reports whether outgoing email is available.
- `user-administration`: an administrator's reset link can be sent by email instead of returned; the Users panel offers it.
- `invitations`: an invitation bound to an email can be sent by the server; the Members panel offers it.
- `project-sharing`: a project invite link bound to an email can be sent by the server; the share dialog offers it.
- `self-hosting`: `OPENTODO_SMTP_*` as optional configuration with all-or-nothing validation.
- `audit-log`: `email.sent` and `email.failed` events and the `settings.changed` events of the SMTP settings.
- `demo-mode`: the new anonymous routes are refused and no email is ever sent on a demo instance.
- `settings-navigation`: the Server section (owner only) carries the Outgoing email card, between Attachments and the audit log; the former per-panel help id resolves to the Server guide.

## Impact

- **Server:** new package `internal/mail` (configuration merge like `internal/oidc/service.go:156-200`, SMTP client on `net/smtp` + `crypto/tls`, templates, limits), `internal/config/smtp.go` mirroring `internal/config/email.go`, routes in `internal/httpapi` (`settings/smtp`, `auth/password-reset`, `auth/verify/{token}`, the `send` flags on invitations, project invites and admin resets), `internal/auth` (pending sign-ups with verification tokens, reset by email, `password_resets` reused), `internal/audit/events.go` (two names, two detail keys), `internal/httpapi/demo.go` (deny list), `cmd/opentodo/main.go` (wiring). One migration (the next free number) for `signup_verifications`.
- **Web:** `AuthScreen` (Forgot password, check-your-email state), new `ForgotScreen` and `VerifyScreen`, router paths `/forgot` and `/verify/<token>`, an `OutgoingEmailPanel` in Settings → Server with a Send test email row, "Send by email" in `MembersPanel`, `UsersPanel` and `InviteLinksSection`, `lib/api.ts` additions, audit labels.
- **API:** three new owner routes, two new anonymous routes, one additive field on `GET /api/v1/auth/status`, additive `send` fields on three existing routes, error codes `smtp_disabled`, `email_failed`, `verification_invalid`.
- **Docs:** new `docs/self-hosting/outgoing-email.md`; `docs/account-security.md`, `docs/invite-people.md`, `docs/settings-server.md`, `docs/api.md`, README configuration table, `docs/README.md` index.
- **Size:** no dependency. About 1,100 lines of Go including the six-language templates and 600 of TSX plus tests; the binary grows by well under 1 MB; the main JS bundle by about 15 kB minified (4 kB gzip). Runtime memory: two rate-limiter maps and no new goroutine (sends are synchronous with a timeout). The container image is unchanged otherwise.
