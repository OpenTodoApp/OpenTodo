## MODIFIED Requirements

### Requirement: Trusted devices
When completing the second step, the user MAY ask to remember the device for 30 days; the server SHALL then set a separate HttpOnly cookie whose presence skips the second step for that account on that browser. Trusted devices SHALL be listed and revocable in Settings, and SHALL all be revoked when the second factor is disabled or reset, when the password is replaced through a reset link, and when the user signs out everywhere. The trust applies only to that browser profile; nothing is synced to other devices.

#### Scenario: Remembered browser
- **WHEN** a user who chose to remember the device signs in again from the same browser within 30 days
- **THEN** the password step starts the session directly

#### Scenario: Forget all devices
- **WHEN** the user revokes all trusted devices in Settings and signs in again from a previously remembered browser
- **THEN** the second step is required

#### Scenario: Password reset forgets devices
- **WHEN** the password of an enrolled account is replaced through a reset link (self-service or issued by an administrator) and the account signs in again from a previously remembered browser
- **THEN** the second step is required

### Requirement: Step-up for sensitive settings
Creating an API token, changing the password, disabling the second factor, regenerating recovery codes, and changing single sign-on, invitation or second-factor settings SHALL require, for cookie sessions, a re-authentication within the last ten minutes via `POST /api/v1/auth/reauth` with the password or a current code. Requests authenticated by a bearer token are never challenged and are unaffected by any second-factor setting; on these routes only an `admin` token SHALL be accepted, and other scopes SHALL get a 403 `insufficient_scope` error.

#### Scenario: Stale session creates a token
- **WHEN** a session whose last authentication is older than ten minutes creates an API token
- **THEN** the response is a 403 `reauth_required` error and no token is created

#### Scenario: After re-authentication
- **WHEN** the user re-authenticates and repeats the request within ten minutes
- **THEN** the request succeeds

#### Scenario: Script with a bearer token
- **WHEN** a script creates an API token with a valid `admin` bearer token on an account with a second factor
- **THEN** the request succeeds without any challenge, and the same request with a `full` token is a 403 `insufficient_scope` error

#### Scenario: Re-authentication abuse
- **WHEN** a client address exceeds 10 re-authentication attempts within one minute
- **THEN** further attempts in that window are refused with a 429 `rate_limited` error
