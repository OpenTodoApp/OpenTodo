## MODIFIED Requirements

### Requirement: Origin validation
The sync and API write paths SHALL accept an origin only when `kind` is from the closed list, `url` (when present) is an `http` or `https` URL with a host, `provider` (when present) is 1 to 32 lower-case letters, digits or hyphens, and no other member is present. For `kind: "obsidian"` alone, `url` SHALL instead be an Obsidian note link of exactly the form `obsidian://open?vault=<vault>&file=<note>`: scheme `obsidian`, action `open`, no path, fragment or user information, exactly the two query members `vault` (1 to 255 characters) and `file` (1 to 1024 characters) once each, and `id` SHALL equal the decoded `file` without its anchor (with `.md` appended when it has no extension). A `#` in the decoded `file` starts a heading or block anchor (`Plan#Next steps`, `Plan#^abc123`): Obsidian names no note with `#`, so the note is the part before it, and neither the note nor the anchor SHALL be empty; an `obsidian` origin SHALL carry no `provider`. Every other kind SHALL keep the `http(s)` rule, so an `obsidian:` URL on any other kind is refused. Anything else SHALL be refused as invalid and change nothing. Go and TypeScript SHALL implement these rules against one shared set of vectors.

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

#### Scenario: Link to a block or heading
- **WHEN** a client submits `origin: {kind: "obsidian", id: "Projects/Plan.md", url: "obsidian://open?vault=Notes&file=Projects%2FPlan%23%5Eabc123"}`
- **THEN** it is accepted, the chip reads "Plan" and opens the note at block `^abc123`, and `origin:` search finds it by `Projects/Plan.md`
- **AND** `file=Inbox%23` (an empty anchor) or `file=%23Heading` (no note) is refused
