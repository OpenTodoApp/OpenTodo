# Spec Delta

## MODIFIED Requirements

### Requirement: Sign-up policy
After the owner exists, creating further accounts SHALL be refused unless the operator enabled open sign-up through configuration or the registration carries a valid, unspent invitation. The policy SHALL be enforced on the server, not only hidden in the client. When open sign-up is on and outgoing email is configured, a registration without an invitation SHALL create no account: the server stores a pending sign-up, mails a verification link valid 24 hours, and answers 202 whether or not the address already has an account.

#### Scenario: Sign-up closed by default
- **WHEN** an owner exists, open sign-up is not enabled, and someone attempts to register without an invitation
- **THEN** the request is refused with a `signup_closed` error and no account is created

#### Scenario: Operator opens sign-up
- **WHEN** the operator sets `OPENTODO_ALLOW_SIGNUP=true`, outgoing email is not configured, and someone registers with an unused email
- **THEN** an account with the role `member` is created

#### Scenario: Open sign-up with verification
- **WHEN** open sign-up is on, outgoing email is configured, and someone registers with an unused email and a valid password
- **THEN** the response is 202 `{"verificationRequired": true}` with no session, no account exists yet, and a `verify_signup` message with a link to `/verify/<token>` is sent to the address

#### Scenario: Verification for an address that has an account
- **WHEN** open sign-up with verification is on and someone registers with an email that already has an account
- **THEN** the response is the same 202, no pending sign-up is stored, and the message sent instead says the address already has an account on this server and how to reset the password

#### Scenario: Registration with a valid invitation
- **WHEN** open sign-up is not enabled and someone registers with an unused email and a valid, unspent invitation secret
- **THEN** an account with the role `member` is created and the invitation becomes spent, with no verification even when outgoing email is configured

#### Scenario: Duplicate email
- **WHEN** someone registers with an email that already has an account, compared case-insensitively, and verification does not apply
- **THEN** the request is refused with an `email_taken` error

## ADDED Requirements

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
