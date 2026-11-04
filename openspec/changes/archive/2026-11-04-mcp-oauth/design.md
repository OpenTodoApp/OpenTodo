# Design

## Context

`/mcp` is authenticated in `internal/httpapi/mcp.go`: bearer token → `auth.UserByTokenInfo` → scope `read`/`agent` decides writes, behind the owner's MCP setting and the person's own agent-access switch. The token service (`internal/auth`) already issues scoped `ot_` tokens and records `token.created`.

Gemini's requirement is not "some token", it is OAuth 2.1 with discovery. Google's guide for the feature names the documents it fetches, the grants it uses and the redirect addresses it registers:

- `https://developers.google.com/connected-apps/mcp/oauth` — authorization code with PKCE mandatory, `authorization_endpoint`/`token_endpoint`/`registration_endpoint` required, RFC 8414 and RFC 9728 discovery fetched in that order and the first answer used, six `oauth-redirect*.googleusercontent.com/{r,a}/…` redirect URIs registered per connector.
- `https://support.google.com/gemini/answer/17209137` — the consumer dialog, with the manual Client ID/secret fields used when dynamic registration is not offered.

## Goals / Non-Goals

**Goals.** A Gemini-connected app reads and, when allowed, writes OpenTodo tasks. One OAuth implementation, no new dependency, no new outbound host. Existing token clients keep working unchanged.

**Non-goals.** Being a general identity provider (no OIDC, no ID token, no userinfo), issuing JWTs, or per-tool scopes.

## Decisions

### D1 — An authorization server on the app's own origin

The issuer is the origin the client already knows (`OPENTODO_BASE_URL`, else the request's origin through `publicOrigin`). No separate auth host, no configuration: the well-known documents sit next to `/mcp`, which is also what RFC 9728 expects when the resource and the authorization server share a host.

`/.well-known/oauth-protected-resource` answers with `resource` = `<origin>/mcp`, `authorization_servers` = `[<origin>]`, `scopes_supported` = `["read","agent"]` and `bearer_methods_supported` = `["header"]`. The `/mcp` variant (`/.well-known/oauth-protected-resource/mcp`) answers identically, because clients that derive the document from the resource path ask for it.

`/.well-known/oauth-authorization-server` answers with `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `revocation_endpoint`, `response_types_supported: ["code"]`, `grant_types_supported: ["authorization_code","refresh_token"]`, `code_challenge_methods_supported: ["S256"]`, `scopes_supported`, and `token_endpoint_auth_methods_supported: ["client_secret_post","client_secret_basic"]`.

Both are public (a client asks before it has any credential) and answer `404` while the owner's MCP switch is off, exactly like `/mcp` — an endpoint that does not exist yet should not advertise itself.

### D2 — Access tokens are API tokens, not a second token type

The token exchange calls `auth.CreateTokenScoped(userID, "MCP: <client name>", scope)` and stores the new token's id on the grant. `/mcp` needs no change beyond its challenge header: the token resolves through the same `UserByTokenInfo`, gets the same scope enforcement, the same deactivation check and the same last-used bookkeeping, and appears in the person's token list where they can revoke it directly.

The alternative — a separate `mcp_oauth_access` table and a second validation path in `handleMCP` — would duplicate the scope logic and create a token that the token list does not show.

A refreshed grant revokes the previous access token row and mints a new one, so a person's token list holds one `MCP: Gemini` row per grant, not one per hour. The new token replaces the old one with a compare-and-swap on `mcp_oauth_grant.token_id` (`SwapGrantToken`: only while the grant is live and still holds the token this request read). A request that loses to a concurrent refresh reads the grant again and replaces the winner's token; one that loses to a revocation or the client's deletion deletes the token it minted and answers `invalid_grant`. No access token is left without a grant pointing to it, and the one-hour expiry bounds a token left behind by a crash between minting and swapping.

### D3 — Clients: manual by the owner, dynamic only for Google

`mcp_oauth_client` holds `id`, `name`, `secret_hash`, `redirect_uris` (JSON), `scope`, `dynamic`, `created_by`, `created_at`, `last_used_at`.

The owner creates a client through `POST /api/v1/settings/mcp/clients` with a name, a scope (`read` or `agent`) and either a redirect list or the Google preset; the response carries the secret once and never again. The secret is `ids.Secret(32)` hashed with the token service's hash, compared in constant time.

`POST /oauth/register` implements RFC 7591, because Google's guide says the Gemini app "currently requires a dedicated registration_endpoint to be present in the discovery JSON". It refuses any redirect that is not one of Google's six prefixes:

```
https://oauth-redirect.googleusercontent.com/r/          https://oauth-redirect.googleusercontent.com/a/
https://oauth-redirect-sandbox.googleusercontent.com/r/  https://oauth-redirect-sandbox.googleusercontent.com/a/
https://oauth-redirect-test.googleusercontent.com/r/     https://oauth-redirect-test.googleusercontent.com/a/
```

The suffix is opaque and per-user, so matching is by prefix, not equality. Confining dynamic registration to Google means an arbitrary website cannot register itself and then collect a code delivered to its own address. It does not stop someone from registering a client for their own Google connector and sending its authorize link to someone else, which is why the consent screen (D5) exists. A client that needs another redirect address is created by the owner by hand.

Registration is anonymous, so it is bounded: five registrations a minute per client address, dynamic clients nobody authorized within a day are removed on the next registration, and registration answers 503 while 200 dynamic clients remain.

Dynamic clients are confidential (`token_endpoint_auth_method: client_secret_post`, which is what Gemini sends) and get scope `read`; `agent` is only ever granted to a client the owner created deliberately.

### D4 — The authorization code

`GET /oauth/authorize?response_type=code&client_id=…&redirect_uri=…&code_challenge=…&code_challenge_method=S256&scope=…&state=…`

Validation order, each failure answered with a plain `400` (never redirected to an unvalidated address): client exists, `redirect_uri` is registered for it, `code_challenge_method` is `S256` (the only method accepted; `plain` is refused), `response_type` is `code`. The scope granted is the client's own, set by whoever created it in OpenTodo; the request can neither widen it nor narrow it. Narrowing was the first implementation and it broke the connection: Gemini asks for the first scope the metadata lists (`read`), so an `agent` client produced a read-only token.

`mcp_oauth_code` stores the SHA-256 of the code, the client, the person, the redirect address, the granted scope, the challenge and a 60-second expiry. Consumption deletes the row in the same transaction that reads it, so a code cannot be replayed even under a race.

### D5 — Authorize needs a session and the person's consent

The route is public in the policy table (a client arrives without one), and the handler requires a session cookie — API tokens are refused, because this is a browser step and a token-holder must not be able to mint browser grants. Without a session the browser is sent to `/?oauth=<urlencoded authorize URL>`; the web app, once signed in, returns there, so the person signs in in the same tab and the flow continues.

With a session the authorize address never issues a code itself: it sends the browser to `/?oauth_consent=<the authorize query>`. The app shows a consent dialog that names the client, what its scope allows, whether it registered itself or the owner added it, and the host its answer goes to (`GET /api/v1/me/mcp-consent`). Allow posts the query back (`POST /api/v1/me/mcp-consent`, session only), the server validates it again, issues the code and answers the redirect, which the app follows; Cancel answers the same address with `error=access_denied`.

The first version had no consent screen, reasoning that every client is the owner's or Google's. That left a link attack: anyone can register a dynamic client for their own Google connector, start a connection in their own Gemini account and send the authorize link to a signed-in person, whose browser would then deliver a code for that person's account to the sender's connector. A code issued only by a same-origin POST, which the session cookie's cross-site protection refuses from other sites, closes it. The dialog's own code is loaded only when the app is opened with `?oauth_consent=`, so the first load does not grow. The audit event `mcp_oauth.granted` is recorded on Allow.

### D6 — Tokens: short access, stable refresh

Access token: one hour, `ot_`-prefixed, hashed in `api_tokens` as usual. The hour is enforced by the token service, not only advertised in `expires_in`: `auth.CreateTokenExpiring` writes a row to the side table `api_token_expiry(token_id, expires_at)`, `UserByTokenInfo` refuses a token past it, the token list leaves expired tokens out, and minting a person's next expiring token deletes their expired ones. A side table like the scope markers keeps every existing token unchanged (no row, no expiry). Refresh token: 180 days, `ids.Secret(32)`, hashed in `mcp_oauth_grant.refresh_hash`, **never rotated** — a refresh returns the same refresh token with its expiry extended, which Google's guide calls the key to a connection that stays linked (and which forbids the "rotate and invalidate" pattern that would unlink Gemini every time).

`UNIQUE(client_id, user_id)` makes a second authorization by the same person for the same client reuse the grant instead of stacking a second one.

`grant_type=refresh_token` accepts `client_secret_basic` and `client_secret_post`, verifies the secret, and refuses a revoked or expired grant with `invalid_grant`.

### D7 — Scopes and the two switches

`read` mints a `read` token: the MCP tools that only read work, the write tools answer their existing "read-only token" refusal. `agent` mints an `agent` token: write tools additionally need the owner's MCP setting and the person's own agent-access switch, unchanged from `mcp-write-tools` D3. The person's choice when creating the client is the permission; the OAuth `scope` parameter only records it. Nothing about the switches is duplicated in the OAuth layer; a grant is a credential, not a permission.

### D8 — Revocation

`POST /oauth/revoke` (RFC 7009) authenticates the client exactly as the token endpoint does (401 `invalid_client` otherwise) and revokes only what belongs to that client: its refresh token, or the access token one of its grants currently holds. Either marks the grant revoked and deletes its access token, and records `mcp_oauth.revoked` once that succeeded. Any other token, unknown, another client's or an ordinary API token, answers `200` and is left alone, as the RFC requires; the endpoint can never be used to delete a personal token. Google calls the endpoint when a person unlinks the app; it is advertised in the metadata when it exists, and it does.

The owner deleting a client in Settings deletes its grants and their access tokens; the person deleting `MCP: Gemini` from their token list kills the access token but leaves the grant, so the next refresh mints a new one — the documented way to cut a client off completely is the client list or the revoke endpoint.

### D9 — Storage and privacy

No code, secret or token is logged or audited by value. Client secrets, codes and refresh tokens are stored as SHA-256 hashes; an access token is stored exactly as any API token is. The audit events are `mcp_oauth.client_created`, `mcp_oauth.client_deleted`, `mcp_oauth.granted` and `mcp_oauth.revoked`, each naming the client id and, for the grant, the person.

### D10 — Demo instances refuse it

The registration, authorize, token and revoke routes and the owner's client routes are in the demo deny list: a sandbox that anyone can reset must not hand out credentials. Discovery answers there, because it reveals nothing and a 404 would look like a broken server.

## Risks / Trade-offs

- **A consent dialog** is one more click in the connection flow; it is what keeps a link from someone else from granting access.
- **Rolling back** to a binary without this change leaves `api_token_expiry` unread, so OAuth access tokens minted before the rollback would stop expiring there. They are still listed as `MCP: <client>` in the person's token list and can be deleted.
- **Prefix-matched redirects** accept Google addresses only; a future client that wants its own redirect address has to be added by the owner, which is the intended ceremony.
- **Reusing `api_tokens`** puts `MCP: <client>` rows in the person's token list, which is a feature (revocation lives where people look) and a small surprise (tokens appear they did not create by hand). The name makes the origin obvious.
- **No rotation** of the refresh token is a deliberate departure from current best practice, taken because Google's guide says rotation breaks the link; the grant is revocable and expires.

## Migration Plan

Migration `0057_mcp_oauth` adds three empty tables. No backfill, no data change. A server upgraded in place serves discovery and the OAuth endpoints the moment MCP is enabled; existing tokens, clients and switches are untouched. Rolling back to the previous binary leaves the tables unused.

## Open Questions

- Whether Gemini's consumer dialog accepts a manual client with a single copied redirect URI or always sends all six. The implementation accepts both (prefix match), so either behaviour works.
- Whether a future MCP authorization revision (client ID metadata documents) supersedes dynamic registration. Not needed today; the decision to confine DCR to Google is easy to widen later.
