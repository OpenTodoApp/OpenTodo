# MCP OAuth: rotate refresh tokens and detect their reuse

## Why

The threat model (`docs/security/threat-model.md`, MCP and the agent write gate) lists a gap: an MCP OAuth grant's refresh token lasts 180 days, is extended on every refresh and never changes, so a copy of it keeps working until the owner deletes the client. OAuth 2.1 and the OAuth security best current practice (RFC 9700 §4.14) ask an authorization server to rotate refresh tokens and to revoke the token family when a used token is presented again, so a copied token is either superseded at the client's next refresh or ends the grant when it is replayed. Hardening item 6.2 of `external-security-review`.

## What Changes

- A refresh gives the client a new refresh token, and the one it sent stops working.
- A refresh token that was already exchanged, presented again by the client it was issued to, revokes the whole grant: its current refresh token and its access token stop working, and the audit log records the new event `mcp_oauth.refresh_reused` (client id only, never a token). The person authorizes again to reconnect, which starts a new family.
- A client whose redirect addresses are all Google's connector addresses (the Gemini preset and every dynamically registered client) keeps today's behaviour: the same refresh token with its expiry extended. Google's guide for connected apps requires that ("you must avoid rotating the Refresh Token during this exchange"), and rotating would unlink Gemini.
- The refresh token lifetime stays 180 days from the last refresh.

No new route or environment variable; one added table (`mcp_oauth_refresh_used`). Not **BREAKING**: a client that stores the refresh token each response returns, as RFC 6749 §6 allows a server to require, keeps working. A non-Google client that reuses its first refresh token is disconnected and must be authorized again.

Out of scope: rotation for Google's connector (needs Google to accept it), an owner setting for the lifetime, and sender-constrained tokens (DPoP).

ROADMAP: hardening of the shipped `mcp-oauth`; advances `external-security-review` (6.2). No new item.

## Capabilities

### Modified Capabilities

- `mcp-server`: "Refresh without rotation" becomes "Refresh token rotation and reuse detection".
- `audit-log`: "Recorded events" gains `mcp_oauth.refresh_reused`.

## Impact

- `internal/mcpoauth/mcpoauth.go` (`RotatesRefresh`, `RotateRefresh`, `GrantByUsedRefresh`), `internal/httpapi/mcp_oauth.go` (`oauthRefresh`), `internal/audit/events.go`, migration `0059_mcp_oauth_refresh_rotation.sql`.
- Web: the audit event's label in `auditFormat.ts` and `types.ts`, six catalogues.
- Docs: `docs/mcp-oauth.md`, `docs/api.md`, `docs/security/threat-model.md`; CHANGELOG `### Security`.
