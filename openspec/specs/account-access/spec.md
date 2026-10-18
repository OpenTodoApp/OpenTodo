# account-access Specification

## Purpose
Controls who can use a server: owner bootstrap on first run, sign-up policy, sign-in with sessions, API tokens for non-browser clients, and protection of cookie sessions against cross-site requests.

## Requirements

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

### Requirement: Sign-up policy
After the owner exists, creating further accounts SHALL be refused unless the operator enabled open sign-up through configuration or the registration carries a valid, unspent invitation. The policy SHALL be enforced on the server, not only hidden in the client.

#### Scenario: Sign-up closed by default
- **WHEN** an owner exists, open sign-up is not enabled, and someone attempts to register without an invitation
- **THEN** the request is refused with a `signup_closed` error and no account is created

#### Scenario: Operator opens sign-up
- **WHEN** the operator sets `OPENTODO_ALLOW_SIGNUP=true`, outgoing email is not configured, and someone registers with an unused email
- **THEN** an account with the role `member` is created

#### Scenario: Registration with a valid invitation
- **WHEN** open sign-up is not enabled and someone registers with an unused email and a valid, unspent invitation secret
- **THEN** an account with the role `member` is created and the invitation becomes spent, with no verification even when outgoing email is configured

#### Scenario: Duplicate email
- **WHEN** someone registers with an email that already has an account, compared case-insensitively, and verification does not apply
- **THEN** the request is refused with an `email_taken` error

### Requirement: Open sign-up is verified by email
When open sign-up is on and outgoing email is configured, a registration without an invitation SHALL create no account: the server stores a pending sign-up, mails a verification link valid 24 hours, and answers 202 whether or not the address already has an account.

#### Scenario: Open sign-up with verification
- **WHEN** open sign-up is on, outgoing email is configured, and someone registers with an unused email and a valid password
- **THEN** the response is 202 `{"verificationRequired": true}` with no session, no account exists yet, and a `verify_signup` message with a link to `/verify/<token>` is sent to the address

#### Scenario: Verification for an address that has an account
- **WHEN** open sign-up with verification is on and someone registers with an email that already has an account
- **THEN** the response is the same 202, no pending sign-up is stored, and the message sent instead says the address already has an account on this server and how to reset the password

### Requirement: Password policy and storage
Passwords SHALL be at least 10 characters and SHALL be stored only as a salted, memory-hard hash. The plaintext SHALL never be logged or returned.

#### Scenario: Short password rejected
- **WHEN** an account is created or a password is set with fewer than 10 characters
- **THEN** the request is refused with an `invalid_input` error naming the minimum length

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

### Requirement: Authentication required by default
Every API route except the health check and the authentication bootstrap routes SHALL require a valid session or API token.

#### Scenario: Anonymous request to a protected route
- **WHEN** a request without credentials reaches any `/api/v1/` route other than `auth/status`, `auth/register` or `auth/login`
- **THEN** the response is a 401 `unauthorized` error

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

### Requirement: Verifying a pending sign-up
`GET /api/v1/auth/verify/{token}` SHALL need no authentication and return the pending email and expiry. `POST /api/v1/auth/verify/{token}` SHALL create the account with the stored name and password, role `member`, consume the token and start a session, in one transaction, so a token creates at most one account. Registering the same address again SHALL replace the pending sign-up and invalidate the earlier token. Pending sign-ups are server data, never synced.

#### Scenario: Verification completes the account
- **WHEN** the person posts to the verify route with a pending token
- **THEN** the response is 201 with the user, a session cookie is set, the account has role `member`, and a `login.succeeded` event with method `register` is recorded

#### Scenario: Unknown, expired, replaced or used token
- **WHEN** the token is unknown, older than 24 hours, replaced by a later registration of the same address, or already used
- **THEN** both routes answer a 404 `verification_invalid` error with the same shape in every case

#### Scenario: Policy changed meanwhile
- **WHEN** open sign-up was turned off, or an account with the address was created by an invitation, before the token is used
- **THEN** the response is 403 `signup_closed` or 409 `email_taken` respectively and the pending sign-up is discarded

#### Scenario: Rate limited
- **WHEN** a client address exceeds 10 verify attempts within one minute
- **THEN** further attempts in that window are refused with a 429 `rate_limited` error

### Requirement: Self-service password reset request
`POST /api/v1/auth/password-reset` with `{"email"}` SHALL need no authentication and SHALL always answer 202 with the same body. When the address belongs to an active account and password sign-in is allowed, the server SHALL issue a single-use reset link valid 24 hours, revoking earlier unused links of the account, and mail it as a `password_reset` message. Nothing SHALL reveal whether the address exists. Reset links are server data, never synced; the request needs a connection.

#### Scenario: Existing account
- **WHEN** someone posts the address of an active account
- **THEN** the response is 202, a reset message with a link to `/reset/<token>` arrives, and `password.reset_issued` is recorded with no actor and the account as target

#### Scenario: Unknown or deactivated address
- **WHEN** someone posts an address with no account, or the address of a deactivated account
- **THEN** the response is the same 202 within a similar time and nothing is sent

#### Scenario: SSO-only server
- **WHEN** single sign-on is in SSO-only mode
- **THEN** the response is 202 and nothing is sent, because password sign-in is disabled; the owner keeps the server-shell recovery

#### Scenario: Outgoing email not configured
- **WHEN** the route is called on a server without outgoing email
- **THEN** the response is a 404 `smtp_disabled` error

#### Scenario: Invalid body or rate limited
- **WHEN** the body is not JSON or has no valid email, or a client address exceeds 10 requests within one minute
- **THEN** the response is 400 `invalid_input` or 429 `rate_limited` respectively and nothing is sent

### Requirement: Forgot password and verification screens
When the authentication status reports outgoing email, the sign-in screen SHALL show "Forgot password?" leading to `/forgot`, which asks for an email and shows the neutral confirmation. After a 202 registration the sign-up screen SHALL say to check the mailbox and offer a resend. `/verify/<token>` SHALL show the pending email and a "Create my account" action that completes the account, never on load alone. Offline, these screens SHALL say a connection is needed.

#### Scenario: Forgot password flow
- **WHEN** a visitor opens `/forgot`, enters an address and submits
- **THEN** the screen says that if an account exists a message is on its way, and offers the way back to sign-in

#### Scenario: Verification link opened by a scanner
- **WHEN** a mail scanner fetches `/verify/<token>` without activating the action
- **THEN** no account is created and the token stays pending

#### Scenario: Invalid verification link
- **WHEN** the preview answers `verification_invalid`
- **THEN** the screen explains that the link is no longer valid and offers to register again

#### Scenario: No outgoing email
- **WHEN** the authentication status reports `outgoingEmail.enabled: false`
- **THEN** the sign-in screen shows no "Forgot password?" link and `/forgot` shows the explanation that password resets go through an administrator on this server

### Requirement: A refused request from another host of the server is explained

When `OPENTODO_BASE_URL` is set and a browser request is refused because the page was opened at a host other than the base URL's, the server SHALL log one warning per such host, naming the host and the base URL, for at most 32 distinct hosts. The sign-in screen SHALL show the host the server is set up for instead of asking for a reload, when auth/status reports that host and it differs from the page's.

#### Scenario: Demo opened at its new domain with the old base URL
- **WHEN** the base URL is `https://opentodo-demo.pixari.dev` and a visitor on `https://demo.open-todo.app` presses "Try the demo" three times
- **THEN** each request is refused with 403 `bad_origin`, the log has exactly one warning naming `demo.open-todo.app` and the base URL, and the screen says the server is set up for `opentodo-demo.pixari.dev`

#### Scenario: A cross-site page is not reported
- **WHEN** a request to the same host carries an `Origin` of another site
- **THEN** it is refused as before and nothing is logged for it

#### Scenario: Made-up hosts cannot flood the log
- **WHEN** requests arrive for more than 32 different wrong hosts
- **THEN** warnings stop after 32 hosts

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

#### Scenario: Whole-server archive
- **WHEN** the owner of a hosted tenant downloads `GET /api/v1/export/archive` with a `full` token, an `admin` token, or a recently confirmed session
- **THEN** the `full` token gets a 403 `insufficient_scope` error and the other two get the archive, because it holds every account's credentials

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

### Requirement: Policy checked before hashing
The server SHALL check the sign-up policy, a first registration's setup token, an invitation or project invite link, the member limit and a password reset link before it hashes the submitted password, so a refused request costs no hash. These are server-side account checks: no op is written and devices are unaffected, offline or not.

#### Scenario: Closed sign-up costs no hash
- **WHEN** sign-up is closed and someone registers without an invitation
- **THEN** the response is 403 `signup_closed` and no password hash was computed

#### Scenario: Unknown invitation or reset link
- **WHEN** a registration carries an unknown invitation or project invite link, or a password reset uses an unknown link
- **THEN** the request is refused as before and no password hash was computed

### Requirement: Bounded password hashing
Password hashing and checking SHALL run at most twice the server's CPU count at a time (at least two); a request that cannot start within a second SHALL be answered 503 `busy` with `Retry-After` and change nothing. Sign-in SHALL refuse a password longer than 1,024 bytes with the usual 401 `invalid_credentials` without hashing it. No op is involved; devices are unaffected.

#### Scenario: Every hashing slot is busy
- **WHEN** every hashing slot stays in use for more than a second while a sign-in arrives
- **THEN** the response is 503 `busy` with a `Retry-After` header, no session is created, and the same request succeeds once a slot is free

#### Scenario: Over-long password at sign-in
- **WHEN** a sign-in submits a password of more than 1,024 bytes for an existing or an unknown address
- **THEN** the response is 401 `invalid_credentials` and no password hash was computed

### Requirement: Sign-in timing does not reveal password-less accounts
Sign-in with the address of an account that has no password (created by single sign-on or for a demo sandbox) SHALL cost the same password check as an unknown address or a wrong password and SHALL answer the same 401 `invalid_credentials`, so neither the answer nor its timing tells such an account apart.

#### Scenario: Password-less account
- **WHEN** someone signs in with a password for an account that has none
- **THEN** the server runs one password check against a dummy hash and answers 401 `invalid_credentials`

### Requirement: Coarse last-use times
The last-use time of an API token or an app password SHALL be updated when it is used and at most once a minute, so steady use does not cost a database write per request. A credential never used before SHALL get its first time on its first use. Authentication checks that need a request's token scope SHALL use the scope resolved when the request was authenticated instead of resolving the token again.

#### Scenario: Busy script
- **WHEN** a script sends many requests with the same token within a minute
- **THEN** the token's last-use time is written at most once in that minute

#### Scenario: First use
- **WHEN** a new token is used for the first time
- **THEN** its last-use time is set at once
