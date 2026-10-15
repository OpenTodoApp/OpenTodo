# Implementation notes

## Status (2026-10-15)

Server side done on `feat/outgoing-email`: configuration (`internal/config/smtp.go`), `internal/mail` (settings service, net/smtp transport with STARTTLS-before-AUTH and LOGIN fallback, 36 embedded templates, limiter, audit), `internal/mail/smtptest`, owner routes, self-service and admin resets, verified sign-up (migration 0031), `send` on invitations and project invites, demo deny rules, docs for the API and self-hosting, web `lib/api.ts` and `lib/types.ts`.

Held until the ux-overhaul group 1 and 2 PRs merge (coordination with the ux-overhaul session): the screens in `web/src/app` (3.2, 4.2, 5.3, 6.2), their docs (`docs/settings.md`, `docs/sharing.md`, the rest of 4.3 and 6.3), the browser smoke test (7.2) and `make check` (7.3).

## Decisions taken while implementing

- Verified sign-up needs the transaction to discard the pending row on `signup_closed` and `email_taken`, so `CompleteSignup` commits the deletion before returning those errors.
- A self-service reset that hits the per-address limit is refused before a link is issued (`mail.Service.Limited`), because issuing revokes the earlier links: a flood of requests cannot invalidate the link the person already received.
- The per-email limit of 3 per hour from design D5 is not applied: the spec's "five messages are sent, the sixth is not" scenario is the controlling rule.
- The last test outcome is kept in the `smtp.last_test` settings row so the panel can lead with it; any configuration change clears it.
- Migration 0032: `calendar-feeds` (earlier in the roadmap) holds 0031. Until it merges, main jumps from 0030 to 0032, which the runner accepts; it must not merge after this change.
- An inviter without a display name is shown as a localized "Someone", never by address.
