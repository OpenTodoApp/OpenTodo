## MODIFIED Requirements

### Requirement: First-run owner setup
A server with no accounts SHALL let the first visitor create an account, and that account SHALL receive the owner role. The setup state SHALL be discoverable without authentication so the client can show the setup screen. When the operator configured a setup token, creating the first account SHALL require that token from every address; the token SHALL have no effect once an owner exists. Without a setup token, a first registration from a client whose address (resolved as `Client address from trusted proxies only` in `self-hosting` defines) is loopback, private or link-local SHALL need nothing more; from any other address it SHALL require a one-time setup code. The server SHALL generate the code at startup only while no account exists and no token is configured (80 random bits, shown as four groups of four base32 characters), print it once in its log at warning level with a sentence saying what it is for, accept it in the setup-token field ignoring case, spaces and dashes, compare it in constant time, count attempts against the registration rate limit, keep it only in memory and discard it once the owner exists. The authentication status SHALL say when the requesting client needs the setup code. Setup creates no ops, so offline behaviour and convergence are unaffected.

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
- **WHEN** no account exists, no setup token is set, and a client with a loopback or private address registers without a code
- **THEN** the account becomes the owner as before, and the status for that client says no setup code is required

#### Scenario: Correct setup code
- **WHEN** a client with a public address registers the first account with the code from the log, in any case and with or without its dashes
- **THEN** the account becomes the owner and the code no longer exists

### Requirement: Sign-in and sessions
A user SHALL sign in with email and password and receive a session delivered as an HttpOnly cookie with `SameSite=Lax`, marked `Secure` when the public base URL is https and whenever the request arrived over https (TLS on the connection, or `X-Forwarded-Proto: https` from a trusted proxy). Every cookie the server sets or clears SHALL follow the same rule. Sessions SHALL expire after the configured lifetime and SHALL be revocable by signing out. A deactivated account SHALL NOT sign in or be authenticated by any session or token; deactivation and password changes revoke sessions as `user-administration` defines.

#### Scenario: Successful sign-in
- **WHEN** valid credentials are submitted
- **THEN** the response sets the session cookie and returns the user's public profile

#### Scenario: Wrong credentials
- **WHEN** an unknown email or a wrong password is submitted
- **THEN** the response is a 401 with an `invalid_credentials` error that does not reveal whether the email exists

#### Scenario: Sign-out
- **WHEN** a signed-in user signs out
- **THEN** the session is deleted on the server, the cookie is cleared, and the old cookie value no longer authenticates

#### Scenario: Deactivated account signs in
- **WHEN** the correct email and password of a deactivated account are submitted
- **THEN** the response is a 403 `account_deactivated` error, no session cookie is set, and the user's last sign-in time is unchanged

#### Scenario: Deactivated account with a wrong password
- **WHEN** a deactivated account's email is submitted with a wrong password
- **THEN** the response is the same 401 `invalid_credentials` error as for any wrong password, so deactivation is revealed only to someone who knows the password

#### Scenario: Credentials of a deactivated account stop working
- **WHEN** a session cookie or API token belonging to an account that has since been deactivated is presented
- **THEN** the request is refused with a 401 `unauthorized` error

#### Scenario: Successful sign-in records the time
- **WHEN** an active account signs in with valid credentials
- **THEN** the account's last sign-in time is set to the time of that sign-in

#### Scenario: Secure cookie over https without a base URL
- **WHEN** no base URL is set and a sign-in arrives over TLS, or from a trusted proxy that sends `X-Forwarded-Proto: https`
- **THEN** the session cookie is marked `Secure`, while the same header from an untrusted peer is ignored

### Requirement: Brute-force protection
Anonymous authentication routes SHALL be rate limited per client address, with one window per purpose: failed password sign-ins (successful sign-ins SHALL NOT count), registration and sign-up links, password reset requests and links, invitation and project-invite links, unknown public links, MCP requests without a valid token, and passkey sign-in, 10 per minute each. IPv6 client addresses SHALL be counted per /64 in every per-address limit. In addition, 10 failed passwords, second-factor codes or re-authentications for one account within 15 minutes SHALL lock that account's password sign-in, second step and re-authentication from every address until the window ends, checked before the credential is verified; a sign-in for an email without an account SHALL be counted and locked the same way. A successful sign-in SHALL clear the account's count. Limits are server memory, not synced; they reset on restart.

#### Scenario: Repeated failures
- **WHEN** a client exceeds 10 failed sign-in attempts or 10 registration attempts within one minute
- **THEN** further attempts of that kind in that window are refused with a 429 `rate_limited` error

#### Scenario: Successful sign-ins do not count
- **WHEN** a client signs in successfully 15 times within one minute
- **THEN** every sign-in succeeds

#### Scenario: Separate windows
- **WHEN** a client uses up its window guessing password-reset or invitation links
- **THEN** its password sign-in is still answered normally

#### Scenario: Account locked
- **WHEN** an account has 10 failed passwords, codes or re-authentications within 15 minutes, from any addresses
- **THEN** the next sign-in, second step or re-authentication for it is refused with 429 `account_locked` and a `Retry-After` header, even with the correct password, until the window ends, and one `rate_limited` failure is recorded in the audit log

#### Scenario: Success clears failures
- **WHEN** an account with 9 failures signs in successfully
- **THEN** its count starts again from zero

#### Scenario: IPv6 neighbours
- **WHEN** two addresses in the same IPv6 /64 make attempts
- **THEN** they share one window

### Requirement: Cross-site request protection
A state-changing request authenticated by a session cookie SHALL be refused when its `Origin` header is present and does not match the server's public origin. With `OPENTODO_BASE_URL` set, an `Origin` that is not the base URL's origin SHALL be accepted only when it names the request's host and that host is the base URL's host, so a page under another name that resolves to the server (DNS rebinding) is cross-site. The same check guards registration and sign-in. Requests authenticated by a bearer token are not subject to this check.

#### Scenario: Cross-site POST with cookie
- **WHEN** a browser on another origin sends a POST that carries the session cookie
- **THEN** the response is a 403 `bad_origin` error and nothing changes

#### Scenario: Same-origin POST with cookie
- **WHEN** the app on the server's own origin sends a POST that carries the session cookie
- **THEN** the request is processed normally

#### Scenario: Rebound host name with a base URL
- **WHEN** `OPENTODO_BASE_URL` is `https://todo.example.com` and a request carries `Host: rebind.example` and `Origin: http://rebind.example`
- **THEN** it is refused with 403 `bad_origin`
