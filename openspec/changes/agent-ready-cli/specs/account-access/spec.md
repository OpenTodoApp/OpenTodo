## MODIFIED Requirements

### Requirement: API tokens
A user SHALL create named tokens with scope `full` (default), `read` or `agent`, list them with scope and times, and revoke them; secrets are shown once and stored hashed. A bearer token acts as its user. `read` tokens SHALL be refused on every write route including `/api/v1/sync`; `agent` tokens likewise, except the agent content routes, and also unlock gated MCP write tools. Tokens are server state, not ops; managing them needs a connection.

#### Scenario: Create and use a token
- **WHEN** a user creates a token and a script sends a request with it as a bearer token
- **THEN** the request is authenticated as that user and the token's last-use time is updated

#### Scenario: Revoked token
- **WHEN** a token is revoked and later presented
- **THEN** the request is refused with a 401 `unauthorized` error

#### Scenario: Read token on a write route
- **WHEN** a `read` token is presented on `POST /api/v1/tasks`, `PATCH`, `DELETE` or `POST /api/v1/sync`
- **THEN** the response is a 403 `insufficient_scope` error and nothing changes

#### Scenario: Agent token on a REST write route outside the list
- **WHEN** an `agent` token is presented on `POST /api/v1/tokens`, `PUT /api/v1/settings/mcp`, `POST /api/v1/sync` or `DELETE /api/v1/projects/{id}`
- **THEN** the response is a 403 `insufficient_scope` error and nothing changes

#### Scenario: Create an agent token
- **WHEN** a user creates a token with scope `agent`
- **THEN** the token list shows it with scope `agent` and the `token.created` audit event records `token_scope: agent`

#### Scenario: Existing tokens keep full access
- **WHEN** a token created before scopes existed is presented on a write route
- **THEN** the request is processed as before

## ADDED Requirements

### Requirement: Agent content routes
An `agent` token SHALL be allowed on `POST /api/v1/tasks|projects|labels`, `POST /api/v1/tasks/{id}/comments`, `PATCH /api/v1/tasks/{id}` (not `assignee_id`), `PATCH /api/v1/projects/{id}` (`name`, `color` only) and `DELETE /api/v1/tasks/{id}` for tasks it created, only while both assistant switches are on, with the MCP write tools' limits, audit, E2EE refusal and mention suppression. Writes converge like other API writes.

#### Scenario: Agent creates a task through REST
- **WHEN** both switches are on and an `agent` token POSTs `{"title":"Water plants"}` to `/api/v1/tasks`
- **THEN** the response is 201, an `agent.write` audit event is recorded, and devices show the task after sync

#### Scenario: Switch off
- **WHEN** the user's switch is off and an `agent` token POSTs to `/api/v1/tasks`
- **THEN** the response is 403 `writes_disabled_by_user` and nothing is created

#### Scenario: Forbidden field
- **WHEN** an `agent` token PATCHes a project with `{"archived": true}`
- **THEN** the response is 403 `insufficient_scope` and the project is unchanged

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials POSTs to `/api/v1/tasks/{id}/comments`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Encrypted account
- **WHEN** an `agent` token of an encrypted account POSTs a task with a title
- **THEN** the response is 409 `encryption_enabled` and no op is written

### Requirement: Credential introspection
`GET /api/v1/me` SHALL include `auth: {method, scope}` where `method` is `session` or `token` and `scope` is `full`, `read` or `agent`, plus `token_id` and `token_name` for tokens. The field is additive and SHALL never include the secret. It is server state and needs a connection.

#### Scenario: Agent token introspects
- **WHEN** an `agent` token calls `GET /api/v1/me`
- **THEN** the response contains `auth.method: "token"`, `auth.scope: "agent"` and the token's id and name, and no secret

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials calls `GET /api/v1/me`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Revoked token
- **WHEN** a revoked token calls `GET /api/v1/me`
- **THEN** the response is 401 `unauthorized` and no `auth` object is returned
