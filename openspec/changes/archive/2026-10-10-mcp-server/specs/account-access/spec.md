# Spec Delta

## MODIFIED Requirements

### Requirement: API tokens
A signed-in user SHALL be able to create named API tokens with a scope of `full` (default) or `read`, list them with scope, creation and last-use times, and revoke them. The token secret SHALL be shown exactly once at creation and stored only as a hash. A request carrying `Authorization: Bearer <token>` SHALL act as that user; a `read` token SHALL be refused on every route that writes, including `/api/v1/sync`.

#### Scenario: Create and use a token
- **WHEN** a user creates a token and a script sends a request with it as a bearer token
- **THEN** the request is authenticated as that user and the token's last-use time is updated

#### Scenario: Revoked token
- **WHEN** a token is revoked and later presented
- **THEN** the request is refused with a 401 `unauthorized` error

#### Scenario: Read token on a write route
- **WHEN** a `read` token is presented on `POST /api/v1/tasks`, `PATCH`, `DELETE` or `POST /api/v1/sync`
- **THEN** the response is a 403 `insufficient_scope` error and nothing changes

#### Scenario: Existing tokens keep full access
- **WHEN** a token created before scopes existed is presented on a write route
- **THEN** the request is processed as before
