# Spec Delta

## Purpose
Adds a time-based one-time password as a second factor for password sign-in, with recovery codes, trusted devices, an owner policy that can require it, step-up re-authentication for sensitive settings, and owner reset for locked-out members.

## ADDED Requirements

### Requirement: Second-factor enrolment
A signed-in user without a second factor SHALL be able to start enrolment through `POST /api/v1/mfa/totp/enroll`, receiving a fresh secret and a provisioning URI valid for ten minutes, and SHALL activate it through `POST /api/v1/mfa/totp/confirm` with a code generated from that secret. The secret SHALL be returned only by the enrol step. Enrolment state is server-side account data, never synced, and requires a network connection.

#### Scenario: Enrol and confirm
- **WHEN** the user starts enrolment, scans the code in an authenticator app and submits a current code
- **THEN** the confirm response is 200, the account is marked as protected, and the response contains the recovery codes

#### Scenario: Anonymous request
- **WHEN** a request without credentials calls either enrolment route
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Wrong or stale confirmation code
- **WHEN** the submitted code does not match the pending secret within one time step of tolerance, or the pending secret is older than ten minutes
- **THEN** the response is a 400 `mfa_code_invalid` error and the account remains unprotected

#### Scenario: Already enrolled
- **WHEN** an account that already has a confirmed second factor starts enrolment
- **THEN** the response is a 409 `mfa_already_enrolled` error

### Requirement: Recovery codes
Confirming enrolment SHALL produce ten single-use recovery codes shown exactly once and stored only as hashes. A recovery code SHALL complete the second step like a code from the app and SHALL be consumed by that use. The user SHALL be able to see how many remain and to regenerate the full set through `POST /api/v1/mfa/recovery-codes/regenerate`, which invalidates all previous codes and requires a fresh re-authentication.

#### Scenario: Use a recovery code
- **WHEN** the user completes the second step with an unused recovery code
- **THEN** a session is started and the remaining count drops by one

#### Scenario: Reuse refused
- **WHEN** the same recovery code is presented again
- **THEN** the response is a 401 `mfa_code_invalid` error

#### Scenario: Regenerate
- **WHEN** a recently re-authenticated user regenerates the codes
- **THEN** ten new codes are returned once and every earlier code stops working

### Requirement: Second step at sign-in
For an account with a confirmed second factor, a correct password SHALL NOT start a session; the sign-in response SHALL instead carry `mfaRequired: true` and a single-use challenge valid for five minutes. `POST /api/v1/auth/mfa` with the challenge and a valid code or recovery code SHALL start the session under the same cookie rules as before. A challenge allows five attempts; the route is rate limited per client address. A passkey sign-in with user verification satisfies the second factor.

#### Scenario: Two-step sign-in
- **WHEN** an enrolled user submits a correct password and then a current code with the challenge
- **THEN** the first response has no session cookie and `mfaRequired: true`, and the second response sets the session cookie and returns the profile

#### Scenario: Wrong code and exhausted challenge
- **WHEN** five wrong codes are submitted for one challenge
- **THEN** each is refused with a 401 `mfa_code_invalid` error and the sixth attempt is refused with a 401 `mfa_challenge_invalid` error, requiring the password step again

#### Scenario: Replayed code
- **WHEN** a code that already completed a sign-in is presented again within its validity window
- **THEN** the response is a 401 `mfa_code_invalid` error

#### Scenario: Passkey sign-in
- **WHEN** an enrolled user signs in with a passkey that reports user verification
- **THEN** the session starts without a code prompt

### Requirement: Trusted devices
When completing the second step, the user MAY ask to remember the device for 30 days; the server SHALL then set a separate HttpOnly cookie whose presence skips the second step for that account on that browser. Trusted devices SHALL be listed and revocable in Settings, and SHALL all be revoked when the second factor is disabled or reset. The trust applies only to that browser profile; nothing is synced to other devices.

#### Scenario: Remembered browser
- **WHEN** a user who chose to remember the device signs in again from the same browser within 30 days
- **THEN** the password step starts the session directly

#### Scenario: Forget all devices
- **WHEN** the user revokes all trusted devices in Settings and signs in again from a previously remembered browser
- **THEN** the second step is required

### Requirement: Owner policy
The owner SHALL set through `GET`/`PUT /api/v1/settings/mfa` whether the second factor is optional, required for the owner, or required for every account. When required and not yet enrolled, a sign-in SHALL succeed but the session SHALL be restricted to the profile, enrolment, re-authentication and sign-out routes until enrolment is confirmed. The policy is server state, not synced; clients learn it from the profile response.

#### Scenario: Owner requires it for everyone
- **WHEN** the policy is set to "everyone" and an unenrolled member signs in and requests their tasks
- **THEN** the sign-in succeeds, the tasks request is refused with a 403 `mfa_enrolment_required` error, and the enrolment routes work

#### Scenario: Member cannot change policy
- **WHEN** a member or an anonymous request writes the policy
- **THEN** the response is a 403 `forbidden` error for the member and a 401 `unauthorized` error for the anonymous request

#### Scenario: Offline app under a new policy
- **WHEN** a device that signed in before the policy changed is opened offline
- **THEN** it opens to the locally stored tasks, and the restriction applies on the next successful request

### Requirement: Step-up for sensitive settings
Creating an API token, changing the password, disabling the second factor, regenerating recovery codes, and changing single sign-on, invitation or second-factor settings SHALL require, for cookie sessions, a re-authentication within the last ten minutes via `POST /api/v1/auth/reauth` with the password or a current code. Requests authenticated by a bearer token are never challenged and are unaffected by any second-factor setting.

#### Scenario: Stale session creates a token
- **WHEN** a session whose last authentication is older than ten minutes creates an API token
- **THEN** the response is a 403 `reauth_required` error and no token is created

#### Scenario: After re-authentication
- **WHEN** the user re-authenticates and repeats the request within ten minutes
- **THEN** the request succeeds

#### Scenario: Script with a bearer token
- **WHEN** a script creates an API token with a valid bearer token on an account with a second factor
- **THEN** the request succeeds without any challenge

#### Scenario: Re-authentication abuse
- **WHEN** a client address exceeds 10 re-authentication attempts within one minute
- **THEN** further attempts in that window are refused with a 429 `rate_limited` error

### Requirement: Disabling and owner reset
A user SHALL be able to disable their second factor through `DELETE /api/v1/mfa/totp` after a fresh re-authentication unless the owner policy requires it for that account. The owner SHALL be able to reset a member's second factor through `POST /api/v1/members/{id}/mfa/reset`, which removes the secret, recovery codes and trusted devices and, under a requiring policy, restricts the member's sessions until re-enrolment.

#### Scenario: Disable allowed
- **WHEN** the policy is optional and a re-authenticated user disables the second factor
- **THEN** the response is 204, the next sign-in needs only the password, and all trusted devices are forgotten

#### Scenario: Disable refused by policy
- **WHEN** the policy requires the factor for the account and the user tries to disable it
- **THEN** the response is a 403 `mfa_required_by_policy` error

#### Scenario: Owner resets a locked-out member
- **WHEN** the owner resets a member who lost their authenticator and recovery codes
- **THEN** the member can sign in with their password alone (and must re-enrol if the policy requires it), and a member calling the route gets a 403 `forbidden` error

### Requirement: Security settings for the second factor
Settings SHALL show the second-factor status, an enrolment wizard that renders the QR code locally from the provisioning URI with a manual-entry key, the recovery codes once with copy and download actions, the remaining count, trusted devices with revoke, and, for the owner, the policy. A `reauth_required` answer anywhere SHALL open a re-authentication dialog and retry. All controls SHALL be keyboard reachable and read-only offline.

#### Scenario: Enrolment wizard
- **WHEN** the user starts enrolment in Settings
- **THEN** a QR code and the manual key are displayed, a code field confirms, and the recovery codes appear once with copy and download

#### Scenario: Offline settings
- **WHEN** Settings is opened without a network connection
- **THEN** the second-factor status is shown from the cached profile and every control is disabled with an explanation
