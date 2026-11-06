## MODIFIED Requirements

### Requirement: Retention and pruning
The owner SHALL set retention through `GET`/`PUT /api/v1/settings/audit` between 7 and 3650 days, default 90, and SHALL toggle address logging there. The server SHALL prune events at startup and, while it runs, within a minute of the first event in the log passing the retention; after the owner shortens the retention, the events it no longer covers SHALL be pruned within a minute. Pruning SHALL remove events from the start of the log in the order they were recorded and SHALL stop at the first event still within the retention, so the events kept form one unbroken run of the hash chain, and SHALL record, in the same transaction, the hash of the last event it removed as the chain's checkpoint. Retention is server configuration, not synced.

#### Scenario: Shorter retention prunes
- **WHEN** the owner lowers retention to 30 days while events older than that exist
- **THEN** those events are gone within a minute and the audit setting change itself is recorded

#### Scenario: Event passes the retention
- **WHEN** the oldest event in the log becomes older than the retention while the server runs
- **THEN** it is pruned within a minute, without waiting for an hourly pass

#### Scenario: Pruned log still verifies
- **WHEN** events older than the retention are pruned and the chain is verified afterwards
- **THEN** verification starts at the checkpoint and reports the kept events intact

#### Scenario: Invalid retention or wrong role
- **WHEN** retention is set to 3 days, or a member writes the settings
- **THEN** the response is a 400 `invalid_input` error for the value and a 403 `forbidden` error for the member

### Requirement: Export of the log
The owner SHALL download the log through `GET /api/v1/audit/export` as newline-delimited JSON with the same filters as the list, served as a download, and the export itself SHALL be recorded as an event. Each exported event SHALL carry its `hash`, and the last line SHALL be the chain head of the whole log, `{"chain": {"id", "hash"}}`, at or after every exported event whatever the filters, so the owner can keep it outside the server and compare a later export with it. The user data export at `/api/v1/export` SHALL NOT include audit events.

#### Scenario: Export is produced and recorded
- **WHEN** the owner exports the log
- **THEN** the response is a download with one JSON object per event, then the chain head line, and a new `audit.exported` event appears in the log

#### Scenario: Member or anonymous export
- **WHEN** a member or an anonymous request calls the export route
- **THEN** the response is a 403 `forbidden` error for the member and a 401 `unauthorized` error for the anonymous request

### Requirement: Append-only record
There SHALL be no API to modify or delete individual events; pruning by retention and address scrubbing are the only removals. Events that describe a state change SHALL be stored in the same transaction as that change, so a change without its event or an event without its change cannot exist. Each event SHALL store a hash of the previous event's hash and of its own content (everything but the client address), written in the transaction that stores the event, so that changing, removing or reordering a stored event is detectable. Events recorded before the server had the chain have no hash and are not covered. The log SHALL live in the data directory and be included in any backup of it.

#### Scenario: No deletion route
- **WHEN** any client sends a delete or patch for an audit event
- **THEN** the response is a 404 `not_found` error and the event remains

#### Scenario: Atomic with the change
- **WHEN** an API token creation fails after the token row was written but before the response
- **THEN** either both the token and its event exist or neither does

#### Scenario: Address scrubbing keeps the chain
- **WHEN** the owner turns address logging off and every stored address is erased
- **THEN** the chain still verifies

## ADDED Requirements

### Requirement: Hash chain verification
The server SHALL verify the audit log's hash chain at startup and at most hourly while events are recorded, and SHALL log the first broken link at error level without stopping or changing the log. The owner SHALL verify it on demand through `GET /api/v1/audit/verify`, which answers 200 with `{ok, checked, uncovered, checkpoint, head, break}` whether or not the chain holds; `break` is null or the first event whose hash does not follow, with reason `missing_hash` or `mismatch`. `ot audit verify` SHALL print the result and exit 1 with `audit_chain_broken` when the chain is broken. The check reads only server state; nothing is synced, so devices, offline use and convergence are unaffected.

#### Scenario: Intact chain
- **WHEN** the owner verifies a log nobody changed outside OpenTodo
- **THEN** the answer has `ok: true`, the number of events checked and the head's id and hash

#### Scenario: Edited event
- **WHEN** an event in the middle of the log was changed directly in the database
- **THEN** the answer has `ok: false` and `break` names that event with reason `mismatch`

#### Scenario: Deleted or reordered events
- **WHEN** an event was deleted from the middle of the log, or two events swapped places
- **THEN** `break` names the first event after the gap, or the first moved event

#### Scenario: Fresh database
- **WHEN** the owner verifies on a new server
- **THEN** the answer has `ok: true` and every event recorded so far checked

#### Scenario: Member or anonymous verification
- **WHEN** a member or an anonymous request calls the verify route
- **THEN** the response is a 403 `forbidden` error for the member and a 401 `unauthorized` error for the anonymous request

#### Scenario: Broken chain at startup
- **WHEN** the server starts on a database whose audit log was edited
- **THEN** it logs the first broken event at error level and keeps running
