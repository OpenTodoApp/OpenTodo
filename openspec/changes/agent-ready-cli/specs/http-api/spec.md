## MODIFIED Requirements

### Requirement: Write-through to the operation log
Every API write SHALL be recorded as operations stamped with server time, with device `server` for sessions and `full` tokens and `agent:<token-id>` for `agent` tokens, so devices receive API-originated changes on their next sync and last-writer-wins applies uniformly. Concurrent offline device edits converge with them like any other op.

#### Scenario: API write reaches devices
- **WHEN** a task is created through the API and a device syncs afterwards
- **THEN** the device receives the operations and shows the task

#### Scenario: Agent token write is attributed
- **WHEN** an `agent` token creates a task through `POST /api/v1/tasks` with both assistant switches on
- **THEN** the stored ops carry device `agent:<token-id>` and the task's history shows the assistant label

## ADDED Requirements

### Requirement: Idempotency keys on create
`POST /api/v1/{collection}` SHALL accept `Idempotency-Key` (1 to 128 characters of letters, digits and `._:-`). The entity and op ids SHALL derive from user, collection and key: the first request answers 201, a repeat answers 200 with the stored entity and `Idempotent-Replayed: true`, and a repeat with different content answers 409 `idempotency_conflict`. Retries converge to one entity on every device.

#### Scenario: Replayed create
- **WHEN** a script POSTs `{"title":"Buy milk"}` to `/api/v1/tasks` twice with `Idempotency-Key: k1`
- **THEN** the first response is 201, the second 200 with the same id and `Idempotent-Replayed: true`, and one task exists on every device after sync

#### Scenario: Conflicting reuse
- **WHEN** the same key is sent with `{"title":"Buy bread"}`
- **THEN** the response is 409 `idempotency_conflict` and the stored task is unchanged

#### Scenario: Invalid key
- **WHEN** the header holds 200 characters or a space
- **THEN** the response is 400 `invalid_input` naming `Idempotency-Key` and nothing is created

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials sends `Idempotency-Key` to `POST /api/v1/tasks`
- **THEN** the response is 401 `unauthorized` and nothing is created

#### Scenario: Read token
- **WHEN** a `read` token sends a keyed create
- **THEN** the response is 403 `insufficient_scope` and nothing is created
