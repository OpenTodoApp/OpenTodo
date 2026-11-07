## Context

`mcp-oauth` D3 confined dynamic registration to Google's connector addresses so that registering could never be a way for an arbitrary site to collect a code. The same list became the only preset of the Settings screen, so every client a person creates there accepts Google's addresses only. ChatGPT and Claude redirect elsewhere and are refused at the authorize step with `redirect_uri is not registered for this client`.

## Sources (checked 2026-11-06)

Only the providers' own documentation is used.

**OpenAI, ChatGPT** — Apps SDK, "Authentication", section "Redirect URL" (https://developers.openai.com/apps-sdk/build/auth):

> If your authorization server does not meet the issuer identification requirements above, ChatGPT uses the callback-ID-specific redirect URI `https://chatgpt.com/connector/oauth/{callback_id}`.
> If your authorization server meets those requirements, ChatGPT uses the stable redirect URI `https://chatgpt.com/connector_platform_oauth_redirect`.
> MCP servers published before ChatGPT introduced callback-ID-specific redirects also continue to use the stable redirect URI.

The page does not describe the shape of `{callback_id}` and names no `chat.openai.com` address. On registration: ChatGPT prefers CIMD when the server advertises it, otherwise "calls your authorization server's `registration_endpoint` once for the MCP server connection, receives a generated `client_id`, and reuses that client for the connection"; for CIMD it supports `none` and `private_key_jwt`; "Other OAuth clients commonly use `none`, `client_secret_post`, or `client_secret_basic`", and "ChatGPT selects a method from the intersection of those sets". It uses PKCE S256 and sends `resource`. On refresh: "Access and refresh tokens can still expire or rotate normally." The UI steps are in "Connect and test your plugin" (https://developers.openai.com/apps-sdk/deploy/connect-chatgpt): ChatGPT Plugins → plus → **Add custom MCP server** → name, description, URL → configure authentication → **Create as a plugin**.

**Anthropic, Claude** — "Authentication for connectors", section "Callback URLs" (https://claude.com/docs/connectors/building/authentication):

> For the hosted Claude apps, which are claude.ai on the web, Desktop, mobile, and Cowork, register exactly this redirect URI: `https://claude.ai/api/mcp/auth_callback`

Claude Code instead uses a loopback redirect on any port (`http://localhost/callback`, `http://127.0.0.1/callback`). Anthropic's help article "Building custom connectors via remote MCP servers" (https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers, now moved; archived copy of 2026-03-27 at https://web.archive.org/web/20260327001726/https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers) said: "This callback URL may change to `https://claude.com/api/mcp/auth_callback` in the future – if you choose to allowlist MCP client callback URLs, please allowlist this callback URL as well". On registration: Claude uses Anthropic-held credentials, then CIMD (only when the metadata advertises `client_id_metadata_document_supported` and `none`), then DCR; "DCR registers Claude as a public client". The **Add custom connector** dialog can also take "your own OAuth client": a client ID and an optional secret ("Leave the secret blank unless your authorization server requires one"). On refresh: "Rotate refresh tokens for public-client connections … If you rotate, return the new refresh token in the same response that invalidates the old one", and an invalid refresh token must be answered `invalid_grant`. The UI steps are in "Add a custom connector" (https://claude.com/docs/connectors/custom/add-unlisted): **Customize → Connectors** → **Add custom connector** → server URL → OAuth credentials (under **Advanced settings**, or **Use your own OAuth client**) → **Add**, then **Connect**.

## Decisions

### D1 — One table of connector platforms

`internal/mcpoauth/platforms.go` holds `Platforms`, one entry per provider: an id (`google`, `openai`, `anthropic`), the app's name (Gemini, ChatGPT, Claude), its exact addresses, its prefixes, whether it keeps its refresh token, and the source above in a comment. A provider is added by adding an entry; nothing else in the server names a provider's address.

| Platform | Exact | Prefix + one opaque segment |
| --- | --- | --- |
| Google (Gemini) | — | `https://oauth-redirect.googleusercontent.com/r/`, `/a/`, and the same on `oauth-redirect-sandbox` and `oauth-redirect-test` |
| OpenAI (ChatGPT) | `https://chatgpt.com/connector_platform_oauth_redirect` | `https://chatgpt.com/connector/oauth/` |
| Anthropic (Claude) | `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback` | — |

The `claude.com` address is included because Anthropic's own article asked servers that allow-list callbacks to add it; it is on Anthropic's domain with the same fixed path, so it widens nothing an attacker controls. No `chat.openai.com` address is included: OpenAI's documentation does not name one. Such an address, or any other a provider adds later, can be registered as a custom address (D4) until the table learns it.

### D2 — Matching

An exact address matches only itself, byte for byte. A prefix matches the prefix followed by exactly one opaque segment: not empty, not `.` or `..`, and free of `/`, `\`, `?`, `#`, `%`, white space and control characters. ChatGPT's `{callback_id}` and Google's per-connector suffix are both opaque, so the rule is shared. Look-alike hosts (`chatgpt.com.evil.example`, `claude.ai.evil.example`), other schemes, other paths, extra segments, queries and fragments are refused.

`Client.AllowsRedirect` uses the same rule: a stored entry is a prefix only when it is one of the table's prefixes; every other entry matches exactly. Before this change any stored entry ending in `/` acted as a prefix, which an owner could create through the API by accident.

### D3 — Dynamic registration stays closed

`POST /oauth/register` accepts a request only when every `redirect_uris` entry belongs to the table and all belong to the same platform. It stores that platform's whole set (as it stored Google's six prefixes before), defaults the client name to the platform's app name, and still issues a confidential client with scope `read` and `client_secret_post`. Any other address is 400 `invalid_redirect_uri`. Rate limit, pruning and the cap are unchanged. Because only the providers' own hosts can receive the code, an open registration endpoint still cannot be used by an arbitrary site to collect one.

ChatGPT and Claude may ask to register as public clients. RFC 7591 §3.2.1 lets the server answer with the metadata it actually registered, and the answer says `client_secret_post` with a secret. Whether each provider honours that is not stated in their documentation; a person who hits a problem there creates the client in Settings and pastes the ID and secret (both providers' dialogs take a secret), which is the path the reported case used.

### D4 — Settings-created clients: a platform or one exact custom address

`POST /api/v1/settings/mcp/clients` takes `platform` (`google`, `openai`, `anthropic`) or `redirect_uris`. With a platform, the client gets that platform's set. With `redirect_uris`, each must be an absolute `https` address with a host, at most 2,000 bytes, without user information, fragment, white space or `*`, and is matched exactly; at most ten. Both together are 400 `bad_request`; an invalid address is 400 `invalid_redirect_uri` with the reason. Neither keeps today's default, Google's preset, so existing API callers are unaffected. `GET` also returns `platforms: [{id, name, redirect_uris}]` so the screen and API users can see which addresses each choice accepts.

The Settings screen adds **App** (Gemini, ChatGPT, Claude, Other app) to the existing create row. **Other app** shows a **Redirect address** field. The client name defaults to the app's name. Each client row names the app it was made for, or the custom address's host.

### D5 — Refresh rotation stays per platform

`Client.RotatesRefresh()` is false only when every stored address belongs to a platform marked as keeping its refresh token, which is Google alone (`mcp-oauth-refresh-rotation` D1). ChatGPT's and Claude's clients rotate: Anthropic's page asks for rotation of public clients and requires the new token in the same response, which this server does; OpenAI's page says refresh tokens "can still expire or rotate normally". No owner question is needed.

### D6 — Consent screen unchanged

The consent screen already shows the redirect address's host (`chatgpt.com`, `claude.ai`, or the custom host), as the MCP authorization specification asks. No change.

## Data model

None: redirect addresses are already a JSON list on `mcp_oauth_client`. Existing rows keep working; Google's rows are recognised by their prefixes as before. Server state only, no ops: offline behaviour and convergence are unaffected.

## Interface budget

The change is on the Settings → Integrations → AI assistants screen only: one more select in an existing form row and one conditional text field. No list, no chrome above a list, no task property, no sidebar destination, no scroll region and no shortcut.

## Size

No dependency. A few hundred bytes of Go and of lazily loaded settings code; no effect on image size, memory or the first-load budget.

## Risks

- A provider may change its address. The table is one place to update, and a custom address covers the gap meanwhile.
- ChatGPT and Claude might insist on a public client during dynamic registration. The Settings path with a pasted secret works regardless; supporting public clients is a separate change.
- Claude Code's loopback redirects are not accepted (out of scope); Claude Code connects with an `agent` token in a header, as `docs/claude.md` describes.
