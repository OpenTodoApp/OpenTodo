## MODIFIED Requirements

### Requirement: Message becomes a task
A message addressed to an enabled user's current address SHALL create one Inbox task with priority 4 and no due date: title from the subject with reply and forward prefixes removed, description from the plain-text body (HTML converted when no plain part exists) followed by one line per attachment with name and size. The description SHALL keep as much of the body as fits in one synced value: when the description would exceed the operation value limit once encoded, or once encrypted by a device of an end-to-end encrypted account, the body SHALL be cut at a character boundary, as late as the limit allows, and end with a note that the rest did not fit; a body that fits SHALL never be cut. The task SHALL be written as operations with device id `server`, so offline devices see it on their next sync and it converges like any other task.

#### Scenario: Forwarded message
- **WHEN** the user forwards a message with subject `Fwd: Invoice 2026-10` and one PDF attachment
- **THEN** a task titled `Invoice 2026-10` appears in the Inbox with the message text as description, ending with the attachment name and size

#### Scenario: Long message
- **WHEN** a message's text is 40 KB long
- **THEN** the task's description holds the whole text, with no truncation note

#### Scenario: Message longer than a task's notes
- **WHEN** a message's text is 200 KB long
- **THEN** the description holds the start of the text up to the value limit, ends with the truncation note and the attachment lines, never splits a character, the operation is accepted, and an end-to-end encrypted account's device can re-encrypt it

#### Scenario: Appears on devices
- **WHEN** the task has been created from email and the user's phone syncs
- **THEN** the phone shows the task in its Inbox
