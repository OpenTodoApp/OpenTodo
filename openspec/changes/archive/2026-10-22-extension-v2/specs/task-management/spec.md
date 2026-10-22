## MODIFIED Requirements

### Requirement: Task origin
A task SHALL have an optional `origin`: where it came from, as one value `{kind, provider?, id?, url?, title?}` with `kind` one of `url`, `email`, `issue`, `import`. The default SHALL be none. It SHALL be stored, synced and converge by last-writer-wins as one whole value, like `due`: two devices that set it concurrently end with one of the two origins on every device, never a mix. It SHALL be set and removed offline and survive edits to any other field. An `email` origin MAY carry a `url` and a `provider` when it comes from a message open in a web mail client (`gmail`, `outlook`): it then opens that message, while an `email` origin without a `url` (email to task) has no link to open.

#### Scenario: Default on creation
- **WHEN** a task is created with only a title
- **THEN** it has no origin, and its export and API representation carry `origin: null`

#### Scenario: Concurrent origins converge whole
- **WHEN** one offline device sets `{kind: "url", url: "https://a.example/x"}` and another sets `{kind: "issue", provider: "github", id: "o/r#7", url: "https://github.com/o/r/issues/7"}` on the same task, and both sync
- **THEN** every device shows the same one of the two origins, with all of its members from the same write

#### Scenario: Origin survives other edits
- **WHEN** a task with an origin is retitled and rescheduled on another device while this one is offline, then both sync
- **THEN** the task keeps its origin and takes the new title and date on every device

#### Scenario: Web mail origin
- **WHEN** a task carries `{kind: "email", provider: "gmail", id: "18f2c3", url: "https://mail.google.com/mail/u/0/#inbox/18f2c3", title: "Boiler service quote"}`
- **THEN** every device shows an origin chip reading "Gmail" with the title as its tooltip that opens the message in a new tab, and `origin: gmail` lists the task in a filter

#### Scenario: Email origin without a link
- **WHEN** a task carries `{kind: "email", id: "<a1@mail.example>"}`
- **THEN** the chip reads "Email" and has no link to open, as before
