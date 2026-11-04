## ADDED Requirements

### Requirement: Protected-resource metadata

The server SHALL serve `GET /.well-known/oauth-protected-resource` and `GET /.well-known/oauth-protected-resource/mcp` with `resource` naming `<origin>/mcp`, `authorization_servers` naming the origin, `scopes_supported` `["read","agent"]` and `bearer_methods_supported` `["header"]`. Both SHALL be anonymous and SHALL answer 404 while the owner's MCP setting is off.

#### Scenario: A client discovers the resource

- **WHEN** an anonymous client reads `/.well-known/oauth-protected-resource` on a server whose base URL is `https://tasks.example.com`
- **THEN** the response is 200 with `resource` = `https://tasks.example.com/mcp` and that same origin as the only authorization server

#### Scenario: Discovery while MCP is off

- **WHEN** the owner's MCP setting is off and a client reads either document
- **THEN** the response is 404

### Requirement: Authorization-server metadata

The server SHALL serve `GET /.well-known/oauth-authorization-server` with `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `revocation_endpoint`, `response_types_supported` containing `code`, `grant_types_supported` containing `authorization_code` and `refresh_token`, `code_challenge_methods_supported` `["S256"]` and `scopes_supported`. It SHALL be anonymous and SHALL answer 404 while MCP is off.

#### Scenario: The metadata names the flow

- **WHEN** a client reads the authorization-server document
- **THEN** the authorize, token, registration and revocation endpoints are absolute addresses under the server's origin

### Requirement: Owner-managed clients

The owner SHALL create clients through `GET`, `POST` and `DELETE /api/v1/settings/mcp/clients`, each with a name, a scope of `read` or `agent` and a redirect list, and `POST` SHALL return the client secret exactly once and never again. A member SHALL be refused with 403.

#### Scenario: The secret is shown once

- **WHEN** the owner creates a client and then reads the client list
- **THEN** the create response carries the secret and the list reports only that a secret is set

#### Scenario: A member cannot manage clients

- **WHEN** a member calls `POST /api/v1/settings/mcp/clients`
- **THEN** the response is 403 and no client is created

### Requirement: Dynamic registration only for Google

`POST /oauth/register` SHALL implement RFC 7591 for redirect addresses on `oauth-redirect`, `oauth-redirect-sandbox` and `oauth-redirect-test` `.googleusercontent.com` under `/r/` and `/a/` only, SHALL issue a confidential client with scope `read`, and SHALL refuse every other address with 400 `invalid_redirect_uri`. Registration SHALL be limited to five a minute per client address, SHALL remove dynamic clients nobody authorized within a day, and SHALL refuse with 503 while 200 dynamic clients remain.

#### Scenario: A foreign redirect is refused

- **WHEN** an anonymous caller registers `https://evil.example/cb`
- **THEN** the response is 400 `invalid_redirect_uri` and no client is created

#### Scenario: Registration is rate limited

- **WHEN** one address registers a sixth client within a minute
- **THEN** the response is 429 `rate_limited` and no client is created

#### Scenario: A Google connector registers

- **WHEN** an anonymous caller registers `https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-123`
- **THEN** the response is 201 with a client id, a secret and scope `read`

### Requirement: Secrets are stored hashed

Client secrets, authorization codes and refresh tokens SHALL be stored only as SHA-256 hashes and compared in constant time, and no secret, code or token value SHALL be logged or audited.

#### Scenario: Nothing replayable is stored

- **WHEN** a client, a code and a grant exist
- **THEN** the database rows hold hashes and the audit entries name ids only

### Requirement: Authorize requires a session

`GET /oauth/authorize` SHALL require a signed-in browser session and SHALL refuse API tokens. A browser without a session SHALL be sent to the app with the authorize address to return to. A browser with a session SHALL be sent to the app's consent screen (`/?oauth_consent=<request>`) and SHALL NOT receive a code from the authorize address itself.

#### Scenario: No session, no code

- **WHEN** an anonymous browser opens the authorize address
- **THEN** it is redirected to `/?oauth=<authorize address>` and no code is issued

#### Scenario: A link alone grants nothing

- **WHEN** a signed-in person opens a valid authorize address someone sent them
- **THEN** the browser is sent to the consent screen and no code is issued

### Requirement: Consent issues the code

The consent screen SHALL name the client, the scope it would receive and the host of its redirect address, through `GET /api/v1/me/mcp-consent`. `POST /api/v1/me/mcp-consent` with `{query, allow}` SHALL accept only a browser session, never an API token, and SHALL validate the request again. Allow SHALL issue a single-use code and answer the registered address with `code` and the client's `state`; Deny SHALL answer it with `error=access_denied` and no code.

#### Scenario: Allow returns a code

- **WHEN** the signed-in person presses Allow for a valid request with `state=abc`
- **THEN** the answer is the registered redirect with a `code` and `state=abc`

#### Scenario: Deny returns no code

- **WHEN** the person presses Cancel
- **THEN** the answer is the registered redirect with `error=access_denied` and no `code`

#### Scenario: A token cannot consent

- **WHEN** a request to `POST /api/v1/me/mcp-consent` carries an API token instead of a session
- **THEN** it is refused and no code is issued

### Requirement: Authorize validates and redirects

The authorize step and the consent calls SHALL validate the client, the registered `redirect_uri`, `response_type=code` and `code_challenge_method=S256`, answering 400 without a `Location` when the client or address is wrong. The code's scope SHALL be the client's own: the request neither widens nor narrows it.

#### Scenario: An agent client stays writable

- **WHEN** an `agent` client authorizes with `scope=read` because that is the first scope the metadata lists
- **THEN** the code carries `agent` and the token response reports `agent`

#### Scenario: An unknown redirect is not redirected to

- **WHEN** the `redirect_uri` is not registered for the client
- **THEN** the response is 400 and carries no `Location` header

### Requirement: Codes are single use

A code SHALL be stored as a hash with a 60-second expiry, SHALL be deleted in the same statement that reads it, and SHALL be bound to the client, the person, the redirect address and the PKCE challenge.

#### Scenario: A code is exchanged once

- **WHEN** the same code is exchanged twice
- **THEN** the second response is 400 `invalid_grant`

### Requirement: Code exchange enforces PKCE

`POST /oauth/token` SHALL accept `authorization_code` with `code_verifier`, authenticating the client with `client_secret_post` or `client_secret_basic`, SHALL verify the S256 challenge and the registered redirect address, and SHALL mint an OpenTodo API token of the granted scope.

#### Scenario: PKCE is enforced

- **WHEN** the token request sends a verifier that does not match the challenge
- **THEN** the response is 400 `invalid_grant` and no token is minted

### Requirement: Refresh without rotation

`grant_type=refresh_token` SHALL return the same refresh token with its expiry extended and a new access token, revoking the previous access token. A refresh token SHALL last 180 days and an access token one hour; an access token SHALL stop authenticating once its hour is over, even if it was never refreshed or revoked. A new access token SHALL replace the grant's previous one only while the grant still holds it, so concurrent refreshes leave one access token per grant.

#### Scenario: An access token expires

- **WHEN** an access token is used more than an hour after it was issued
- **THEN** `/mcp` answers 401 and the token no longer appears in the person's token list

#### Scenario: Concurrent refreshes leave one token

- **WHEN** a client sends several refreshes of the same grant at once
- **THEN** afterwards the person holds exactly one access token for that grant

#### Scenario: Refresh keeps the link

- **WHEN** the client refreshes with the token it was given
- **THEN** the response carries the same refresh token and a new access token, and the old access token stops working

### Requirement: Revocation

`POST /oauth/revoke` SHALL authenticate the client as the token endpoint does, SHALL accept that client's refresh token or the access token one of its grants holds, revoke the grant and its access token, and answer 200 for any other token without changing it, including another client's tokens and ordinary API tokens. Deleting a client SHALL cut off every grant issued for it in one transaction.

#### Scenario: Revoking a grant

- **WHEN** the client posts its refresh token to `/oauth/revoke`
- **THEN** that refresh token and its access token are refused afterwards

#### Scenario: Revoke needs the client

- **WHEN** a caller posts a token to `/oauth/revoke` without the client's id and secret
- **THEN** the response is 401 `invalid_client` and nothing is revoked

#### Scenario: Revoke leaves other tokens alone

- **WHEN** a client posts a personal API token or another client's token to `/oauth/revoke`
- **THEN** the response is 200 and that token keeps working

#### Scenario: Deleting the client cuts the grant off

- **WHEN** the owner deletes the client a grant was issued for
- **THEN** its access token and refresh token are refused afterwards

### Requirement: OAuth access tokens are API tokens on /mcp

An access token from the exchange SHALL authenticate `/mcp` by the existing bearer path as the person who authorized it: a `read` client reaches the read tools only, and an `agent` client additionally needs the owner's MCP setting and the person's agent-access switch for writes. The `/mcp` 401 challenge SHALL name the protected-resource document.

#### Scenario: A read grant reads but does not write

- **WHEN** a turn arrives on `/mcp` with the access token of a `read` grant
- **THEN** the read tools answer for that person and a write tool answers its read-only refusal

#### Scenario: The challenge points at discovery

- **WHEN** `/mcp` is called without a token while MCP is enabled
- **THEN** the response is 401 with `WWW-Authenticate` carrying a `resource_metadata` parameter that resolves to the protected-resource document
