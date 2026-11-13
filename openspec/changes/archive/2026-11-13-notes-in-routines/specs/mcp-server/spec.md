## ADDED Requirements

### Requirement: Running a routine on a note
`run_routine` SHALL accept an optional `note_id`, the standalone note given to a routine whose trigger outputs a Note, with the refusals of `POST /api/v1/rules/{id}/run` (`note_required`, both ids `invalid_input`), under the same write permission gate, limits, audit and device rules. `create_routine` and `update_routine` SHALL accept the note triggers and note steps, validated exactly as the routines routes do. `list_routines` and `get_routine` SHALL describe note triggers and steps in their sentences. On an encrypted account a note's title or text literal SHALL be accepted only as a ciphertext envelope or through the device relay.

#### Scenario: Run on a note
- **WHEN** an assistant with an `agent` token calls `run_routine` with "Checkboxes to tasks" and a `note_id`, while writes are allowed
- **THEN** the routine runs on that note with source `mcp`, writes with device `rule:<rule-id>` and is audited as `agent.write` with the counts

#### Scenario: Gate closed
- **WHEN** the user's "Allow AI assistants to make changes" is off and an assistant calls `run_routine` with a `note_id`
- **THEN** the tool is not listed and the call is refused with the gate's error, and nothing runs

#### Scenario: Missing note
- **WHEN** an assistant runs a `note.label.added` routine without `note_id`
- **THEN** the call answers `note_required` and nothing runs
