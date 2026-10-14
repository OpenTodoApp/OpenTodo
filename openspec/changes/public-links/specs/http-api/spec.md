# Spec Delta

## MODIFIED Requirements

### Requirement: Write-through to the operation log
Every API write SHALL be recorded as operations stamped with server time, with device `server` for sessions and `full` tokens, `agent:<token-id>` for `agent` tokens and `public:<link-id>` for ticks through a public link (OpenSpec `public-links`), so devices receive API-originated changes on their next sync and last-writer-wins applies uniformly. Concurrent offline device edits converge with them like any other op.

#### Scenario: API write reaches devices
- **WHEN** a task is created through the API and a device syncs afterwards
- **THEN** the device receives the operations and shows the task

#### Scenario: Agent token write is attributed
- **WHEN** an `agent` token creates a task through `POST /api/v1/tasks` with both assistant switches on
- **THEN** the stored ops carry device `agent:<token-id>` and the task's history shows the assistant label

#### Scenario: Public tick is attributed
- **WHEN** a guest completes a task through a public tick link
- **THEN** the stored op carries device `public:<link-id>`, the link creator's account as actor and server time, and the task's history shows the public link label

### Requirement: Sync endpoint
`POST /api/v1/sync` SHALL accept `{device, cursor, ops}` and return `{applied, duplicates, ops, cursor, hasMore, serverTime}`. A missing device id SHALL be a 400 error. At most 1000 operations SHALL be accepted or returned per request. A request whose device, or any submitted op's device, starts with a server-reserved prefix (`agent:`, `caldav:`, `public:`) SHALL be refused with 400 `invalid_op` and nothing stored.

#### Scenario: Oversized batch
- **WHEN** a request carries more than 1000 operations
- **THEN** the response is 400 with code `invalid_op`

#### Scenario: Reserved device prefix
- **WHEN** a device submits a request with device `public:abc`, or an op whose device is `caldav:abc`
- **THEN** the response is 400 `invalid_op` and nothing is stored
