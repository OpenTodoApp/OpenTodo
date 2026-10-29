## ADDED Requirements

### Requirement: Objectives collection
The API SHALL expose an `objectives` collection (OpenSpec `plan-objectives`) on the existing collection routes:
- `GET` and `POST /api/v1/objectives`;
- `GET`, `PATCH` and `DELETE /api/v1/objectives/{id}`.

The routes SHALL be registered with the signed-in policy and cover only the caller's own objectives. Writes SHALL go through the operation log with `ApplyStrict` and wake devices. The list SHALL accept `period` and `open=true`. Read tokens SHALL be able to list and get, and SHALL be refused on writes, as agent tokens are. An objective of another account SHALL be 404. Validation failures SHALL be `400 invalid_input`, and a create or move into a period with 5 open objectives SHALL be `409 too_many_objectives`. Deletion SHALL be a tombstone.

#### Scenario: Create an objective
- **WHEN** a script POSTs `{"title":"Ship 1.0","period":"2026-Q4"}` to `/api/v1/objectives` with a full token
- **THEN** the response is 201 with the objective's id, `done_at` 0 and `position`, and the user's devices show the card after sync

#### Scenario: Anonymous request
- **WHEN** a request without credentials lists or creates objectives
- **THEN** the response is 401 `unauthorized`

#### Scenario: Read token cannot write
- **WHEN** a read token POSTs to `/api/v1/objectives`
- **THEN** the response is 403 `insufficient_scope` and nothing is written

#### Scenario: Another account's objective
- **WHEN** a user requests `/api/v1/objectives/<id>` for an objective of another account
- **THEN** the response is 404

#### Scenario: Invalid period
- **WHEN** a script POSTs an objective with the period `2026-11` or an empty title
- **THEN** the response is 400 `invalid_input` naming the field

#### Scenario: Limit reached
- **WHEN** a script POSTs a sixth open objective for `2026-W44`
- **THEN** the response is 409 `too_many_objectives` and nothing is written
