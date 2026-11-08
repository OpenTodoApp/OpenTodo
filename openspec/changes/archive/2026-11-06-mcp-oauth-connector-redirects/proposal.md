# MCP OAuth: accept ChatGPT's and Claude's redirect addresses

## Why

A person tried to connect ChatGPT to `/mcp` with an OAuth client created in Settings and got `{"error":"invalid_request","error_description":"redirect_uri is not registered for this client"}`. `mcp-oauth` (0.23.0, #876) made Google's six connector prefixes the only redirect allow-list: dynamic registration accepts nothing else, and the Settings screen creates every client with Google's preset. ChatGPT and claude.ai send their own redirect addresses, so neither can connect, although the 0.23.0 release notes, the blog post and the closing comment of #798 say they can.

## What Changes

- A small table of known AI connector platforms (Google Gemini, OpenAI ChatGPT, Anthropic Claude) replaces the Google-only list. Each entry names the redirect addresses its provider documents, as exact addresses or as a prefix followed by one opaque path segment, with the source.
  - Google: the six `oauth-redirect{,-sandbox,-test}.googleusercontent.com/{r,a}/` prefixes (unchanged).
  - ChatGPT: `https://chatgpt.com/connector_platform_oauth_redirect` (exact) and `https://chatgpt.com/connector/oauth/` (prefix).
  - Claude: `https://claude.ai/api/mcp/auth_callback` and `https://claude.com/api/mcp/auth_callback` (exact).
- Dynamic registration (`POST /oauth/register`) accepts addresses from that table only, all from one platform, and stores that platform's set, so it stays closed to arbitrary sites.
- A client created in Settings is made for a platform (Gemini, ChatGPT or Claude) or for one custom redirect address, which must be an absolute `https` address, matched exactly, with no wildcard. `POST /api/v1/settings/mcp/clients` gains `platform`; `redirect_uris` given there are validated the same way. Without either, the Google preset stays the default.
- Prefix matching applies only to a platform's own prefixes. A stored address that ends in `/` but is not one of them matches exactly, which closes an unintended prefix match for clients registered through the API with such an address.
- Refresh-token rotation is unchanged: only Google's clients keep their refresh token; ChatGPT's and Claude's clients rotate, which both providers' documentation allows.
- The consent screen still names the redirect host.

No new environment variable, table or op. Not **BREAKING**: Google clients, dynamic or created in Settings, behave as before; an API-created client whose address ends in `/` now needs the exact address.

Out of scope: Claude Code's loopback redirects (`http://localhost:<any port>/callback`; Claude Code takes an `agent` token in a header instead), Client ID Metadata Documents (CIMD), public clients (`token_endpoint_auth_method: none`), RFC 9207 issuer identification in the authorization response (it would let ChatGPT use its stable address; both are accepted), and any `chat.openai.com` address (not in OpenAI's documentation).

ROADMAP: a fix to the shipped `mcp-oauth` row; no new item.

## Capabilities

### Modified Capabilities

- `mcp-server`: "Owner-managed clients" names the platform or custom address and its validation; "Dynamic registration only for Google" becomes "Dynamic registration only for known connector platforms"; "Authorize validates and redirects" states the matching rule.

## Impact

- `internal/mcpoauth` (new `platforms.go` replacing the Google helpers in `pkce.go`; `Client.AllowsRedirect`, `Client.RotatesRefresh`), `internal/httpapi/mcp_oauth.go` (`handleOAuthRegister`, `handleCreateMCPClient`, `handleListMCPClients`).
- Web: `OAuthClients.tsx` gets an App choice and a redirect address field; `api.ts`, `assistants.ts`; six catalogues.
- Docs: `docs/mcp-oauth.md` ("Connecting ChatGPT", "Connecting Claude (claude.ai)"), `docs/api.md`; changelog `Fixed`.
