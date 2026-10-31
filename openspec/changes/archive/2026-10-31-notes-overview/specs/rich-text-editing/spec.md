## ADDED Requirements

### Requirement: Appended text merges into the document
Tasks and notes SHALL carry an additive field family `appends.<id>` whose non-empty values are Markdown text waiting to be added at the end of the note. A plain-text writer that only adds text (the CLI, MCP, the append routes) SHALL write one new key and SHALL NOT write `description` or `notes_doc`, so no existing text is replaced. Every device that holds the note SHALL, when it applies such a value and before any local write of the note, insert the text parsed as Markdown at the end of the visible body as a document insertion whose every block carries the append's id, and publish the document and projection with that key set to `""` in the same batch. A device SHALL NOT fold an append whose block is already in its merged document, and when a merge holds more than one block with the same append id, every device SHALL keep only the copy whose first block has the smallest document item id and delete the blocks of the others, so all devices converge on one copy. Until a device folds it, the REST API, the export, MCP and the CLI SHALL show the note as its projection followed by its pending appends in clock order. The server SHALL accept a non-empty value only for a key that has none yet, `""` from anyone who may write the entity, at most 100 pending appends per entity, and a projection plus pending appends of at most 64 KB. A fold that would exceed the document size limit SHALL NOT be done and the append stays pending. Offline devices fold appends they receive when they sync; an append made in the web app itself is a direct document edit. Clients that do not know the family SHALL ignore it.

#### Scenario: Append while a phone edits offline
- **WHEN** a script appends "- ship Friday" to a note while a phone, offline, adds a paragraph in the middle of the same note, and the phone syncs later
- **THEN** every device shows the phone's paragraph and "ship Friday" at the end, once

#### Scenario: Two devices fold at once
- **WHEN** two online devices both receive the same append and fold it before seeing each other's document
- **THEN** after they sync every device shows the appended text exactly once

#### Scenario: Readable before any device folds
- **WHEN** a script appends text to a task's note and no device has synced since
- **THEN** `GET /api/v1/tasks/{id}` and MCP `get_note` show the note's text followed by the appended text

#### Scenario: An append is written once
- **WHEN** a client sends a second non-empty value for an append id that already has one
- **THEN** the op is refused and the stored append is unchanged

### Requirement: Plain-text replacement checks the version
A read of a task, project or note through the REST API SHALL return `body_version`, the greatest clock among its `description`, `notes_doc` and `appends` keys. A `PATCH` that writes `description` with `If-Match` SHALL be refused with 409 `body_changed`, carrying the current version and writing nothing, when the stored version differs, checked in the same transaction as the write. A `PATCH` without `If-Match` SHALL behave as before. An accepted replacement SHALL become the document by the fold-back rule, on whichever device next opens the note, offline included, and all devices converge through the merge rules.

#### Scenario: Version matches
- **WHEN** the CLI reads a note and patches its `description` with `If-Match` set to the version it read, and nothing changed meanwhile
- **THEN** the write is accepted and the next device that opens the note shows the new text as formatted content

#### Scenario: Version is stale
- **WHEN** a device saved an edit to the note after the CLI read it and the CLI then patches with the old version
- **THEN** the response is 409 `body_changed` and the device's edit stays

#### Scenario: Unauthenticated patch
- **WHEN** a request without credentials patches a note's `description` with `If-Match`
- **THEN** the response is 401 `unauthorized` and nothing is written
