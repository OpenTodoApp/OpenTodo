# account-access Specification

## Purpose
Controls who can use a server: owner bootstrap on first run, sign-up policy, sign-in with sessions, API tokens for non-browser clients, and protection of cookie sessions against cross-site requests.

## Requirements

### Requirement: First-run owner setup
A server with no accounts SHALL let the first visitor create an account, and that account SHALL receive the owner role. The setup state SHALL be discoverable without authentication so the client can show the setup screen.

#### Scenario: Fresh server reports setup required
- **WHEN** a client asks for the authentication status of a server with zero accounts
- **THEN** the response states that setup is required and that sign-up is currently allowed

#### Scenario: First account becomes owner
- **WHEN** the first account is created with a valid email and password
- **THEN** the account has the role `owner`, a session is started for it, and the server no longer reports setup required

### Requirement: Sign-up policy
After the owner exists, creating further accounts SHALL be refused unless the operator enabled open sign-up through configuration or the registration carries a valid, unspent invitation. The policy SHALL be enforced on the server, not only hidden in the client.

#### Scenario: Sign-up closed by default
- **WHEN** an owner exists, open sign-up is not enabled, and someone attempts to register without an invitation
- **THEN** the request is refused with a `signup_closed` error and no account is created

#### Scenario: Operator opens sign-up
- **WHEN** the operator sets `OPENTODO_ALLOW_SIGNUP=true` and someone registers with an unused email
- **THEN** an account with the role `member` is created

#### Scenario: Registration with a valid invitation
- **WHEN** open sign-up is not enabled and someone registers with an unused email and a valid, unspent invitation secret
- **THEN** an account with the role `member` is created and the invitation becomes spent

#### Scenario: Duplicate email
- **WHEN** someone registers with an email that already has an account, compared case-insensitively
- **THEN** the request is refused with an `email_taken` error

### Requirement: Password policy and storage
Passwords SHALL be at least 10 characters and SHALL be stored only as a salted, memory-hard hash. The plaintext SHALL never be logged or returned.

#### Scenario: Short password rejected
- **WHEN** an account is created or a password is set with fewer than 10 characters
- **THEN** the request is refused with an `invalid_input` error naming the minimum length

### Requirement: Sign-in and sessions
A user SHALL sign in with email and password and receive a session delivered as an HttpOnly cookie with `SameSite=Lax`, marked `Secure` when the public base URL is https. Sessions SHALL expire after the configured lifetime and SHALL be revocable by signing out.

#### Scenario: Successful sign-in
- **WHEN** valid credentials are submitted
- **THEN** the response sets the session cookie and returns the user's public profile

#### Scenario: Wrong credentials
- **WHEN** an unknown email or a wrong password is submitted
- **THEN** the response is a 401 with an `invalid_credentials` error that does not reveal whether the email exists

#### Scenario: Sign-out
- **WHEN** a signed-in user signs out
- **THEN** the session is deleted on the server, the cookie is cleared, and the old cookie value no longer authenticates

### Requirement: Brute-force protection
Sign-in and registration SHALL be rate limited per client address.

#### Scenario: Repeated failures
- **WHEN** a client exceeds 10 sign-in or registration attempts within one minute
- **THEN** further attempts in that window are refused with a 429 `rate_limited` error

### Requirement: Authentication required by default
Every API route except the health check and the authentication bootstrap routes SHALL require a valid session or API token.

#### Scenario: Anonymous request to a protected route
- **WHEN** a request without credentials reaches any `/api/v1/` route other than `auth/status`, `auth/register` or `auth/login`
- **THEN** the response is a 401 `unauthorized` error

### Requirement: API tokens
A signed-in user SHALL be able to create named API tokens, list them with creation and last-use times, and revoke them. The token secret SHALL be shown exactly once at creation and stored only as a hash. A request carrying `Authorization: Bearer <token>` SHALL act as that user.

#### Scenario: Create and use a token
- **WHEN** a user creates a token and a script sends a request with it as a bearer token
- **THEN** the request is authenticated as that user and the token's last-use time is updated

#### Scenario: Revoked token
- **WHEN** a token is revoked and later presented
- **THEN** the request is refused with a 401 `unauthorized` error

### Requirement: Cross-site request protection
A state-changing request authenticated by a session cookie SHALL be refused when its `Origin` header is present and does not match the server's public origin. Requests authenticated by a bearer token are not subject to this check.

#### Scenario: Cross-site POST with cookie
- **WHEN** a browser on another origin sends a POST that carries the session cookie
- **THEN** the response is a 403 `bad_origin` error and nothing changes

#### Scenario: Same-origin POST with cookie
- **WHEN** the app on the server's own origin sends a POST that carries the session cookie
- **THEN** the request is processed normally
