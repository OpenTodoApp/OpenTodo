## ADDED Requirements

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
