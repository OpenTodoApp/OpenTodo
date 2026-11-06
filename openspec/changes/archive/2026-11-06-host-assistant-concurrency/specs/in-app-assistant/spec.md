## MODIFIED Requirements

### Requirement: Assistant turn route
`POST /api/v1/assistant/turn` SHALL require a session (bearer tokens get 403 `session_required`), accept a conversation of at most 40 messages and 256 KB, allow one turn per user at a time (409 `turn_in_progress`) and at most 8 server-wide (503 `assistant_busy`), and stream text, status, change-set, usage and done events. It writes nothing; it reads synced data only. In host mode the 8 SHALL be shared by all of the host's tenants, not counted per tenant, so the operator's provider keys see at most 8 turns however many tenants are open.

#### Scenario: Streamed answer
- **WHEN** a consented user asks "what is due today?"
- **THEN** the response streams text events listing today's tasks, then a usage event and a done event with `end_turn`

#### Scenario: Token refused
- **WHEN** a script calls the route with a `full` API token
- **THEN** the response is 403 `session_required` and no provider request is made

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials calls the route
- **THEN** the response is 401 `unauthorized`

#### Scenario: Too large
- **WHEN** the conversation has 41 messages or exceeds 256 KB
- **THEN** the response is 413 `too_large` and no provider request is made

#### Scenario: Concurrent turn
- **WHEN** a user starts a second turn while the first is streaming
- **THEN** the second answers 409 `turn_in_progress`

#### Scenario: Host-wide limit
- **WHEN** a host serves two tenants, 8 assistant turns are running across them and a person in either tenant starts a turn
- **THEN** the answer is 503 `assistant_busy` with `Retry-After` and no provider request is made; once one of the running turns ends, a turn in either tenant can start
