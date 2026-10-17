## MODIFIED Requirements

### Requirement: API tokens
A signed-in user SHALL be able to create named API tokens with a scope of `full` (default), `read`, `agent` or `admin`, list them with scope, creation and last-use times, and revoke them. The secret SHALL be shown once and stored only as a hash. A bearer token SHALL act as its user; `read` tokens SHALL be refused on every write route, including `/api/v1/sync`, and `agent` tokens too except on the agent content routes and gated MCP write tools. A `full` token SHALL be refused on the credential routes; an `admin` token SHALL be accepted everywhere a `full` token is and on the credential routes. An `admin` token SHALL only be created from a signed-in session. Tokens are server state, not ops.

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

## ADDED Requirements

### Requirement: Credential and administration routes
The credential and administration routes SHALL accept a session or an `admin` token and SHALL refuse `full`, `read` and `agent` tokens with a 403 `insufficient_scope` error before changing anything. They change the second factor, passkeys, tokens, app passwords, linked identities, the own password, invitations, accounts, two-factor policy and resets, single sign-on, the encryption key record, or settings that hold secrets. Sessions keep each route's step-up rule.

#### Scenario: Full token on a credential route
- **WHEN** a `full` token is presented on `DELETE /api/v1/mfa/totp`, `POST /api/v1/tokens`, `POST /api/v1/users/{id}/password-reset` or `PUT /api/v1/settings/oidc`
- **THEN** the response is a 403 `insufficient_scope` error naming the admin scope and nothing changes

#### Scenario: Admin token on a credential route
- **WHEN** an `admin` token is presented on the same routes on an account with a second factor
- **THEN** the request is processed without a re-authentication challenge

#### Scenario: Full token elsewhere
- **WHEN** a `full` token creates a task, reads `GET /api/v1/users` or revokes another token
- **THEN** the request is processed as before

#### Scenario: Secret settings
- **WHEN** a `full` token reads or changes the outgoing-email settings, or changes the backup or assistant settings
- **THEN** the response is a 403 `insufficient_scope` error, while reading the other settings and lists, revoking tokens and app passwords and forgetting remembered browsers keep working with it

#### Scenario: Anonymous request
- **WHEN** a request without credentials reaches a credential route
- **THEN** the response is a 401 `unauthorized` error

### Requirement: Declared route policy
Every route SHALL be registered with one declared access policy: anonymous with a reason, or signed in with the roles allowed (any, owner, owner and admins), the token scopes accepted, whether a session must have re-authenticated within ten minutes, and whether a demo instance refuses it. The server SHALL enforce it before the handler, role first. A test SHALL fail for a route without a policy and check the demo restrictions against the policies.

#### Scenario: Member on an owner route
- **WHEN** a member with a stale session calls `PUT /api/v1/settings/oidc` or `PUT /api/v1/settings/smtp`
- **THEN** the response is a 403 `forbidden` error, not a re-authentication request

#### Scenario: Route without a policy
- **WHEN** a developer registers a handler on the mux without a policy
- **THEN** the route policy test fails and names the registration

#### Scenario: Demo restrictions follow the policy
- **WHEN** a route's policy says a demo instance refuses it
- **THEN** a demo instance answers it with 403 `demo_restricted` before authentication, and every route that changes credentials, administration or owner settings is among those refused

### Requirement: Sign out everywhere
A user SHALL be able to end every session of their account (this one too), forget every remembered browser and revoke every API token and app password of the account in one step via `POST /api/v1/me/sign-out-everywhere`, from a session re-authenticated within ten minutes only, recorded as one `sessions.revoked` event with counts. Open event streams SHALL close at once. Settings → Account → Session SHALL offer it after a confirmation; it is online only and never queued.

#### Scenario: Sign out everywhere
- **WHEN** a user with a recently confirmed session signs out everywhere
- **THEN** the response is 204 with the session cookie cleared, every other session, API token and app password of the account is refused afterwards, a remembered browser is asked for the second factor again, and the password still signs in

#### Scenario: Token or stale session
- **WHEN** an API token calls the route, or a session older than ten minutes since its last proof
- **THEN** the response is a 403 `session_required` or `reauth_required` error and nothing is revoked

#### Scenario: Other accounts untouched
- **WHEN** one account signs out everywhere
- **THEN** the sessions and tokens of every other account keep working
