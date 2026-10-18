# Bound server resources: password hashing, live streams, push sends, token bookkeeping and request bodies

## Why

The audit found several ways for a few requests to tie up a small server (SEC-5, SEC-6, SEC-7, SEC-14, SEC-15, INT-4, the app-password half of INT-9):

- Every password hash takes 19 MiB and some CPU. Registration hashed the password before checking the sign-up policy, an invitation or the setup token, a reset hashed before checking the link, sign-in hashed passwords of any length, and nothing bounded how many hashes ran at once, so a burst of requests could run a Raspberry Pi out of memory.
- Sign-in with an account that has no password (single sign-on or demo accounts) answered without hashing, so its timing told such accounts apart from unknown addresses.
- Live-update streams were capped only per account (16). Every demo sandbox is a new account, so one client could hold any number of connections and goroutines.
- The reminder scheduler sent every push one after another with a 10 s timeout per send, and an account could register any number of subscriptions, so one account with slow or dead endpoints delayed everyone's reminders for a long time.
- Every request with an API token or app password wrote its last-use time, one write per request on the single database connection; three routes also resolved the token a second time.
- Request bodies accepted unknown fields and data after the JSON value, answered 400 instead of 413 over the size limit, and returned the Go decoder's error text. `docs/api.md` already promised that unknown fields are refused.

## What Changes

- Registration (setup token, invitation, open sign-up, member limit), project invite registration and password reset check their policy before hashing. Password hashing and checking run in at most twice the CPU count slots (at least 2); a request that waits more than a second for a slot gets 503 `busy` with `Retry-After`. Sign-in refuses a password over 1,024 bytes with the usual 401 without hashing it.
- An account without a usable password hash costs the same dummy hash as an unknown address.
- Live-update streams: at most 10 per account (opening one more closes the oldest, as before), 20 per client address and 2,000 per server; beyond the last two the stream is refused with 503 `busy` and `Retry-After`.
- Push: at most 20 subscriptions per account (a new one replaces the least recently registered); reminders are sent for 8 accounts at a time with a 20 s budget per account and pass, the rest waiting for the next pass; a subscription that failed 20 times in a row and delivered nothing for a day is no longer sent to until the device registers it again.
- Last-use times of API tokens and app passwords are written at most once a minute; the session-or-full-token check reads the scope resolved by the authentication middleware.
- One JSON body decoder: unknown fields refused with 400 `bad_request` naming the field (except the sync exchange, the push subscription and passkey credentials, which accept extra fields), data after the value refused, 413 `too_large` over the limit, plain messages instead of decoder text.

Not **BREAKING** for the op log or configuration: no new environment variable, no op or schema change. Clients that sent fields a route does not define now get 400; the web app, the CLI and the browser extension send none (checked).

## Out of scope

- The other SEC and INT findings (limiter rework, authorization policy, CalDAV per-request loading, backups).
- Making the caps configurable at run time; they are constants.
- The comment routes' own body reader (it reports the decoder message as a validation error).

ROADMAP: hardening of existing features (accounts, live updates, reminders, REST API); no ROADMAP item names this change.

## Impact

- Changed: `internal/auth` (password.go, service.go, projectinvites.go, users.go, apppasswords.go, mfa.go), `internal/push` (service.go, subscriptions.go), `internal/sync/notifier.go`, `internal/httpapi` (jsonbody.go, events.go, server.go, mcp.go and every handler that reads a JSON body), tests beside them, `web/src/lib/i18n/errors.ts` and the catalogs (message for `busy`), `docs/api.md`, `docs/sync.md`, `docs/architecture.md`, `CHANGELOG.md`.
- No data model or dependency change.
