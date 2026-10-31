## MODIFIED Requirements

### Requirement: Task origin
A task SHALL have an optional `origin`: where it came from, as one value `{kind, provider?, id?, url?, title?}` with `kind` one of `url`, `email`, `issue`, `import`, `obsidian`. The default SHALL be none. It SHALL be stored, synced and converge by last-writer-wins as one whole value, like `due`: two devices that set it concurrently end with one of the two origins on every device, never a mix. It SHALL be set and removed offline and survive edits to any other field. An `email` origin MAY carry a `url` and a `provider` when it comes from a message open in a web mail client (`gmail`, `outlook`): it then opens that message, while an `email` origin without a `url` (email to task) has no link to open. An `obsidian` origin names a note in an Obsidian vault: its `id` is the note's vault-relative path, its `url` the Obsidian link that opens that note, and its chip reads the note's name (the `title` when set, else the last segment of `id` without `.md`) with a note icon. A client that does not know a kind SHALL show the origin's `id` without a link and keep the value unchanged.

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

#### Scenario: Obsidian origin
- **WHEN** a task carries `{kind: "obsidian", id: "Daily/2026-10-29.md", url: "obsidian://open?vault=Notes&file=Daily%2F2026-10-29", title: "2026-10-29"}`
- **THEN** every device shows a chip reading "2026-10-29" with a note icon and the tooltip "Open in Obsidian: Notes › Daily/2026-10-29.md", and `origin: obsidian` lists the task in a filter

#### Scenario: Obsidian origin on an older client
- **WHEN** a client released before the `obsidian` kind syncs a task carrying an `obsidian` origin, and the user retitles the task there
- **THEN** that client shows the chip with the note's path and no link, and after sync every device still holds the same `obsidian` origin and the new title

### Requirement: Origin validation
The sync and API write paths SHALL accept an origin only when `kind` is from the closed list, `url` (when present) is an `http` or `https` URL with a host, `provider` (when present) is 1 to 32 lower-case letters, digits or hyphens, and no other member is present. For `kind: "obsidian"` alone, `url` SHALL instead be an Obsidian note link of exactly the form `obsidian://open?vault=<vault>&file=<note>`: scheme `obsidian`, action `open`, no path, fragment or user information, exactly the two query members `vault` (1 to 255 characters) and `file` (1 to 1024 characters) once each, and `id` SHALL equal the decoded `file` (with `.md` appended when it has no extension); an `obsidian` origin SHALL carry no `provider`. Every other kind SHALL keep the `http(s)` rule, so an `obsidian:` URL on any other kind is refused. Anything else SHALL be refused as invalid and change nothing. Go and TypeScript SHALL implement these rules against one shared set of vectors.

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

#### Scenario: Obsidian note link accepted
- **WHEN** a client submits `origin: {kind: "obsidian", id: "Meetings/Kick-off.md", url: "obsidian://open?vault=Work%20notes&file=Meetings%2FKick-off"}`
- **THEN** the write is accepted and every device receives the origin unchanged

#### Scenario: Other Obsidian actions refused
- **WHEN** a client submits an `obsidian` origin whose `url` is `obsidian://new?vault=Notes&name=x`, `obsidian://open?path=%2FUsers%2Fme%2FNotes%2Fa.md`, `obsidian://open?vault=Notes&file=a&content=x` or `obsidian://open?vault=Notes&file=a#h`
- **THEN** each write is rejected as invalid and the task's origin is unchanged

#### Scenario: Label and link disagree
- **WHEN** a client submits `origin: {kind: "obsidian", id: "Daily/2026-10-29.md", url: "obsidian://open?vault=Notes&file=Private%2Fdiary"}`
- **THEN** the write is rejected as invalid

#### Scenario: Obsidian scheme on another kind
- **WHEN** a client submits `origin: {kind: "url", url: "obsidian://open?vault=Notes&file=a"}`
- **THEN** the write is rejected as invalid

### Requirement: Origin lengths and required members
An origin's `url` SHALL be at most 2048, `id` at most 512 and `title` at most 500 characters; `kind: "url"` SHALL carry a `url`, `kind: "obsidian"` SHALL carry both an `id` and a `url`, and the other kinds SHALL carry an `id`. An encrypted account's ciphertext string SHALL be accepted in place of the object, bounded only by the value limit.

#### Scenario: Kind without its required member
- **WHEN** a client submits `origin: {kind: "url", title: "A page"}` or `origin: {kind: "import", provider: "todoist"}`
- **THEN** the write is rejected as invalid

#### Scenario: Over-long title
- **WHEN** a client submits an origin whose `title` is 600 characters long
- **THEN** the write is rejected as invalid, and the capture screen never produces one because it cuts the shared title to 500 characters first

#### Scenario: Ciphertext accepted
- **WHEN** an encrypted account's device submits `origin: "enc:v1:…"`
- **THEN** the write is accepted and served unchanged

#### Scenario: Obsidian origin without its link
- **WHEN** a client submits `origin: {kind: "obsidian", id: "Daily/2026-10-29.md"}`
- **THEN** the write is rejected as invalid

### Requirement: Origin links open only http(s)
The app SHALL make a task's origin chip a link, and open it from any command, only when the origin's URL as the device reads it, after any decryption, is `http` or `https`, or when the origin's kind is `obsidian` and its URL is a valid Obsidian note link as "Origin validation" defines it. Any other URL SHALL show the chip without a link. The server validates plaintext origins, but cannot check an encrypted one. An Obsidian link SHALL be handed to the system (in a browser through an ordinary link activation, so the browser asks before opening another app; in a native shell through the shell's external-link method, only when the shell lists `obsidian-links`), and the chip's menu SHALL offer "Copy link" for every origin with a URL. This needs no connection and changes nothing that syncs.

#### Scenario: Encrypted origin with an unsafe scheme
- **WHEN** an encrypted account's task origin decrypts on the device to `javascript:alert(1)`
- **THEN** the chip shows without a link and activating it opens nothing

#### Scenario: Ordinary link
- **WHEN** a task's origin is `{kind: "url", url: "https://example.com/page"}`
- **THEN** the chip links to `https://example.com/page` in a new tab without referrer

#### Scenario: Obsidian note opened from the browser
- **WHEN** the user activates the chip of an `obsidian` origin in a desktop browser with Obsidian installed
- **THEN** the browser asks whether to open Obsidian, and Obsidian opens the named note; no new tab is left behind

#### Scenario: Encrypted origin smuggling another Obsidian action
- **WHEN** an encrypted account's origin decrypts on the device to `{kind: "obsidian", id: "a.md", url: "obsidian://new?vault=Notes&name=a"}`
- **THEN** the chip shows without a link and activating it opens nothing

#### Scenario: Shell without Obsidian links
- **WHEN** the web app runs in a native shell whose `capabilities` do not list `obsidian-links` and the user opens an `obsidian` origin's chip menu
- **THEN** the chip has no link and the menu offers "Copy link", which copies the Obsidian link
