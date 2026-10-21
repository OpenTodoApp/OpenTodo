# email-capture Specification

## Purpose
Defines how a user turns email into tasks by forwarding messages to a personal secret address: operator activation, the per-user address and its management API, how a message maps to a task, protection against abuse and duplicates, and what happens to mail content and credentials.

## Requirements

### Requirement: Optional activation by the operator
Email capture SHALL be off unless the operator configures the mailbox to poll and the public inbox address pattern through optional `OPENTODO_EMAIL_*` environment variables. With no configuration the server SHALL not open any mail connection and Settings SHALL state that the operator has not enabled email capture. An incomplete or invalid configuration SHALL stop startup with a message naming the variable.

#### Scenario: Not configured
- **WHEN** the server starts with no `OPENTODO_EMAIL_*` variables
- **THEN** it serves normally, makes no mail connections, and the email-inbox API reports `enabledByOperator: false`

#### Scenario: Partial configuration
- **WHEN** the mailbox host is set but the public inbox address is not
- **THEN** the process exits non-zero with a message naming the missing variable

### Requirement: Per-user secret inbox address
When enabled by the operator, each user SHALL have an inbox address formed from the operator's address pattern and a per-user random secret of at least 128 bits, created on first request. The user SHALL be able to see it, rotate it (which invalidates the old one immediately), switch capture off and on, and set an optional sender allowlist, all from Settings. These settings SHALL be stored per account on the server and SHALL not be part of the operation log.

#### Scenario: First visit creates the address
- **WHEN** a user opens the email section of Settings for the first time on an enabled server
- **THEN** an address such as `todo+k3f9…@example.com` is shown with copy and rotate controls

#### Scenario: Rotate
- **WHEN** the user rotates the address and a message is later sent to the old address
- **THEN** the message is discarded and no task is created

### Requirement: Email inbox API
The server SHALL expose `GET /api/v1/email-inbox` (address, enabled, allowlist, operator status), `PATCH /api/v1/email-inbox` (`enabled`, `allowlist`) and `POST /api/v1/email-inbox/rotate`, all requiring a session or API token and acting only on the caller's account. Validation errors SHALL use the standard error envelope.

#### Scenario: Anonymous request
- **WHEN** a request without credentials reaches any `/api/v1/email-inbox` route
- **THEN** the response is 401 `unauthorized`

#### Scenario: Invalid allowlist
- **WHEN** a PATCH sets `allowlist` to a value that is not an array of email addresses
- **THEN** the response is 400 `invalid_input` and the stored settings are unchanged

#### Scenario: Not enabled by operator
- **WHEN** a user calls `POST /api/v1/email-inbox/rotate` on a server without email configuration
- **THEN** the response is 409 `email_disabled`

### Requirement: Message becomes a task
A message addressed to an enabled user's current address SHALL create one Inbox task with priority 4 and no due date: title from the subject with reply and forward prefixes removed, description from the body followed by one line per attachment with name and size. The body SHALL come from the HTML part converted to the Markdown the notes render (headings, bold, italic, strikethrough, lists, line and paragraph breaks, and links as text with an `http` or `https` target), without hidden elements, scripts, styles, images outside links or invisible filler characters, and with literal formatting characters escaped; the plain-text part SHALL be used when there is no HTML part or when the HTML part has less than half its words. The description SHALL keep as much of the body as fits in one synced value: when the description would exceed the operation value limit once encoded, or once encrypted by a device of an end-to-end encrypted account, the body SHALL be cut at a character boundary, as late as the limit allows, and end with a note that the rest did not fit; a body that fits SHALL never be cut. The task SHALL carry the origin `{kind: "email", id: <Message-ID>}` with no URL and no title, written in the same operation batch; a message without a Message-ID, or with one longer than the origin id limit, SHALL produce the task without an origin. The task SHALL be written as operations with device id `server`, so offline devices see it on their next sync and it converges like any other task.

#### Scenario: Forwarded message
- **WHEN** the user forwards a message with subject `Fwd: Invoice 2026-10` and one PDF attachment
- **THEN** a task titled `Invoice 2026-10` appears in the Inbox with the message text as description, ending with the attachment name and size

#### Scenario: Origin is the Message-ID
- **WHEN** a message with `Message-ID: <a1@mail.example>` becomes a task
- **THEN** the task's origin is `{kind: "email", id: "<a1@mail.example>"}`, its row shows the email chip without a link, and the sender address is nowhere in the origin

#### Scenario: Encrypted account receives mail
- **WHEN** the user's account is end-to-end encrypted and a message becomes a task
- **THEN** the origin is written in plaintext like the title, and the next unlocked device re-writes it as ciphertext on sight

#### Scenario: Newsletter
- **WHEN** the user forwards a newsletter whose HTML part has a hidden preview text, a heading, a list and links with long tracking addresses, and whose plain part spells out each link
- **THEN** the task's notes show the heading and the list as formatted, each link as its text, and neither the preview text, blank filler lines nor any link address

#### Scenario: Unsafe link
- **WHEN** the HTML part has a link to `javascript:alert(1)`
- **THEN** the description keeps the link's text without a link

#### Scenario: Long message
- **WHEN** a message's text is 40 KB long
- **THEN** the task's description holds the whole text, with no truncation note

#### Scenario: Message longer than a task's notes
- **WHEN** a message's text is 200 KB long
- **THEN** the description holds the start of the text up to the value limit, ends with the truncation note and the attachment lines, never splits a character, the operation is accepted, and an end-to-end encrypted account's device can re-encrypt it

#### Scenario: Appears on devices
- **WHEN** the task has been created from email and the user's phone syncs
- **THEN** the phone shows the task in its Inbox

### Requirement: Abuse protection
A message whose recipient secret matches no enabled user SHALL be discarded without creating anything and counted in a log metric. A user SHALL have at most 60 tasks created from email per rolling hour; excess messages SHALL be discarded with a log entry. Messages larger than 10 MB SHALL be discarded. When a user has a sender allowlist, messages whose sender is not on it SHALL be discarded.

#### Scenario: Unknown secret
- **WHEN** a message arrives for an address whose secret matches no user
- **THEN** no task is created, no account is affected, and the event is logged without the message content

#### Scenario: Rate cap
- **WHEN** a user's address receives 70 messages within one hour
- **THEN** 60 tasks are created and the remaining messages are discarded and logged

#### Scenario: Sender not allowed
- **WHEN** a user's allowlist contains only their own address and a message arrives from another sender
- **THEN** no task is created

### Requirement: Deduplication and reliability
The server SHALL record the Message-ID of every message it has processed per user and SHALL never create a second task for the same Message-ID, so a repeated poll, a restart mid-batch or a message delivered twice yields one task. Processed messages SHALL be marked as read and moved to a configurable folder, or deleted when the operator chooses so. A failed poll SHALL be logged and retried at the next interval without affecting the rest of the server.

#### Scenario: Restart during processing
- **WHEN** the server restarts after creating a task from a message but before marking it processed
- **THEN** the next poll recognises the Message-ID and creates no duplicate

#### Scenario: Mailbox unreachable
- **WHEN** the mail server refuses connections
- **THEN** the API and web app keep working, the failure is logged once per interval, and polling resumes when the mail server is back

### Requirement: Privacy of mail content and credentials
The server SHALL keep no copy of a message beyond the task it created and the Message-ID, SHALL never log subjects, bodies or sender addresses at the default log level, SHALL never return mailbox credentials through any API, and SHALL connect only to the mail server the operator configured.

#### Scenario: Credentials not exposed
- **WHEN** any authenticated user calls the email-inbox API or the export
- **THEN** no response contains the mailbox host, user or password

#### Scenario: Network audit
- **WHEN** email capture is enabled and network traffic is inspected
- **THEN** the only outbound connections are to the configured mail server

### Requirement: Other clients' deleted messages are never expunged
The poller SHALL remove its processed messages from the mailbox only with `UID EXPUNGE` (UIDPLUS) or `UID MOVE`, which affect only those messages. On a server with neither, it SHALL NOT send a bare `EXPUNGE`: processed messages SHALL stay in the mailbox flagged `\Seen` and `\Deleted` (with their copy in the processed folder when moving) and SHALL NOT be handled again.

#### Scenario: Server without UIDPLUS
- **WHEN** the mail server has no UIDPLUS or MOVE and another mail client flagged a message `\Deleted` without expunging it
- **THEN** after a poll that message is still in the mailbox, the processed message is flagged `\Seen` and `\Deleted`, and the next poll does not handle it again
