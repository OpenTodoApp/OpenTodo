## MODIFIED Requirements

### Requirement: Routine write tools
The write tools SHALL include `run_routine` (`routine` id or exact name, optional `task_id`, optional `test`), `set_routine_enabled`, `create_routine`, `update_routine` (the name, or whole `trigger`, `condition` or `steps` values) and `trash_routine` (a tombstone, restorable), offered only under the write permission gate (an `agent` token while the owner's `mcp.writes` and the user's "Allow AI assistants to make changes" are on). They SHALL validate exactly as the routines routes do (shape, ids, types, the limit of 50 routines, step availability as warnings), SHALL count against the write limits (a definition write counts one, a run counts the entities it wrote), SHALL be audited as `agent.write` with the routine id and counts, and SHALL write definitions through the operation log with device `agent:<token-id>`, so the routine's history names the assistant. A run started by `run_routine` SHALL write with device `rule:<rule-id>`, follow the routine's own limits and record source `mcp`. On an encrypted account a name or text literal SHALL be accepted only as a ciphertext envelope or through the device relay. No tool and no routine step SHALL let an agent turn on applying AI results without asking (`routines-ai-step`).

A routine that sends content off the server SHALL be the person's to create, change, turn on and run. Such a routine has a `webhook`, `email_me` or `email_members` step anywhere in its steps, or the legacy `webhook` action. On every agent path, `create_routine` SHALL refuse a routine with such a step. `update_routine` SHALL refuse a change after which the routine still has one. `set_routine_enabled` SHALL refuse turning such a routine on. `run_routine` SHALL refuse running it unless `test` is true. Each refusal SHALL answer `forbidden_for_agents` and write nothing. Reading, testing, turning off and trashing such a routine SHALL stay allowed, and so SHALL an `update_routine` that takes every sending step out. The routines routes for the person's session or a `full` token SHALL be unchanged. The routine model is unchanged, so offline edits and convergence of routines are unaffected: the refusal happens before any op is written.

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
- **WHEN** an assistant creates a routine with an Ask AI step on a server without an assistant provider
- **THEN** the routine is created and the result warns that the step is not available, naming the reason

#### Scenario: A sending step is refused
- **WHEN** an assistant calls `create_routine` with an Email me step inside a Then branch, or `update_routine` adding a Send a webhook step
- **THEN** the tool returns `forbidden_for_agents` and no routine op is written

#### Scenario: The person's sending routine
- **WHEN** the person built a routine with Email me and an assistant calls `set_routine_enabled` with `enabled: true`, `update_routine` with a new name, or `run_routine` without `test`
- **THEN** each call returns `forbidden_for_agents`, the routine is unchanged and no run is recorded

#### Scenario: Read, test, turn off and trash stay open
- **WHEN** an assistant calls `get_routine`, `run_routine` with `test: true`, `set_routine_enabled` with `enabled: false` or `trash_routine` on the person's routine with Email me
- **THEN** each call succeeds, and the test sends no email
