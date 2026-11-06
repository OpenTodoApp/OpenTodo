---
title: OAuth clients for AI assistants
summary: Connect an app that requires OAuth instead of a pasted token, such as Google Gemini's Connected apps.
audience: developer
section: Integrations
specs: [mcp-server]
screens: []
order: 41
---
# OAuth clients for AI assistants (MCP)

Some MCP clients let you paste a token; others refuse one. Google Gemini's
**Connected apps** does: *"Gemini requires standard OAuth for server
connections."* OpenTodo therefore serves a small OAuth 2.1 authorization server
next to `/mcp`, so such a client signs in and works like any other MCP client
afterwards.

It is off with the endpoint: enable AI assistants in **Settings → Integrations →
AI assistants** first, or every address below answers 404.

## Connecting Gemini

1. Open **Settings → Integrations → AI assistants → Apps that sign in with OAuth**.
2. Give the client a name (Gemini) and a permission: **Read only**, or **Can make
   changes** when the owner allows assistant writes.
3. **Create client.** The client ID appears, and the secret is shown **once**.
   Copy both into Gemini's dialog.
4. In Gemini, add `https://<your-server>/mcp` as the MCP server URL. Its redirect
   address (`https://oauth-redirect…googleusercontent.com/…`) is already
   accepted — OpenTodo registers Google's six connector prefixes automatically,
   both for a client you create here and for one that registers itself.
5. Sign in to OpenTodo in that browser when Google sends you back. OpenTodo asks
   **Connect Gemini to your account?**, with what it will be able to do and
   where the answer goes; press **Allow**. Gemini is connected.

The assistant then sees only your own projects and the shared projects you are a
member of, exactly like a token-based client. **Can make changes** additionally
needs the owner's **AI assistants may make changes** switch and your own
**Allow AI assistants to make changes to my tasks** switch; without them the
client reads only.

## How it works

| Address | What it is |
| --- | --- |
| `/.well-known/oauth-protected-resource` | RFC 9728 document naming this server as the authorization server for `/mcp` |
| `/.well-known/oauth-authorization-server` | RFC 8414 metadata: endpoints, `authorization_code` and `refresh_token`, S256 only |
| `POST /oauth/register` | RFC 7591 dynamic registration, accepted only for Google's connector addresses |
| `GET /oauth/authorize` | The browser step; needs a signed-in session and sends it to the consent dialog |
| `POST /oauth/token` | Code exchange (`client_secret_post` or `client_secret_basic`) and refresh |
| `POST /oauth/revoke` | RFC 7009 revocation by the client of its own access or refresh token |

Every access token is an ordinary OpenTodo API token, so it appears in
**Settings → Integrations → API tokens** as `MCP: <client name>`, is refused on
everything except the MCP endpoint's tools, and dies with the account. Access
tokens stop working after an hour. The refresh token lasts 180 days from its last use.

Each refresh gives the app a **new refresh token**, and the one it sent stops working. If an
old refresh token is ever sent again, the server takes it as a sign that the token was copied:
it ends the connection (the app's refresh token and access token stop working) and records
`mcp_oauth.refresh_reused` in the audit log. Connect the app again to continue. An app has to
keep the refresh token from each answer, as OAuth 2.1 expects.

Gemini is the exception: a client whose redirect addresses are all Google's (the Google preset,
and every client Gemini registers itself) gets the **same refresh token back**, because Google's
guide for connected apps requires it and Gemini would otherwise unlink. Its refresh token works
until the connection is revoked, the client is deleted, or 180 days pass without a refresh.

A code is issued only when you press **Allow** in the consent dialog, so a link
someone sends you can't connect an app to your account on its own: only allow a
connection you started yourself. The audit log records
`mcp_oauth.client_created`, `mcp_oauth.granted`, `mcp_oauth.revoked`,
`mcp_oauth.refresh_reused` and `mcp_oauth.client_deleted` with the client id, never a secret
or token.

## Ending access

- **Settings → Integrations → API tokens**: delete `MCP: <client name>` to kill
  the current access token immediately (the client mints a new one on its next
  refresh).
- **Settings → Integrations → AI assistants → Delete client**: removes the client,
  every grant it held and their access tokens. This is the complete cut-off.
- The client itself may call `/oauth/revoke` with its own credentials; Gemini does
  when you unlink the app.

## Notes

- OAuth is served on this server's own origin, so `OPENTODO_BASE_URL` should be
  the address clients use (cookies, passkeys and these redirects are host-bound).
- Demo instances refuse registration, authorization and the token endpoints: a
  sandbox must not hand out credentials.
- Self-registration is limited to five a minute per address, and clients that
  registered themselves but were never authorized are removed after a day.
- The server never calls out during this flow; it only answers.
