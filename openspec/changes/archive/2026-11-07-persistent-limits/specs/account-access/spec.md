## MODIFIED Requirements

### Requirement: Brute-force protection
Anonymous authentication routes SHALL be rate limited per client address, with one window per purpose: failed password sign-ins (successful sign-ins SHALL NOT count), registration and sign-up links, password reset requests and links, invitation and project-invite links, unknown public links, MCP requests without a valid token, and passkey sign-in, 10 per minute each. IPv6 client addresses SHALL be counted per /64 in every per-address limit. In addition, 10 failed passwords, second-factor codes or re-authentications for one account within 15 minutes SHALL lock that account's password sign-in, second step and re-authentication from every address until the window ends, checked before the credential is verified; a sign-in for an email without an account SHALL be counted and locked the same way. A successful sign-in SHALL clear the account's count. Limits are counted in server memory and kept in the server's database within a second of each change and when it stops, so a restart, an upgrade or a crash does not reset them (a crash may lose the last second of counts); they are not synced, so offline behaviour and convergence are unaffected. Stored keys are hashes, never the client address or email.

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

#### Scenario: Restart keeps the account locked
- **WHEN** an account is locked after 10 failed passwords and the server restarts within the 15 minutes
- **THEN** the next sign-in for it is still refused with 429 `account_locked` until the window ends

#### Scenario: Restart keeps an address's window
- **WHEN** a client used up its sign-in window and the server restarts within the minute
- **THEN** its next failed sign-in is still refused with 429 `rate_limited`
