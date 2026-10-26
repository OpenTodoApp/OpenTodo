## MODIFIED Requirements

### Requirement: First-run owner setup
A server with no accounts SHALL let the first visitor create an account, and that account SHALL receive the owner role. The setup state SHALL be discoverable without authentication so the client can show the setup screen. When the operator configured a setup token, creating the first account SHALL require that token from every address; the token SHALL have no effect once an owner exists. Without a setup token, a first registration over a loopback connection that carries no forwarding header (`X-Forwarded-For`, `Forwarded`, `X-Real-IP`, `CF-Connecting-IP`, `True-Client-IP`) SHALL need nothing more; any other registration, including one from a private address or through a proxy, SHALL require a one-time setup code, because behind a NAT, a port forwarder or a rootless container every client can arrive from a private address. The server SHALL generate the code at startup only while no account exists and no token is configured (80 random bits, shown as four groups of four base32 characters), print it once in its log at warning level with a sentence saying what it is for, accept it in the setup-token field ignoring case, spaces and dashes, compare it in constant time, count attempts against the registration rate limit, keep it only in memory and discard it once the owner exists. The authentication status SHALL say when the requesting client needs the setup code. Setup creates no ops, so offline behaviour and convergence are unaffected.

#### Scenario: Fresh server reports setup required
- **WHEN** a client asks for the authentication status of a server with zero accounts
- **THEN** the response states that setup is required and that sign-up is currently allowed

#### Scenario: First account becomes owner
- **WHEN** the first account is created with a valid email and password
- **THEN** the account has the role `owner`, a session is started for it, and the server no longer reports setup required

#### Scenario: Setup token required
- **WHEN** `OPENTODO_SETUP_TOKEN` is set and a client asks for the authentication status of a server with zero accounts
- **THEN** the response states that setup is required and that a setup token is required

#### Scenario: Wrong or missing setup token
- **WHEN** `OPENTODO_SETUP_TOKEN` is set, no account exists, and someone registers without the token or with a different one
- **THEN** the request is refused with a `setup_token_invalid` error, no account is created, and the attempt counts against the registration rate limit

#### Scenario: Correct setup token
- **WHEN** `OPENTODO_SETUP_TOKEN` is set, no account exists, and someone registers with a valid email, password and the configured token
- **THEN** the account has the role `owner` and a session is started for it

#### Scenario: Token ignored after setup
- **WHEN** an owner exists and someone registers with or without the setup token
- **THEN** the sign-up policy and invitations decide, exactly as without a token

#### Scenario: Setup code printed at startup
- **WHEN** the server starts with no account and no setup token
- **THEN** its log has one warning line with the setup code and how to use it, and no code is generated when a token is configured or an owner exists

#### Scenario: Setup from a public address
- **WHEN** no account exists, no setup token is set, and a client with a public address asks for the authentication status or registers without the code or with a wrong one
- **THEN** the status says a setup code is required, and the registration is refused with 403 `setup_code_invalid` and creates no account

#### Scenario: Setup from the local network
- **WHEN** no account exists, no setup token is set, and a client with a private address, or any client through a proxy (a forwarding header), registers without a code
- **THEN** the status says a setup code is required, and the registration is refused with 403 `setup_code_invalid` and creates no account, as from a public address

#### Scenario: Setup from this machine
- **WHEN** no account exists, no setup token is set, and a client connected over loopback without a forwarding header registers without a code
- **THEN** the account becomes the owner, and the status for that client says no setup code is required

#### Scenario: Correct setup code
- **WHEN** a client from another machine registers the first account with the code from the log, in any case and with or without its dashes
- **THEN** the account becomes the owner and the code no longer exists

### Requirement: Self-service password reset request
`POST /api/v1/auth/password-reset` with `{"email"}` SHALL need no authentication and SHALL always answer 202 with the same body. When the address belongs to an active account and password sign-in is allowed, the server SHALL issue a single-use reset link valid 24 hours, revoking earlier unused links of the account, and mail it as a `password_reset` message. The lookup and the delivery SHALL happen after the answer, so neither the content nor the time of the answer reveals whether the address exists. Reset links are server data, never synced; the request needs a connection.

#### Scenario: Existing account
- **WHEN** someone posts the address of an active account
- **THEN** the response is 202, a reset message with a link to `/reset/<token>` arrives, and `password.reset_issued` is recorded with no actor and the account as target

#### Scenario: Unknown or deactivated address
- **WHEN** someone posts an address with no account, or the address of a deactivated account
- **THEN** the response is the same 202 within a similar time and nothing is sent

#### Scenario: Slow mail server
- **WHEN** the mail server takes seconds to answer and someone posts the address of an active account
- **THEN** the 202 arrives as fast as for an unknown address and the message is sent afterwards

#### Scenario: Outgoing email not configured
- **WHEN** the route is called on a server without outgoing email
- **THEN** the response is a 404 `smtp_disabled` error

#### Scenario: Invalid body or rate limited
- **WHEN** the body is not JSON or has no valid email, or a client address exceeds 10 requests within one minute
- **THEN** the response is 400 `invalid_input` or 429 `rate_limited` respectively and nothing is sent

#### Scenario: SSO-only server
- **WHEN** single sign-on is in SSO-only mode
- **THEN** the response is 202 and nothing is sent, because password sign-in is disabled; the owner keeps the server-shell recovery
