## RENAMED Requirements

- FROM: `### Requirement: Refresh without rotation`
- TO: `### Requirement: Refresh token rotation and reuse detection`

## MODIFIED Requirements

### Requirement: Refresh token rotation and reuse detection

`grant_type=refresh_token` SHALL return a new access token, revoking the previous access token. For a client with any redirect address outside Google's connector addresses, it SHALL also return a new refresh token and the refresh token sent SHALL stop working; the new token SHALL replace the old one only while the grant is live and still holds the old one, in one transaction. A refresh token that the grant already exchanged, presented again with the credentials of the client it was issued to, SHALL revoke the grant: its current refresh token and its access token stop working, the answer is 400 `invalid_grant`, and the audit log records `mcp_oauth.refresh_reused`. Concurrent refreshes with one token SHALL count as such a reuse. A used token presented with another client's credentials SHALL be answered as unknown and SHALL change nothing. A new authorization of the same client by the same person SHALL start a new token family. For a client whose every redirect address is one of Google's connector addresses, the refresh SHALL return the same refresh token with its expiry extended, as Google's guide for connected apps requires. A refresh token SHALL last 180 days from its last refresh and an access token one hour; an access token SHALL stop authenticating once its hour is over, even if it was never refreshed or revoked. A new access token SHALL replace the grant's previous one only while the grant still holds it, so concurrent refreshes leave at most one access token per grant. Grants are server state, not ops: offline behaviour and convergence are unaffected.

#### Scenario: An access token expires

- **WHEN** an access token is used more than an hour after it was issued
- **THEN** `/mcp` answers 401 and the token no longer appears in the person's token list

#### Scenario: Refresh rotates the token

- **WHEN** a client registered for its own redirect address refreshes with the token it was given
- **THEN** the response carries a new refresh token and a new access token, and the old access token stops working

#### Scenario: A used refresh token revokes the grant

- **WHEN** that client, after a successful refresh, sends the refresh token it had before
- **THEN** the response is 400 `invalid_grant`, the newest refresh token and the current access token stop working, the person holds no access token for that grant, and the audit log has one `mcp_oauth.refresh_reused` event with the client id and no token

#### Scenario: Another client cannot end a grant

- **WHEN** another client sends a used refresh token of the first client's grant with its own credentials
- **THEN** the response is 400 `invalid_grant` and the first client's grant keeps working

#### Scenario: Concurrent refreshes with one token

- **WHEN** a rotating client sends several refreshes with the same token at once
- **THEN** at most one of them succeeds, the grant is revoked, and the person holds no access token for it

#### Scenario: Authorizing again reconnects

- **WHEN** the person allows the client again after its grant was revoked for reuse
- **THEN** the exchange returns working tokens and their refresh succeeds

#### Scenario: Refresh keeps the link

- **WHEN** a client registered with the Google preset refreshes with the token it was given
- **THEN** the response carries the same refresh token and a new access token, and the old access token stops working

#### Scenario: Concurrent refreshes leave one token

- **WHEN** Google's connector sends several refreshes of the same grant at once
- **THEN** afterwards the person holds exactly one access token for that grant
