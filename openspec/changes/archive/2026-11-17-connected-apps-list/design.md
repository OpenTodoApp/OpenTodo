# Design

## Context

- A grant (`mcp_oauth_grant`) is one person's authorization of one client: `scope`, `token_id` (the current access token, an `api_tokens` row named `MCP: <client name>`), `refresh_expires_at`, `revoked_at`, and its workspaces in `mcp_oauth_grant_workspaces`.
- `Store.RevokeGrant` marks a grant revoked and returns the access token to delete; `/oauth/revoke`, refresh-token reuse and deleting a client already use it.
- The signed-in OpenTodo apps (`app_sign_in_grant`) are listed by `GET /api/v1/me/apps` and shown inside the Session card by `AppSessions`.

## Decisions

### D1. Two routes under `/api/v1/me`, independent of the MCP switch

`GET /api/v1/me/oauth-grants` (signed in) and `DELETE /api/v1/me/oauth-grants/{id}` (signed in, refused on a demo, deny-list entry with the list readable). Neither checks the owner's MCP switch, so a connection stays visible and removable while MCP is off. A grant that is another person's, already revoked or unknown answers 404 alike, so ids reveal nothing. Like every `signedIn` write, the delete refuses read and agent tokens, so a connected app's own access token cannot disconnect anything.

### D2. What a row shows

The client's registered name, `createdAt`, `scope`, `workspaces` (empty for every workspace) and `lastUsedAt`: the later of the access token's last request and the last exchange (the access token's expiry less its one-hour lifetime), null before either. Revoked grants and grants whose refresh token expired are left out. No token, hash or id of a token is returned.

### D3. Disconnecting ends the grant, not only the token

The handler revokes the grant, then deletes the access token it held, then records `mcp_oauth.disconnected` (`oauth_client_id` and `method`: `connected_apps` or `api_token`; never the client's self-chosen name or a token). The refresh token is then refused with `invalid_grant`.

### D4. Deleting the access token under API tokens ends its grant

`DELETE /api/v1/tokens/{id}` reads the grant holding that token before deleting it; when the token belongs to one of the caller's live grants, the grant is revoked as in D3 with `method` `api_token`. An ordinary API token has no grant and nothing else changes. A refresh racing the deletion either finds the grant revoked or swaps onto it first; either way the grant id is stable and ends revoked.

### D5. The list sits in the Session card

`ConnectedApps` renders below `AppSessions` in **Settings → Account → Security → Session**, with the same `ListRow` and menu pattern; **Disconnect** opens a `ConfirmDialog`. Nothing renders while there are no connections. The component and its data module live in the Settings chunk, which is already loaded lazily, so the first load does not grow.

## Data model

None: no new table, column or op field.

## Interface budget

No new chrome above a list, no new sidebar destination, scroll region or shortcut: rows join an existing card and appear only for people who connected an app.

## Size

No dependency. Server binary and image size unchanged in practice; the web change is a few hundred bytes in the lazily loaded Settings chunk.
