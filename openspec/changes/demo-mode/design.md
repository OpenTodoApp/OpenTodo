# Design

## Context

A public demo has three jobs: look good immediately, be safe to leave on the open internet, and stay fresh without an operator. OpenTodo already has everything needed for the data side (the op log, purge markers that tell devices to drop entities, a live wake-up channel) and a single place where every HTTP request passes (the router in `internal/httpapi`). The change adds no new data model and no new route.

## Goals / Non-goals

Goals: one optional variable; seeded data written exactly like server writes; a nightly reset that open browsers survive without a reload or a sign-out; every abusable feature refused with one clear error code; the UI explains rather than fails.

Non-goals: per-visitor sandboxes (all visitors share one account, documented), configurable datasets or reset times, turning demo mode on for a server with real accounts (documented as unsupported).

## Decisions

### D1. One switch, checked at wiring time

`OPENTODO_DEMO` is parsed in `internal/config` like the other booleans (invalid value stops startup). `cmd/opentodo` reacts once: forces sign-up off and web push off, skips the backup presets and scheduler, the email poller and the webhook worker, provisions and seeds before listening, starts the nightly loop and installs a `SIGUSR1` handler. The HTTP layer receives the demo service through `httpapi.WithDemo`; without it the guard is the identity function, so off-by-default changes nothing (existing tests run unchanged).

### D2. The demo account is a member; a hidden owner holds the server

On an empty database the server creates `owner@demo.invalid` with a random 48-hex-character password that is never stored in clear or printed, so the owner role exists (the "first visit creates the owner" screen never appears on a public URL) but nobody can use it. Every owner-only setting stays at its default and the owner-only routes would refuse the demo account even without the guard. The demo account `demo@example.com` / `opentodo-demo` and the collaborator `sam@example.com` (random password) are plain members created by the new `auth.CreateAccount`, a provisioning helper with no route that bypasses the sign-up policy and refuses a second owner. Accounts are looked up by email on every start and reset, so provisioning is idempotent.

Alternative considered: make the demo account the owner and block owner routes. Rejected: one forgotten route would hand a visitor server-wide settings; with a member account the existing role checks are a second line of defence.

### D3. Reset = wipe the demo accounts' scopes with purge markers, then reseed

`sync.WipeAccounts(userIDs)` runs in one transaction:

1. shared projects owned by the accounts are deleted for everyone (ops, `op_scopes`, `scope_fields`, members, backfills, `project_scopes`), as `DeleteAccountData` already does; memberships elsewhere and the accounts' notifications are deleted;
2. the accounts' personal scopes are emptied;
3. for every removed entity a purge marker (`purges` row, seq reserved from the ops sequence) is written into the personal scope of every demo account that could see it.

Then `demo.Service.seed` writes fresh data and `NotifyMembership` wakes every device.

Why this recovers clients cleanly: a device's next exchange from its old cursor receives the markers (they sort after every old op), deletes the rows locally and drops queued ops for them (`removeLocally`, the Trash purge path); the vanished shared project also leaves the `memberships` list, which already makes devices drop it (`storeMemberships`). New entities have new ids and sort after the markers, so the device pulls them in the same exchange. A queued offline edit of a wiped entity is discarded by the existing purge check in `Apply` instead of resurrecting it. Sessions are untouched, so nobody is signed out.

Alternatives considered: bumping the log generation (the backup-restore path) makes devices re-upload everything they hold, which would bring the old demo data straight back; recreating the database file under the data-directory lock needs every open connection and service re-created and signs everyone out. Both rejected.

Schedule: `NextReset` is the next 03:00 UTC; at startup `Stale(seededAt, now)` reseeds when the last seed (`settings` key `demo.seeded_at`) predates the most recent 03:00 UTC, which covers both "older than a day" and "server was down at 03:00". `SIGUSR1` forces a reset for operators and for the browser smoke test; there is deliberately no HTTP route.

Growth: markers are kept like all purge markers, about 100 small rows per reset (roughly 35,000 rows a year); ops, fields and notifications of visitors do not accumulate.

### D4. A deny list in front of the router

`demoGuard` wraps the mux and answers `403 demo_restricted` with "<feature> is disabled on this demo instance." for the rules in `internal/httpapi/demo.go`, before authentication (an anonymous request to a refused feature gets the same answer, never a 401 that invites a retry). Rules match the cleaned path (the mux redirects unclean paths before any handler runs) and either every method or only writes:

| Feature | Paths | Methods |
| --- | --- | --- |
| Sign-up | `/api/v1/auth/register` | writes |
| Single sign-on | `/api/v1/auth/oidc/*` | all |
| Invitations, users, password, identities, tokens, passkeys, two-factor, member MFA reset | `/api/v1/invitations*`, `/users*`, `/me/password`, `/me/identities*`, `/tokens*`, `/passkeys*`, `/mfa*`, `/members*` | writes |
| Password reset links | `/api/v1/password-resets/*` | all |
| Settings, app passwords, backups, webhooks, email inbox, import, encryption, push | `/api/v1/settings/*`, `/app-passwords*`, `/backups*`, `/webhooks*`, `/email-inbox*`, `/import*`, `/encryption/*`, `/push/*` | writes |
| CalDAV, MCP | `/dav*`, `/.well-known/caldav*`, `/mcp*` | all |
| Sharing changes | `/api/v1/projects/{id}/members*`, `/projects/{id}/transfer` | writes |

Reads stay open so the web app renders normally (listing members, reading one's own empty token list). A deny list is the right shape here: the feature set that must keep working (tasks, projects, sections, labels, views, reminders, comments, sync, events, export, Trash, history, notifications) is large and grows with the product, while the refused set is the security-relevant surface that AGENTS.md already enumerates. `TestDemoRestrictedRoutes` pins the list and checks that everyday writes still succeed. Import is refused outright rather than capped: a cap still lets one visitor flood the shared account.

No outbound requests: web push is off, the webhook worker does not run (nothing can be configured anyway), backups and the email poller do not start, the OIDC routes are refused.

### D5. Client: one flag from auth/status

`auth/status` gains `demo: {email, password, resetsAt}` (additive). `web/src/lib/demo.ts` keeps it in a tiny external store (remembered in `localStorage` so the banner also shows offline). The sign-in screen shows a panel with the credentials and "Try the demo" (it calls the normal login with them; no new route). `App` renders the banner above the shell. Settings replaces the restricted sections with one "Demo instance" note listing what is off and renders Import as a disabled button with a note; the share dialog lists members without controls. A refused call that slips through still shows the server's message.

### D6. Seed data as static tables

The seed is a port of `scripts/screenshots.mjs`, declared as slices of constant structs (labels, projects, sections, tasks, views) plus a short list of follow-up edits, comments and reminders. Keys stand for ids, due dates are "<days from today>[ HH:MM]". Every entity is one `ApplyStrict` batch from device `server` with strictly increasing timestamps just before now, the same path as REST writes, so recurrence, assignment, comment authorship and scope rules all apply. A first version with map literals cost 209 KB of binary; the table form costs a quarter of that.

## Data model impact

None. No migration (0026 was not needed), no new op field or entity, no renamed field. `auth/status` gains an optional `demo` field. Settings key `demo.seeded_at` uses the existing `settings` table.

## Size and memory

Measured on linux/amd64 with `-trimpath -ldflags="-s -w"` against the same embedded web build:

- Server binary: 16,548,002 → 16,634,018 bytes (+86,016 bytes, +0.52 %). No new dependency; the container image grows by the same amount.
- Initial web bundle: 887,251 → 890,616 bytes raw (+3,365), 259.98 → 260.92 kB gzipped (+0.94 kB). No new chunk.
- Runtime memory: nothing resident beyond one goroutine for the schedule and one for the signal; a reset holds the seed tables (a few kilobytes) and runs about 100 small transactions in well under a second.

## Risks

- **Shared account**: visitors see each other's edits until the reset. Documented on the sign-in panel and in the banner.
- **A new abusable route added later** would be open on demo instances until added to the deny list. Mitigated by the member role (D2) and by the test that pins the list; the design doc of any new integration should name its demo rule.
- **Visitor creates a task in a wiped project while offline**: the task arrives after the reset pointing at a purged project and shows under "No project"-style fallbacks until the next reset. Harmless on a demo.
