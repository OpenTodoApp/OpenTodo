## ADDED Requirements

### Requirement: Connected apps in Settings

The server SHALL list a signed-in person's own OAuth grants that are neither revoked nor expired at `GET /api/v1/me/oauth-grants`, each with the client's registered name, when it was connected, its last use, its scope (`read` or `agent`) and its workspace limit, and never a token. `DELETE /api/v1/me/oauth-grants/{id}` SHALL revoke one of the caller's grants and delete its current access token in the same request, record `mcp_oauth.disconnected`, and answer 404 for another person's, a revoked or an unknown grant. Both routes SHALL work while the owner's MCP switch is off; the delete SHALL be refused on a demo instance. Settings → Account → Security → Session SHALL list the connected apps next to the signed-in OpenTodo apps, each with Disconnect behind a confirmation. Grants are server state outside the op log: nothing syncs, and a device that is offline sees the list only once it is online again.

#### Scenario: A person sees their own connected apps

- **WHEN** a signed-in person who connected Gemini with the `agent` scope requests `GET /api/v1/me/oauth-grants`
- **THEN** the answer lists Gemini with its scope, when it was connected and when it was last used, and lists no other person's grants

#### Scenario: Disconnecting ends the app's access

- **WHEN** the person disconnects the app and confirms
- **THEN** its access token is refused with 401 and its refresh token with `invalid_grant`, the app is no longer listed, and `mcp_oauth.disconnected` is recorded with the client id

#### Scenario: Another person's grant

- **WHEN** a person sends `DELETE /api/v1/me/oauth-grants/{id}` for a grant of another person
- **THEN** the answer is 404 `not_found` and that grant keeps working

#### Scenario: Authentication required

- **WHEN** either route is called without a session or token
- **THEN** the answer is 401

#### Scenario: Demo instance

- **WHEN** a demo visitor sends `DELETE /api/v1/me/oauth-grants/{id}`
- **THEN** the answer is 403 `demo_restricted`

### Requirement: Deleting an app's access token ends its grant

Deleting the access token of one of the person's grants with `DELETE /api/v1/tokens/{id}` SHALL also revoke that grant, so its refresh token cannot mint another access token, and SHALL record `mcp_oauth.disconnected`. Deleting an ordinary API token SHALL leave every grant unchanged.

#### Scenario: The refresh after the token was deleted

- **WHEN** a person deletes `MCP: Gemini` under Settings → Integrations → API tokens and Gemini then refreshes
- **THEN** the refresh is refused with `invalid_grant` and Gemini is no longer listed among the connected apps

#### Scenario: An ordinary token

- **WHEN** a person deletes an API token they created themselves
- **THEN** no grant is revoked
