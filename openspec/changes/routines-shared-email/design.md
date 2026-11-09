# Design

## Context

- The step `email_members` (subject, text) is in the step catalogue of the server and of every client since 1.0. `ruleval.Available` reports it `not_shared` outside a shared routine and `not_yet` inside one; the web app's `sharedCatalogue` forces `not_yet` too. The engine has no handler for it.
- Email me (`routines-engine`): the plan checks the daily counts (`routine_emails`: 10 per routine, 20 per account per UTC day) and queues a side effect; after commit the side effect takes one count (`Store.TakeEmail`) and calls the `RoutineMailer`, which `internal/httpapi` implements over `mail.Service.Send` (kind `routine`, the account's language, `carriesContent`: refused for an encrypted account, per-recipient and server sending limits, `email.sent`/`email.failed` audit).
- Shared routines (`routines-shared`): a run reads and writes as the run-as person; the run-as person's encryption does not apply (the project is plaintext, D10).

## D1. Who receives

The recipients are the project's members (`project_members`, every role, viewers included) who:

- have an email address and it is verified;
- are not deactivated;
- are not end-to-end encrypted (a `routine` message is never built for an encrypted account, `outgoing-email`);
- have not stopped this routine's emails (D4).

The run-as person is a member and receives it like everyone else. The list is read when the step plans (to count the messages, D2) and again when the side effect sends after the commit; only members on both lists get a message, so a member who left the project, stopped the emails or lost their verified address in between gets nothing, and nobody is added after the counts were checked. An AI proposal's side effect (routines-ai-step) keeps the planned list and checks it again on apply in the same way.

No recipient is not an error: the step succeeds and sends nothing.

## D2. Limits

Each message counts as one email of the routine and of the run-as person (`routine_emails`): at most 10 per routine and 20 per run-as account per UTC day, all steps of the run together. The plan checks that the whole step fits; when it does not, the step fails with `rate_limited` before anything is written, and one `email.failed` (`rate_limited`) is recorded for the run-as person, as Email me does. A project with more reachable members than the routine's daily allowance therefore cannot be emailed by one step; the limits are the owner's protection of their sender reputation and stay as they are.

When sending, each message takes its count (`TakeEmail`); one refused there (another run used the allowance meanwhile) is recorded as `email.failed` with `rate_limited` for that member and not sent. The mail service's own limits (5 messages of the kind per recipient per hour, 100 per server per hour) apply to each message through `Send`, which records its refusals.

Availability is that of Email me plus the shared project (the existing function): outgoing email configured, the run-as person's address verified, never on a demo. The run-as person's encryption does not apply in a shared routine (routines-shared D10), as for the step warnings today.

## D3. The message

Kind `routine` (the audit's `email_kind` and the sending limits are those of Email me), template variant `routine_members` in the seven languages, chosen like `verify_signup_existing`. It holds the subject and text as the routine produced them, the routine's name, a link to the run (every member can read a shared routine's runs), and the stop link with one sentence: you get this because you are a member of a project whose routine emails its members. The language is the member's `user_prefs.language` (English when unset or "system"). The actor is the run-as person; the recipient (`UserID`) is the member.

## D4. Stop links

- **Secret:** `ots_` + 32 random bytes (`ids.Secret`), minted per message. Only its SHA-256 is stored, in `routine_email_links (hash PRIMARY KEY, rule_id, user_id, created_at)`; the secret exists only in the message. A link stays usable for 365 days; older rows are deleted when a new link is minted. A link is single-purpose: it stops this routine's emails for this member and does nothing else.
- **Stop:** `routine_email_stops (rule_id, user_id, stopped_at, PRIMARY KEY (rule_id, user_id))`. Server state, not an op: like the daily counts it is about delivery, not the routine's definition, and it is never synced or exported. A deleted account's rows go with it (`ON DELETE CASCADE`).
- **Routes**, both `public("…")` because the member may be signed out or on another device and the secret in the address is the credential (`pubSecret` in the route matrix), both `.demoDenied()` with a matching "Routine emails" entry in the demo deny list (a demo never sends email):
  - `GET /api/v1/routine-emails/{token}` → `{routine: "<name>", stopped: bool}`.
  - `POST /api/v1/routine-emails/{token}/stop` → the same with `stopped: true`; repeating it is harmless.
  - An unknown or expired secret answers `404 link_invalid`; unknown secrets are rate limited per address (10 a minute, as public links). Answers carry `no-store`, `noindex` and `no-referrer`. The routine's name is the only thing about the routine they reveal: no project, run, member or step.
- **Why a page and a button, not a one-click GET:** mail scanners open links; a GET that stopped would stop emails nobody asked to stop.
- **Audit:** stopping records `settings.changed` with the member as actor, setting `routine_email`, from `on` to `off`, as turning off the weekly digest does. The routine's name is not logged.
- **Log redaction:** paths with an `ots_` secret are redacted like the other link secrets.

## D5. Web

`sharedCatalogue` offers Email project members in a shared routine when the server's catalogue reports it unavailable only because the routine is not shared (`not_shared`); every other reason (email not configured, address not verified, demo) is kept. The stop page `/routine-emails/<secret>` is a small lazily loaded screen that renders before the sign-in state, like a public list: the instance mark, "Stop emails from “Weekly chores”?", **Stop emails**; then "You will get no more emails from “Weekly chores”."; an invalid link says so. No new chrome in the app; within the interface budget (one screen without a list).

## D6. Compatibility

No op field changes and the step's shape is unchanged since 1.0, so nothing is rewritten. A 1.0 (or 1.1/1.2) client still marks the step `not_yet` in a shared routine and shows the save warning, but keeps the step as it is; the server runs it.

## Data model impact

Migration `0064_routine_email_stops.sql`: two server-side tables (D4). No op schema change. No dependency; binary size grows by the templates (a few KB).
