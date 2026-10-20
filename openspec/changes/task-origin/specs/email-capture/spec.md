# Spec Delta

## MODIFIED Requirements

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
