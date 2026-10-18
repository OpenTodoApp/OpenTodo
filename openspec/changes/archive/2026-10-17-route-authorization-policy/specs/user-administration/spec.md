## MODIFIED Requirements

### Requirement: Using a reset link
`GET /api/v1/password-resets/{token}` and `POST /api/v1/password-resets/{token}` SHALL require no authentication. GET returns the account's email and the expiry. POST with `{"password"}` sets a new password under the password policy, marks the link used, and deletes every session and every remembered browser of the account in one transaction. It does not sign in. API tokens are kept. An unknown, used, expired or revoked token SHALL give the same 404 `reset_invalid` error.

#### Scenario: Reset succeeds
- **WHEN** someone posts a valid new password to a pending reset link
- **THEN** the response is 204, the old password no longer signs in, the new one does, all previous sessions get 401, remembered browsers are asked for the second factor again, and the link is now refused

#### Scenario: Link is used, expired or unknown
- **WHEN** a used, expired, revoked or unknown token is fetched or posted
- **THEN** the response is a 404 `reset_invalid` error with the same shape in every case

#### Scenario: Weak new password
- **WHEN** the posted password has fewer than 10 characters
- **THEN** the response is a 400 `invalid_input` error and the link stays pending

#### Scenario: No authentication needed but rate limited
- **WHEN** an anonymous client exceeds 10 fetch or post attempts on reset links within one minute
- **THEN** further attempts in that window are refused with a 429 `rate_limited` error
