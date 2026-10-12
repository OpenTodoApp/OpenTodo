## MODIFIED Requirements

### Requirement: API tokens
A signed-in user SHALL be able to create named API tokens with a scope of `full` (default), `read` or `agent`, list them with scope, creation and last-use times, and revoke them. The secret SHALL be shown once and stored only as a hash. A bearer token SHALL act as its user; `read` tokens SHALL be refused on every write route, including `/api/v1/sync`, and `agent` tokens too except on the agent content routes and gated MCP write tools. Tokens are server state, not ops.

#### Scenario: Create and use a token
- **WHEN** a user creates a token and a script sends a request with it as a bearer token
- **THEN** the request is authenticated as that user and the token's last-use time is updated

#### Scenario: Revoked token
- **WHEN** a token is revoked and later presented
- **THEN** the request is refused with a 401 `unauthorized` error

#### Scenario: Read token on a write route
- **WHEN** a `read` token is presented on `POST /api/v1/tasks`, `PATCH`, `DELETE` or `POST /api/v1/sync`
- **THEN** the response is a 403 `insufficient_scope` error and nothing changes

#### Scenario: Agent token on a REST write route
- **WHEN** an `agent` token is presented on `POST /api/v1/tokens`, `PUT /api/v1/settings/mcp`, `POST /api/v1/sync` or `DELETE /api/v1/projects/{id}` (routes outside the agent content routes)
- **THEN** the response is a 403 `insufficient_scope` error and nothing changes

#### Scenario: Create an agent token
- **WHEN** a user creates a token with scope `agent`
- **THEN** the token list shows it with scope `agent` and the `token.created` audit event records `token_scope: agent`

#### Scenario: Invalid scope
- **WHEN** a user creates a token with scope `admin`
- **THEN** the response is a 400 `invalid_input` error naming the allowed scopes and no token exists

#### Scenario: Existing tokens keep full access
- **WHEN** a token created before scopes existed is presented on a write route
- **THEN** the request is processed as before

## ADDED Requirements

### Requirement: Agent content routes
An `agent` token SHALL write only on `POST /api/v1/tasks|projects|labels`, `POST /api/v1/tasks/{id}/comments`, `PATCH /api/v1/tasks/{id}` (not `assignee_id`, `parent_id`, `position` or a restore), `PATCH /api/v1/projects/{id}` (`name`, `color`) and `DELETE /api/v1/tasks/{id}` (own creations), while both assistant switches are on, through the agent tool registry with MCP's limits, audit, E2EE refusal and mention suppression. Other write routes and fields SHALL answer 403 `insufficient_scope`.

#### Scenario: Agent creates a task through REST
- **WHEN** both switches are on and an `agent` token POSTs `{"title":"Water plants"}` to `/api/v1/tasks`
- **THEN** the response is 201, an `agent.write` audit event is recorded, and devices show the task after sync

#### Scenario: Switch off
- **WHEN** the user's switch is off and an `agent` token POSTs to `/api/v1/tasks`
- **THEN** the response is 403 `writes_disabled_by_user` and nothing is created

#### Scenario: Forbidden field
- **WHEN** an `agent` token PATCHes a project with `{"archived": true}` or a task with `{"assignee_id": "…"}`
- **THEN** the response is 403 `insufficient_scope` and nothing changes

#### Scenario: Limits shared with MCP
- **WHEN** an `agent` token made 30 write calls in a minute through MCP and REST together and sends another REST write
- **THEN** the response is 429 `rate_limited` with `Retry-After` and nothing changes on any device

#### Scenario: Only its own creations go to the Trash
- **WHEN** an `agent` token sends `DELETE /api/v1/tasks/{id}` for a task the user created in the web app
- **THEN** the response is 403 `not_permitted` and the task stays

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials POSTs to `/api/v1/tasks/{id}/comments`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Encrypted account
- **WHEN** an `agent` token of an encrypted account POSTs a task with a title
- **THEN** the response is 409 `encryption_enabled` and no op is written

### Requirement: Credential introspection
`GET /api/v1/me` SHALL include `auth: {method, scope}` where `method` is `session` or `token` and `scope` is `full`, `read` or `agent`, plus `token_id` and `token_name` for tokens and, for `agent` tokens, `writes_allowed` and (when false) `writes_denied` naming the switch that is off. The field is additive and SHALL never include the secret. It is server state and needs a connection.

#### Scenario: Agent token introspects
- **WHEN** an `agent` token calls `GET /api/v1/me`
- **THEN** the response contains `auth.method: "token"`, `auth.scope: "agent"`, the token's id and name and `writes_allowed`, and no secret

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials calls `GET /api/v1/me`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Revoked token
- **WHEN** a revoked token calls `GET /api/v1/me`
- **THEN** the response is 401 `unauthorized` and no `auth` object is returned
