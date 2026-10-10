# Proposal

## Why

A lot of work arrives as email: a receipt to file, a request from a colleague, a newsletter link to read later. Today the only way to turn mail into a task is to retype it. Forwarding a message to a personal inbox address is the capture path people already know from commercial task apps, and it works from any mail client on any device, including ones where OpenTodo is not installed. For a self-hosted product this must stay strictly optional: a Raspberry Pi behind a home router has no public mail port and no reason to run a mail server.

## What Changes

- Each user gets a secret inbox address, shown in Settings with copy and rotate controls and an on/off switch. Mail sent to that address becomes a task in the user's Inbox: subject as title (with "Re:"/"Fwd:" prefixes removed), the plain-text body as description, attachment names appended; the task is created through the operation log so every device receives it on its next sync.
- Delivery is by IMAP polling of one operator-owned mailbox: the operator sets the mailbox credentials and the public inbox address pattern (`todo+<secret>@example.com`, using sub-addressing) through optional `OPENTODO_EMAIL_*` environment variables. With no configuration the feature is off, Settings says so, and nothing polls.
- Abuse protection: messages whose recipient secret matches no enabled user are discarded unread, per-user hourly creation caps, body and attachment size limits, optional per-user sender allowlist, and Message-ID deduplication so a re-poll never creates a duplicate task.
- New authenticated API routes to read, update and rotate the user's inbox address.
- Attachments are not stored in this change; their names and sizes are listed in the description so nothing is silently dropped.

Out of scope: a built-in SMTP listener (follow-up `email-smtp-receiver` for operators who own an MX record), attachment storage (needs a file store; `attachments` later), replying to or sending email, parsing natural-language attributes from the subject (the parser is client-side; see `nlp-quick-add`), per-project inbox addresses, and OAuth-based mailbox access.

This change advances ROADMAP.md section 2, "Email-to-task (forward to an inbox address)" (`email-to-task`).

New environment variables are all optional; the feature is disabled when they are absent, so nothing is **BREAKING**. No op log format change: tasks created from email use existing fields only.

## Capabilities

### New Capabilities
- `email-capture`: optional activation, the per-user secret address and its API, the mapping from a message to a task, abuse protection, deduplication and reliability, and privacy of mail content and credentials.

### Modified Capabilities
- none

## Impact

- Server: new package `internal/email` (poller, parser, address matching, task creation via `sync.Apply`), new tables `email_inboxes` and `email_receipts` via migration, new routes under `/api/v1/email-inbox`, new `OPENTODO_EMAIL_*` configuration. One new dependency, a pure-Go IMAP client, adding roughly 1.5 MB to the binary and about 3 MB of resident memory while a poll is running (zero when disabled); the compressed image stays well under the 50 MB limit.
- Client: Settings section "Email to task" (address, copy, rotate, enable, allowlist). Bundle impact under 2 KB.
- Docs: `docs/self-hosting/email.md` (mailbox setup with sub-addressing on common providers), `docs/api.md` routes, `.env.example`, `docker-compose.yml` comments, README feature list.
