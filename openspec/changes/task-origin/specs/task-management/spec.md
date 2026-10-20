# Spec Delta

## ADDED Requirements

### Requirement: Task origin
A task SHALL have an optional `origin`: where it came from, as one value `{kind, provider?, id?, url?, title?}` with `kind` one of `url`, `email`, `issue`, `import`. The default SHALL be none. It SHALL be stored, synced and converge by last-writer-wins as one whole value, like `due`: two devices that set it concurrently end with one of the two origins on every device, never a mix. It SHALL be set and removed offline and survive edits to any other field.

#### Scenario: Default on creation
- **WHEN** a task is created with only a title
- **THEN** it has no origin, and its export and API representation carry `origin: null`

#### Scenario: Concurrent origins converge whole
- **WHEN** one offline device sets `{kind: "url", url: "https://a.example/x"}` and another sets `{kind: "issue", provider: "github", id: "o/r#7", url: "https://github.com/o/r/issues/7"}` on the same task, and both sync
- **THEN** every device shows the same one of the two origins, with all of its members from the same write

#### Scenario: Origin survives other edits
- **WHEN** a task with an origin is retitled and rescheduled on another device while this one is offline, then both sync
- **THEN** the task keeps its origin and takes the new title and date on every device

### Requirement: Origin validation
The sync and API write paths SHALL accept an origin only when `kind` is from the closed list, `url` (when present) is an `http` or `https` URL with a host, `provider` (when present) is 1 to 32 lower-case letters, digits or hyphens, and no other member is present. Anything else SHALL be refused as invalid and change nothing.

#### Scenario: Provider shape
- **WHEN** a client submits `origin: {kind: "issue", provider: "My Tracker", id: "1"}`
- **THEN** the write is rejected as invalid

#### Scenario: Unsafe URL refused
- **WHEN** a client submits `origin: {kind: "url", url: "javascript:alert(1)"}`
- **THEN** the write is rejected as invalid and the task's origin is unchanged

#### Scenario: Unknown kind or member refused
- **WHEN** a client submits `origin: {kind: "ticket", id: "1"}` or `origin: {kind: "url", url: "https://a.example", favicon: "x"}`
- **THEN** the write is rejected as invalid

#### Scenario: Email origin without a URL
- **WHEN** a client submits `origin: {kind: "email", id: "<a1@mail.example>"}`
- **THEN** the write is accepted, and the task shows an origin with no link to open

#### Scenario: Cleared
- **WHEN** a client submits `origin: null`
- **THEN** the origin is removed and the task's other fields are untouched

### Requirement: Origin lengths and required members
An origin's `url` SHALL be at most 2048, `id` at most 512 and `title` at most 500 characters; `kind: "url"` SHALL carry a `url`, and the other kinds SHALL carry an `id`. An encrypted account's ciphertext string SHALL be accepted in place of the object, bounded only by the value limit.

#### Scenario: Kind without its required member
- **WHEN** a client submits `origin: {kind: "url", title: "A page"}` or `origin: {kind: "import", provider: "todoist"}`
- **THEN** the write is rejected as invalid

#### Scenario: Over-long title
- **WHEN** a client submits an origin whose `title` is 600 characters long
- **THEN** the write is rejected as invalid, and the capture screen never produces one because it cuts the shared title to 500 characters first

#### Scenario: Ciphertext accepted
- **WHEN** an encrypted account's device submits `origin: "enc:v1:…"`
- **THEN** the write is accepted and served unchanged
