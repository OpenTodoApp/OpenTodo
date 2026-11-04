# Proposal

## Why

`/mcp` authenticates with an OpenTodo API token in the `Authorization: Bearer` header (`mcp-server` D2). That works for clients that let you paste a token, and not for the ones that don't: Google's Gemini Apps "Connected apps" feature refuses a server that only takes a bearer token — *"This MCP server uses an authentication method that Gemini doesn't support. Gemini requires standard OAuth for server connections."* Its dialog offers only a Client ID, a Client secret and a redirect address to copy, so the only way in is a real OAuth authorization server on the OpenTodo origin.

People already have OpenTodo tasks at an address like `https://tasks.example.com/mcp`; the missing piece is the four endpoints every MCP client expects (RFC 9728 protected-resource metadata, RFC 8414 authorization-server metadata, RFC 7591 registration, then authorize/token) and a way to hand out a client id and secret.

## What Changes

- **An OAuth 2.1 authorization server on the server's own origin.** `/.well-known/oauth-protected-resource` (and `/mcp` path variant) names the origin as the authorization server; `/.well-known/oauth-authorization-server` publishes the endpoints, `authorization_code` + `refresh_token`, `S256` and the scopes. `POST /oauth/register` implements RFC 7591 dynamic client registration; `GET /oauth/authorize`, `POST /oauth/token` and `POST /oauth/revoke` complete the flow.
- **Access tokens are ordinary OpenTodo API tokens.** The exchange mints a scoped `ot_` token through the existing token service, so `/mcp` needs no new authentication path: its 401 challenge gains `resource_metadata`, and its scope rules (`read`, `agent`) and switches are unchanged.
- **Two ways to get a client.** The owner creates one in Settings → Integrations → AI assistants: a name, a scope and a secret shown once. Or the client registers itself dynamically, which is what Gemini does — accepted only for Google's documented redirect addresses (`https://oauth-redirect{,-sandbox,-test}.googleusercontent.com/r|a/*`), so an arbitrary website cannot register a client and then collect a code.
- **Refresh tokens that do not rotate.** One grant per client and person; the refresh token stays the same across refreshes and lasts 180 days, which is what keeps a Gemini connection linked instead of asking to reconnect. Access tokens live an hour.
- **No consent screen.** A client exists only because the person created it or because it is Google's, and the authorize step still requires a signed-in browser session; being sent to sign in and back is the whole interaction. Write access additionally needs the owner's MCP switch and the person's own "Allow AI assistants to make changes" switch, so a grant alone never writes.
- **Off with MCP.** While the owner's AI assistants switch is off, the well-known documents and the OAuth endpoints answer 404 exactly as `/mcp` does.

Not **BREAKING**: no op field, no sync format, no change to existing tokens or routes.

## Out of scope

- OpenID Connect (`openid`/`profile`/`email`) and an ID token: Gemini needs an authorization server, not an identity provider. `/.well-known/openid-configuration` is not served.
- Device-code, implicit and client-credentials grants, and JWT access tokens. Opaque `ot_` tokens keep one validation path and one revocation point.
- Per-tool or per-project scopes. The scope pair is `read` and `agent`, matching the token scopes that already exist.
- A consent screen with a scope checklist. Revisit if OpenTodo ever accepts clients it did not create itself.
- Making CalDAV or the REST API OAuth-protected.

## Roadmap

Completes the "connect from an AI client" half of the MCP row in ROADMAP.md and the AI-agents pillar of `docs/ai-and-agents.md`, for clients that require OAuth instead of a pasted token.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-server`: OAuth 2.1 discovery, dynamic and manual client registration, the authorization-code + PKCE flow, refresh without rotation, revocation, and OAuth access tokens on `/mcp`.

## Impact

- **Data model, sync, op schema, E2EE:** none. Three server tables outside the op log (`mcp_oauth_client`, `mcp_oauth_code`, `mcp_oauth_grant`); client secrets, codes and refresh tokens are stored as hashes.
- **API:** adds `GET /.well-known/oauth-protected-resource` (+ `/mcp`), `GET /.well-known/oauth-authorization-server`, `POST /oauth/register`, `GET /oauth/authorize`, `POST /oauth/token`, `POST /oauth/revoke`, and `GET`/`POST`/`DELETE /api/v1/settings/mcp/clients` for the owner. The `/mcp` 401 challenge gains `resource_metadata`.
- **CLI, CalDAV, vault:** none.
- **Outbound:** none. The flow is entirely inbound; the server never calls Google.
- **Binary and bundle size:** about 12 KB of Go, no dependency; under 3 KB gzip in the lazy Settings chunk for the client list and the create form.
