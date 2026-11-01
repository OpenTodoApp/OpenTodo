## ADDED Requirements

### Requirement: Routine read tools and resources
While MCP is enabled, the read tools SHALL include `list_routines` (each routine's id, name, trigger kind, enabled, paused reason, number of steps and last run time), `get_routine` (the whole definition: trigger, condition and steps with their kinds, inputs and availability), `list_routine_runs` (a routine's runs newest first, at most 50, filterable by outcome) and `get_routine_run` (one run with its step records), and the resources `opentodo://routines` and `opentodo://routines/{id}`. Names and text literals SHALL be marked as untrusted text; on an encrypted account they SHALL be shown as encrypted unless the caller decrypts them through the device relay or the local decrypting bridge. Run records SHALL carry ids and counts only, as stored. Reading never changes data.

#### Scenario: List routines
- **WHEN** an assistant calls `list_routines` for a user with three routines
- **THEN** it gets the three with their trigger kinds and last runs, names inside `untrusted_text`

#### Scenario: Another user's routine
- **WHEN** an assistant reads `opentodo://routines/<id>` for a routine of another account
- **THEN** the answer is a JSON-RPC `-32002` resource-not-found error

#### Scenario: Read tools need a token
- **WHEN** a request without a bearer token calls `list_routines`
- **THEN** the response is 401 `unauthorized`

### Requirement: Routine write tools
The write tools SHALL include `run_routine` (`routine` id or exact name, optional `task_id`, optional `test`), `set_routine_enabled`, `create_routine`, `update_routine` (the name, or whole `trigger`, `condition` or `steps` values) and `trash_routine` (a tombstone, restorable), offered only under the write permission gate (an `agent` token while the owner's `mcp.writes` and the user's "Allow AI assistants to make changes" are on). They SHALL validate exactly as the routines routes do (shape, ids, types, the limit of 50 routines, step availability as warnings), SHALL count against the write limits (a definition write counts one, a run counts the entities it wrote), SHALL be audited as `agent.write` with the routine id and counts, and SHALL write definitions through the operation log with device `agent:<token-id>`, so the routine's history names the assistant. A run started by `run_routine` SHALL write with device `rule:<rule-id>`, follow the routine's own limits and record source `mcp`. On an encrypted account a name or text literal SHALL be accepted only as a ciphertext envelope or through the device relay. No tool and no routine step SHALL let an agent turn on applying AI results without asking (`routines-ai-step`).

#### Scenario: Create and test
- **WHEN** an assistant with an `agent` token calls `create_routine` with a manual trigger and three valid steps, then `run_routine` with `test: true`
- **THEN** the routine exists on every device after sync with history "Added by an AI assistant", and the test answer lists each step's planned output while nothing is written

#### Scenario: Gate closed
- **WHEN** the user's "Allow AI assistants to make changes" is off and an assistant calls `set_routine_enabled`
- **THEN** the tool is not listed, a direct call returns the gate's error, and nothing changes

#### Scenario: Invalid steps
- **WHEN** an assistant calls `update_routine` with a step whose input has the wrong type
- **THEN** the tool returns `invalid_argument` naming the step and input, and the routine is unchanged

#### Scenario: Unavailable step
- **WHEN** an assistant creates a routine with Email me on a server without outgoing email
- **THEN** the routine is created and the result warns that the step is not available, naming the reason
