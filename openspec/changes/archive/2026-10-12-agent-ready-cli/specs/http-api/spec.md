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
`POST /api/v1/{collection}` SHALL accept `Idempotency-Key` (1 to 128 characters of letters, digits and `._:-`) and derive entity and op ids from user, collection and key: 201 first, 200 with the stored entity and `Idempotent-Replayed: true` on a same-content repeat, 409 `idempotency_conflict` on other content. A replay SHALL be recognised only by the same user's stored ops, so keys never cross accounts. Retries converge on every device.

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

#### Scenario: Keys are per account
- **WHEN** two accounts each POST `{"title":"Same"}` with `Idempotency-Key: k1`, and a collaborator has planted a task under the id the first account's next key would derive
- **THEN** the two creates make two tasks, each account's repeat returns only its own task, and the first account's keyed create over the planted task answers 409 `idempotency_conflict` without changing it
