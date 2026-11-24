# Spec Delta

## MODIFIED Requirements

### Requirement: API tokens
A signed-in user SHALL be able to create named API tokens with a scope of `full` (default), `read`, `agent` or `admin`, list them with scope, creation and last-use times, and revoke them. The list (`GET /api/v1/tokens`) SHALL answer a session, a `full` or an `admin` token, and refuse `read` and `agent` tokens with 403 `insufficient_scope`. The secret SHALL be shown once and stored only as a hash. A bearer token SHALL act as its user; `read` tokens SHALL be refused on every write route, including `/api/v1/sync`, and `agent` tokens too except on the agent content routes and gated MCP write tools. A `full` token SHALL be refused on the credential routes; an `admin` token SHALL be accepted everywhere a `full` token is and on the credential routes. An `admin` token SHALL only be created from a signed-in session. Tokens are server state, not ops.

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
- **WHEN** a user creates a token with scope `superuser`
- **THEN** the response is a 400 `invalid_input` error naming the allowed scopes and no token exists

#### Scenario: Existing tokens keep full access
- **WHEN** a token created before scopes existed is presented on a write route
- **THEN** the request is processed as before

#### Scenario: Admin token created from a session only
- **WHEN** a session that re-authenticated within ten minutes creates a token with scope `admin`, and later a bearer token (even an `admin` one) asks for another `admin` token
- **THEN** the first request answers 201 with scope `admin` and the second a 403 `session_required` error with no token created

#### Scenario: Admin token stored safely for older servers
- **WHEN** an `admin` token is created
- **THEN** it is stored as a `read` scope row plus an admin marker row, so a server without the marker treats it as read-only

#### Scenario: Read and agent tokens cannot list tokens
- **WHEN** a `read` or an `agent` token is presented on `GET /api/v1/tokens`
- **THEN** the response is a 403 `insufficient_scope` error, while a session and a `full` token get the list
