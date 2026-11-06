## Context

`mcp-oauth` D6 chose a refresh token that never rotates, because Google's guide for connected apps (https://developers.google.com/connected-apps/mcp/oauth) requires the same refresh token back on a refresh. Every grant got that behaviour, also those of clients that are not Google's. The threat model names the consequence: a copied refresh token works for up to 180 days after the client last refreshed, unnoticed.

## Decisions

### D1 — Rotate per client, except Google's connector

`Client.RotatesRefresh()` is false only when every redirect address of the client is one of Google's six connector prefixes (or an address under one): the owner's Google preset and every dynamically registered client, which registration confines to those prefixes. Every other client rotates. The rule is derived from data the client already has, so no column, no setting and no change to the Settings screen.

Alternative considered: rotate for every client. Rejected for now because Google's guide says to avoid rotation, and unlinking Gemini would remove the reason OAuth exists on this server. Whether Gemini in practice stores a new refresh token is an open question for the owner (roadmap notes); switching Google's clients to rotation is a change to `RotatesRefresh` alone.

### D2 — The family is the grant

A grant (one person, one client) is the token family. `mcp_oauth_grant.refresh_hash` holds the current token's hash. A rotation runs in one transaction: `UPDATE … SET refresh_hash = new WHERE id = ? AND refresh_hash = old AND revoked_at = 0`, then the old hash goes into `mcp_oauth_refresh_used(refresh_hash, grant_id, used_at)`. When the update matches no row, the grant was revoked (`ErrRevoked`) or the token was exchanged by another request first (`ErrReused`). Two requests can therefore never both rotate one token.

### D3 — Reuse revokes

A refresh whose token is in `mcp_oauth_refresh_used` for a grant of the authenticated client, or that loses the rotation race in D2, revokes the grant with the existing `RevokeGrant` (revoked, access token cleared and deleted) and records `mcp_oauth.refresh_reused` (outcome `failure`, actor the person, `oauth_client_id`). The answer is `400 invalid_grant`. A used token presented with another client's credentials is answered as unknown and changes nothing, so one client cannot end another's grant.

Concurrent refreshes with one token count as reuse. A client that retries a refresh whose response it lost is disconnected and the person authorizes again; that is the price RFC 9700 accepts for detecting a replay, and the reason no grace period is kept.

### D4 — A new authorization starts a new family

`UpsertGrant` (a person pressing Allow again) clears the grant's used hashes along with setting a new refresh token, so the new connection is not held to the old one's tokens. Used hashes older than `RefreshTTL` are pruned on each rotation: such a token would have expired unrotated anyway. Deleting a client deletes its grants and, by the foreign key, their used hashes.

## Data model

One table, `mcp_oauth_refresh_used`, a server-only side table (no ops, nothing synced, offline behaviour and convergence unaffected). An active grant refreshing every hour adds one 64-character hash per refresh, at most about 4,300 rows over the 180-day window. No dependency; no effect on image size.

## Risks

- A non-Google client that does not store the rotated token is disconnected after its second refresh. The docs say so.
- Google's clients keep the gap the threat model describes, now stated as an accepted risk with its reason.
