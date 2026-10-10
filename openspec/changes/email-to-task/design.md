# Design

## Context

Everything a user writes goes through `sync.Apply`; REST handlers already build ops with `device: "server"`. Per-account settings that are not task data (sessions, API tokens) live in their own tables under `internal/auth`. Configuration is `OPENTODO_*` with defaults (`internal/config`). Constraints: optional with no mandatory env vars, one container that runs on a Pi behind NAT, no third-party calls, security by default, small image.

## Goals / Non-Goals

**Goals:**
- Forward-to-address capture that works for a home self-hoster with an ordinary mailbox.
- Zero footprint when disabled; safe defaults when enabled.
- Tasks created from mail are ordinary op-log writes.

**Non-Goals:**
- Running a public mail server, storing attachments, sending mail, OAuth mailbox access, per-project addresses.

## Decisions

### D1. Transport: IMAP polling of one operator mailbox, not an SMTP listener
Chosen: the server polls a single mailbox the operator owns (any provider) and routes messages to users by the sub-address part of the recipient (`todo+<secret>@example.com`). The user forwards mail to their address; the provider delivers it into the shared mailbox; OpenTodo reads it, creates the task and marks or moves the message.
- Why: most self-hosters cannot expose port 25 or get an MX record, and residential IPs are blocked by many senders. Every mainstream provider supports plus addressing or a catch-all, so this works with an existing account and no DNS changes. The server never accepts inbound connections, which keeps the attack surface to one outbound TLS session.
- Alternative: built-in SMTP receiver. Simpler routing (envelope `RCPT TO`) and no credentials to store, but needs a public port, MX and reputation handling. Deferred to `email-smtp-receiver`; the address format and user-facing behaviour are transport-independent so it can be added without changing this spec's user-visible contract.
- Routing headers: `Delivered-To`, `X-Original-To`, then `To`/`Cc` are searched for the configured local part and a `+secret` sub-address; the first match wins.

### D2. Configuration (all optional)
`OPENTODO_EMAIL_ADDRESS` (public pattern, e.g. `todo@example.com`; the secret is inserted as `todo+<secret>@example.com`), `OPENTODO_EMAIL_IMAP_HOST` (`host:port`, implicit TLS on 993, STARTTLS otherwise), `OPENTODO_EMAIL_IMAP_USER`, `OPENTODO_EMAIL_IMAP_PASSWORD` (or `_PASSWORD_FILE` for secret mounts), `OPENTODO_EMAIL_IMAP_MAILBOX` (default `INBOX`), `OPENTODO_EMAIL_POLL_SECONDS` (default 60, minimum 15), `OPENTODO_EMAIL_PROCESSED` (`move:<folder>` default `move:OpenTodo/Processed`, or `delete`). Feature enabled only when `ADDRESS`, `IMAP_HOST`, `IMAP_USER` and a password are all set; any subset is a startup error.

### D3. Dependency
Planned: a pure-Go IMAP client library (no CGO, actively maintained, MIT/BSD licence), estimated at +~1.5 MB binary.

Implemented instead (decided during apply): **no new dependency**. The server needs only a fixed, small subset of IMAP4rev1 (greeting, CAPABILITY, STARTTLS, LOGIN with quoted strings or synchronizing literals, SELECT, UID SEARCH UNSEEN, UID FETCH of RFC822.SIZE and BODY.PEEK[], UID STORE, UID MOVE (RFC 6851) or COPY + EXPUNGE / UID EXPUNGE (UIDPLUS), LIST for the hierarchy delimiter, CREATE, LOGOUT). `internal/email/imap.go` implements exactly that on `net`, `crypto/tls` and `bufio` (~450 lines), behind the `Source`/`Mailbox` interfaces, and is tested against an in-process fake IMAP server speaking real protocol bytes (MOVE and COPY paths, delete, STARTTLS with a test CA, refusal to log in without TLS, literals for non-ASCII passwords, unsolicited FETCH responses). A library would add a large generic surface (IDLE, SASL, a full response parser) we do not use, plus its own transitive dependencies to track. Measured impact: server binary +224 KB (16,552,098 → 16,781,474 bytes, `-trimpath -ldflags="-s -w"`, same embedded web build), compressed image about +80 KB; client bundle +1.0 KB gzipped (242.73 → 243.69 KB). Runtime memory: nothing when disabled (no goroutine runs); while a poll runs, at most one message (≤ 10 MB cap, checked via RFC822.SIZE before fetching) plus parse buffers. Message parsing uses the standard library (`net/mail`, `mime`, `mime/multipart`, `mime/quotedprintable`, `encoding/base64`, `html`); HTML-to-text is a small internal function (drop script/style/head, block tags to line breaks, links keep their http(s) target, strip tags, decode entities, collapse whitespace), not a dependency.

### D4. Data model impact
New tables via migration `000N_email.sql`: `email_inboxes(user_id PK, secret, enabled, allowlist_json, created_at, rotated_at)` and `email_receipts(user_id, message_id, received_at, PRIMARY KEY(user_id, message_id))`, with a periodic prune of receipts older than 90 days. Unlike API tokens, the secret is stored in plaintext: Settings must be able to show the address again, and the secret grants only task creation into one account, never read access. This is a deliberate trade-off recorded under Risks. No change to the op schema; tasks use existing fields. All task writes go through `sync.Apply` with `device: "server"`.

### D5. Processing pipeline
Single goroutine ticker → connect → search unseen → for each message (size-capped fetch): parse → route by sub-address → load inbox row → checks (enabled, account not deactivated, allowlist, Message-ID receipt, hourly cap counted from `email_receipts`) → `ApplyStrict` the task ops → insert the receipt row → mark/move/delete message. `sync.Apply` owns its transaction, so instead of sharing one transaction the ops are made deterministic: the task id is `ids.NameID("email-task", user + Message-ID)` and every op id is derived the same way. A crash after Apply but before the receipt replays only duplicate op ids (the op log ignores them), so duplicates stay impossible; a message whose receipt exists is just marked processed on the next poll. Messages without a Message-ID are keyed by a SHA-256 of the raw message. A transient (database or connection) error leaves the message unread for the next poll; every final outcome moves it. Unroutable or rejected messages are moved/deleted too, so the mailbox does not fill, and a counter is logged at `info` without content.

### D6. API and UI
Routes registered with `requireAuth`: `GET /api/v1/email-inbox`, `PATCH /api/v1/email-inbox`, `POST /api/v1/email-inbox/rotate`; `GET` is the lazy creator of the row. Response: `{enabledByOperator, address, enabled, allowlist}` (address null when not enabled by operator). Settings: section with address, copy button, rotate (with confirmation), enable switch, allowlist editor, plus a one-line explanation of the forwarding flow. Keyboard reachable like the token section.

### D7. Security
Secret is the credential (≥128 bits, URL-safe alphabet, case-insensitive match because some providers lowercase local parts). Sender allowlist is a soft filter (From is spoofable) and is opt-in. No subject or body ever logged below `debug`. Mail credentials live only in config memory. Content is treated as untrusted text: description is stored as plain text and rendered as text by the web app as today.

## Risks / Trade-offs

- [Provider strips or rewrites plus addressing] → documented per provider; catch-all domains work too; `X-Original-To`/`Delivered-To` are checked before `To`.
- [Mailbox credentials in environment] → `_PASSWORD_FILE` option for Docker/Coolify secrets; never exposed through API or logs.
- [Spam to a leaked address] → rotate in one click; hourly cap; allowlist option.
- [Large HTML newsletters] → plain-text preference, 16 KB description cap with a note, 10 MB message cap.
- [Polling delay] → default 60 s, minimum 15 s; acceptable for capture.
- [Dependency maintenance] → pin version, pure Go, licence-checked; isolated behind an interface so the SMTP follow-up can share the pipeline.
- [Plaintext secret in the database] → grants task creation only; database is already the trust boundary (sessions, hashed tokens); rotation available.

## Migration Plan

Additive migration; servers without configuration get the tables and never use them. Rollback: previous image ignores the tables. Disabling: unset the variables.

## Implementation notes (apply)

- Device id is `server` as the spec requires (`email.Device = sync.ServerDevice`).
- Account deactivation (user-management) is checked per message; deleted accounts lose their inbox and receipts through `ON DELETE CASCADE`.
- ISO-8859-1 and US-ASCII labelled text decodes as windows-1252, like browsers (WHATWG Encoding), because mail labelled Latin-1 routinely carries curly quotes and €.
- API changes and rotations are rate limited to 30 per account per hour; the GET response also carries `hourlyLimit`.
- Audit events `email_inbox.created`, `email_inbox.rotated`, `email_inbox.updated` (details: setting name and booleans or counts, never the secret or allowlist addresses).
- The setup guide lives at `docs/email.md` (next to `caldav.md` and `capture.md`) instead of `docs/self-hosting/email.md`; the self-hosting pages link to it.
- Migration is `0022_email.sql` (idempotent `CREATE ... IF NOT EXISTS`), numbered after sibling changes.

## Open Questions

- Whether to honour a `#project` or `p1` token in the subject once a shared Go grammar exists.
- Whether the receipts prune window (90 days) should be configurable.
