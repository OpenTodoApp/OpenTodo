## MODIFIED Requirements

### Requirement: Time entry write routes
`POST /api/v1/time-entries` SHALL start an entry (`taskId` alone) or log a closed one (`startedAt` and `endedAt`, optional `note`), `POST /api/v1/time-entries/stop` SHALL stop the caller's running entry, `PATCH /api/v1/time-entries/{id}` SHALL change `startedAt`, `endedAt` and `note`, and `DELETE /api/v1/time-entries/{id}` SHALL tombstone one. All require authentication, write through the operation log, wake the caller's devices, and refuse read tokens. An `agent` token SHALL reach the first three through the agent tool registry (`start_timer`, `log_time`, `stop_timer`, `update_time_entries`) under the assistant switches, limits and audit of `account-access` "Agent content routes": its start SHALL be refused with 409 `timer_running` while another entry of the user runs unless the body carries `stopRunning: true`, its PATCH SHALL be limited to entries the same token created (403 `not_permitted` otherwise), and its `DELETE` SHALL be refused with 403 `insufficient_scope`.

#### Scenario: Start from the API
- **WHEN** a full token POSTs `{"taskId":"<id>"}` to `/api/v1/time-entries` while another entry runs
- **THEN** the response is 201 with the new running entry, the previous entry is closed at the new start in the same batch, and the user's devices show both after their next sync

#### Scenario: Log a closed entry
- **WHEN** a client POSTs `{"taskId":"<id>","startedAt":1760950800000,"endedAt":1760954400000,"note":"review"}`
- **THEN** the response is 201 with a one-hour entry

#### Scenario: Anonymous write
- **WHEN** a request without credentials POSTs to `/api/v1/time-entries`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Read token on a write
- **WHEN** a `read` token POSTs to `/api/v1/time-entries/stop`
- **THEN** the response is 403 `insufficient_scope` and no entry changes

#### Scenario: End before start
- **WHEN** a client POSTs an entry whose `endedAt` is smaller than `startedAt`, or PATCHes one into that state
- **THEN** the response is 400 `invalid_input` naming the fields and nothing is written

#### Scenario: Unknown or foreign task
- **WHEN** a client starts an entry on a task id that does not exist or that the caller cannot read
- **THEN** the response is 404 `not_found` and nothing is written

#### Scenario: Nothing to stop
- **WHEN** a client POSTs to `/api/v1/time-entries/stop` while no entry of the caller runs
- **THEN** the response is 404 `not_found` with a message saying no entry is running

#### Scenario: Another member's entry
- **WHEN** a member PATCHes or DELETEs an entry another member created
- **THEN** the response is 403 `forbidden` and the entry is unchanged

#### Scenario: Agent logs time
- **WHEN** both assistant switches are on and an `agent` token POSTs a closed 25 minute entry
- **THEN** the response is 201, the entry carries device `agent:<token-id>`, an `agent.write` event for `log_time` is recorded, and history shows "AI assistant (<token name>)"

#### Scenario: Agent start while the person's timer runs
- **WHEN** an `agent` token POSTs `{"taskId":"<id>"}` while the person's entry runs
- **THEN** the response is 409 `timer_running` and the person's entry keeps running

#### Scenario: Agent with writes switched off
- **WHEN** the owner's switch for assistant writes is off and an `agent` token POSTs to `/api/v1/time-entries/stop`
- **THEN** the response is 403 `writes_disabled_by_owner` and no entry changes

#### Scenario: Agent deletes an entry
- **WHEN** an `agent` token sends `DELETE /api/v1/time-entries/{id}` for an entry it created
- **THEN** the response is 403 `insufficient_scope` and the entry stays
