## ADDED Requirements

### Requirement: MCP OAuth refresh reuse event

The server SHALL record `mcp_oauth.refresh_reused` with outcome `failure`, the person whose grant it was as actor and `oauth_client_id` in its details when a refresh token that a grant had already exchanged is presented again and the grant is revoked. The event SHALL NOT carry any token, code or secret. Settings SHALL show it in the audit log and in the person's recent activity with a translated label, and the owner SHALL be able to filter by it. It is server state, recorded online; offline behaviour and convergence are unaffected.

#### Scenario: Reuse is recorded without the token

- **WHEN** a grant is revoked because its used refresh token came back
- **THEN** the log contains one `mcp_oauth.refresh_reused` event with outcome `failure`, the person as actor and the client id, and no token value

#### Scenario: Only the owner reads it

- **WHEN** a member who is not the owner requests the server's audit log
- **THEN** the request is refused as for every other audit event
