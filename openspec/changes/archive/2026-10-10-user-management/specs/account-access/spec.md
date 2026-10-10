# Spec Delta

## MODIFIED Requirements

### Requirement: Sign-in and sessions
A user SHALL sign in with email and password and receive a session delivered as an HttpOnly cookie with `SameSite=Lax`, marked `Secure` when the public base URL is https. Sessions SHALL expire after the configured lifetime and SHALL be revocable by signing out. A deactivated account SHALL NOT sign in or be authenticated by any session or token; deactivation and password changes revoke sessions as `user-administration` defines.

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
