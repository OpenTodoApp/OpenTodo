## Why

People connect AI apps such as Gemini, ChatGPT and Claude to their account over OAuth. Each connection is a grant with a refresh token and one short-lived access token. Today the only trace of it in Settings is the access token under API tokens, and deleting that token is undone by the app's next refresh. People should be able to see the AI apps connected to their account and disconnect them, as they already can for the signed-in OpenTodo apps.

## What Changes

- `GET /api/v1/me/oauth-grants`: the caller's own connected apps (client name, when connected, last use, `read` or `agent`, workspace limit).
- `DELETE /api/v1/me/oauth-grants/{id}`: disconnects one of the caller's apps: the grant is revoked (its refresh token is refused) and its access token deleted; refused on demo instances; recorded as the new audit event `mcp_oauth.disconnected`.
- Deleting a connected app's access token under **Settings → Integrations → API tokens** disconnects the app the same way.
- Settings → Account → Security → Session lists the connected apps next to the signed-in OpenTodo apps, with **Disconnect** and a confirmation.

Out of scope: renaming a connection, changing its scope or workspaces after the fact (connect again for that), and the owner's view of other people's connections (deleting a client already cuts off all of its grants).

No new environment variable, no op log change.

## Capabilities

### Modified Capabilities

- `mcp-server`: connected apps are listed for the person and can be disconnected; deleting an app's access token ends its grant.

## Impact

- New routes in `internal/httpapi/connected_apps.go`, a store query in `internal/mcpoauth/connected.go`, one audit event, docs (`docs/api.md`, `docs/mcp-oauth.md`, `docs/ai-and-agents.md`), the generated OpenAPI description and the v1 surface.
- Web: `web/src/app/ConnectedApps.tsx` and `web/src/lib/connectedApps.ts`, inside the lazily loaded Settings chunk; three new strings.
- No migration: the grants, clients and tokens tables already hold everything listed.
