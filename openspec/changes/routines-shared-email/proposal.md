# Proposal

## Why

Routines of a shared project shipped without Email project members (`routines-shared` D8): the step is in the catalogue since 1.0 but listed as unavailable with reason `not_yet`, because sending to other people needs per-member delivery rules: who receives, in which language, how a member stops it, and how it counts toward the limits (issue #741).

## What Changes

- **Email project members works in a shared routine.** One plain-text routine email to each member of the routine's project (viewers included) with a verified address, in that member's language, with the routine's name, a link to the run and a link to stop emails from that routine. Members without a verified address, deactivated accounts, encrypted accounts (a routine message is never built for one) and members who stopped the routine's emails are skipped; who receives is decided again when the run sends, so a member who left the project in between gets nothing.
- **Limits.** Each message counts toward the routine's 10 and the run-as person's 20 emails a day, and toward the mail service's sending limits. A step that would pass the daily limits fails before anything is written, like Email me. Available only while outgoing email is configured and the run-as person's address is verified; never on a demo.
- **Stop link.** Each message carries its own unguessable link (`/routine-emails/<secret>`). The page names the routine and offers **Stop emails**; stopping records the member for that routine, and no later run emails them. The link reveals nothing but the routine's name. Two public routes, the secret in the address being the credential: `GET /api/v1/routine-emails/{token}` and `POST /api/v1/routine-emails/{token}/stop`, refused on a demo instance. Stopping is audited like the weekly digest's opt-out.
- **Availability.** `email_members` loses the `not_yet` reason in a shared routine; the web editor offers it there. In a personal routine it stays `not_shared`.

Not **BREAKING**: no op field, no new value format (the step kind and its inputs are unchanged since 1.0), no environment variable. One migration adds two server-side tables.

## Out of scope

- **Notify me recipients** ("the person it runs as" or "the project's members", with a per-routine mute): left for a follow-up. It needs a new `to` input on the Notify me step, a mute per member and routine with its own route and inbox action, and a decision on delivery channels for members. A 1.0 client opening a routine with an unknown input shows it as "Made with a newer version" and does not let it be edited, so the format is possible; it is a separate piece of work. Notify me keeps reaching the run-as person.
- Starting a stopped routine's emails again: a stopped member stays stopped for that routine.
- A routine email to an address typed into the routine (never offered).

## Roadmap

`routines-shared-email` (1.1 Routines, #741), the email half. The Notify me recipient stays on the roadmap entry.

## Capabilities

### Modified Capabilities

- `routines`: "A shared routine acts only in its project" (Email project members is available), and a new requirement "Email project members".
- `outgoing-email`: "Routine email" (members' messages carry a stop link instead of the turn-off line).

## Impact

- **Server:** `internal/ruleval/available.go` (no `not_yet`), `internal/rules` (the step, recipients, stop links and stops in `routine_store.go`), `internal/mail` (the `routine_members` template in seven languages, a `Stop` placeholder), `internal/httpapi` (the mailer, two public routes, the demo deny list, the route matrix), migration `0064_routine_email_stops.sql`.
- **Web:** `web/src/lib/rules/shared.ts` (the shared catalogue offers the step), a lazily loaded stop page behind `/routine-emails/<secret>`. First load: a route entry and a lazy import, a few bytes.
- **Docs:** `docs/routines.md`, `docs/api.md`.
- No dependency.
