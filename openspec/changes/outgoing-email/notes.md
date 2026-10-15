# Implementation notes

## Status (2026-10-15)

Server side done on `feat/outgoing-email`: configuration (`internal/config/smtp.go`), `internal/mail` (settings service, net/smtp transport with STARTTLS-before-AUTH and LOGIN fallback, 36 embedded templates, limiter, audit), `internal/mail/smtptest`, owner routes, self-service and admin resets, verified sign-up (migration 0031), `send` on invitations and project invites, demo deny rules, docs for the API and self-hosting, web `lib/api.ts` and `lib/types.ts`.

Screens done after ux-overhaul landed (2026-10-15): `OutgoingEmailPanel` (owner only, in Administration), `/forgot` and `/verify/<token>` (`EmailScreens.tsx`), the "Forgot password?" link and the "check your email" state in `AuthScreen`, the send-or-link choice in the Users panel, and "Send by email" on server invitations and project invite links. Docs: `docs/settings.md` and `docs/sharing.md`.

## Smoke test (2026-10-15, task 7.2)

Setup: `./bin/opentodo` on 127.0.0.1:18080 with `OPENTODO_BASE_URL=http://127.0.0.1:18080` and `OPENTODO_ALLOW_SIGNUP=true`. The mail server was a plain SMTP sink on 127.0.0.1:2525 (a 40-line Python script that writes each message to a file; no TLS, so security `none` without credentials). The browser was headless Chromium.

- **Configure and test.** Settings → Administration → Outgoing email: Configure, then server, port, security "None (plain)" and From, then Save. The card showed "Configured · 127.0.0.1:2525 · from OpenTodo <todo@example.com>" and the plaintext warning. **Send test email** answered "Test sent to owner@example.com", and the sink received the message.
- **Invite by email.** Members → New invitation with bob@example.com: **Send by email** was on by default. The dialog said "The invitation was sent to bob@example.com." and still showed the link. The sink got the message with the `/invite/` link.
- **Verified sign-up, German browser** (`de-DE`). The sign-in screen showed **Forgot password?**. Signing up as greta@example.com showed "Check your email". The message subject was "Bestätige dein OpenTodo-Konto". Opening the `/verify/` link showed the address and **Create my account**. Pressing it signed Greta in as a member.
- **Forgot password.** `/forgot` with Greta's address showed the neutral confirmation. The reset message arrived. Setting a new password through its link worked, and Greta signed in with the new password.

Not done here: a real provider (Gmail app password, Microsoft 365 LOGIN) and implicit TLS or STARTTLS against a real server. `internal/mail` tests cover STARTTLS-before-AUTH and the LOGIN fallback against `smtptest`.

## Decisions taken while implementing

- Verified sign-up needs the transaction to discard the pending row on `signup_closed` and `email_taken`, so `CompleteSignup` commits the deletion before returning those errors.
- A self-service reset that hits the per-address limit is refused before a link is issued (`mail.Service.Limited`), because issuing revokes the earlier links: a flood of requests cannot invalidate the link the person already received.
- The per-email limit of 3 per hour from design D5 is not applied: the spec's "five messages are sent, the sixth is not" scenario is the controlling rule.
- The last test outcome is kept in the `smtp.last_test` settings row so the panel can lead with it; any configuration change clears it.
- Migration 0032: `calendar-feeds` (earlier in the roadmap) holds 0031. Until it merges, main jumps from 0030 to 0032, which the runner accepts; it must not merge after this change.
- An inviter without a display name is shown as a localized "Someone", never by address.
- The availability flag (`lib/outgoingEmail.ts`) comes from the authentication status, and the owner's panel updates it on load and on save. Without that, an owner who configures SMTP would not see "Send by email" until a reload.
- The Users panel's choice dialog creates the link directly ("Create reset link"), without a second confirmation. A failed send opens the link confirmation, with the server's error shown above it.
- `/forgot` and `/verify` sit outside the shell, like `/reset`. They are on the page-template test's `OUTSIDE_SHELL` list.
