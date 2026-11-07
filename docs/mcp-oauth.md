---
title: OAuth clients for AI assistants
summary: Connect an app that signs in with OAuth instead of taking a pasted token, such as Google Gemini, ChatGPT or Claude (claude.ai).
audience: developer
section: Integrations
specs: [mcp-server]
screens: []
order: 41
---
# OAuth clients for AI assistants (MCP)

Some MCP clients let you paste a token; others sign in with OAuth. Google
Gemini's **Connected apps** requires it (*"Gemini requires standard OAuth for
server connections"*), and ChatGPT and claude.ai connect a remote MCP server the
same way. OpenTodo therefore serves a small OAuth 2.1 authorization server next
to `/mcp`, so such a client signs in and works like any other MCP client
afterwards.

OpenTodo knows the redirect addresses of three apps, as their makers document
them, and accepts nothing else unless the owner adds an address:

| App | Redirect addresses accepted | Source |
| --- | --- | --- |
| Gemini | `https://oauth-redirect.googleusercontent.com/r/…` and `/a/…`, and the same on `oauth-redirect-sandbox` and `oauth-redirect-test` | [Google](https://developers.google.com/connected-apps/mcp/oauth) |
| ChatGPT | `https://chatgpt.com/connector/oauth/…` and `https://chatgpt.com/connector_platform_oauth_redirect` | [OpenAI](https://developers.openai.com/apps-sdk/build/auth) |
| Claude | `https://claude.ai/api/mcp/auth_callback` and `https://claude.com/api/mcp/auth_callback` | [Anthropic](https://claude.com/docs/connectors/building/authentication) |

`…` is one path segment the app chooses, such as ChatGPT's callback id; nothing
after it, no query and no other host is accepted.

It is off with the endpoint: enable AI assistants in **Settings → Integrations →
AI assistants** first, or every address below answers 404.

## Connecting Gemini

1. Open **Settings → Integrations → AI assistants → Apps that sign in with OAuth**.
2. Choose **App: Gemini**, optionally give the client a name, and choose a
   permission: **Read only**, or **Can make changes** when the owner allows
   assistant writes.
3. **Create client.** The client ID appears, and the secret is shown **once**.
   Copy both into Gemini's dialog.
4. In Gemini, add `https://<your-server>/mcp` as the MCP server URL. Its redirect
   address (`https://oauth-redirect…googleusercontent.com/…`) is already
   accepted — OpenTodo registers Google's six connector prefixes automatically,
   both for a client you create here and for one that registers itself.
5. Sign in to OpenTodo in that browser when Google sends you back. OpenTodo asks
   **Connect Gemini to your account?**, with what it will be able to do and
   where the answer goes; press **Allow**. Gemini is connected.

## Connecting ChatGPT

ChatGPT adds a remote MCP server as a custom plugin; your ChatGPT account or
workspace has to allow custom MCP servers. OpenAI describes the steps in
[Connect and test your plugin](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt).

1. In OpenTodo, open **Settings → Integrations → AI assistants → Apps that sign
   in with OAuth**, choose **App: ChatGPT** and a permission, and press **Create
   client**. Keep the client ID and the secret (shown once) at hand.
2. In ChatGPT, go to **Plugins**, select the plus button, then **Add custom MCP
   server**.
3. Enter a name and a description, and under **Connection** enter
   `https://<your-server>/mcp` as the MCP server URL.
4. Under authentication, choose OAuth. Where ChatGPT offers fields for an OAuth
   client ID and secret, enter the ones from step 1. Review the risk warning and
   select **I understand and want to continue**, then **Create as a plugin**.
5. ChatGPT sends you to OpenTodo. Sign in if asked; OpenTodo asks **Connect
   ChatGPT to your account?** and shows `chatgpt.com` as where the answer goes.
   Press **Allow**.

ChatGPT's redirect address is `https://chatgpt.com/connector/oauth/<callback id>`
(or the stable `https://chatgpt.com/connector_platform_oauth_redirect`); a client
made for ChatGPT accepts both, so you don't need to copy it. Without a client ID,
ChatGPT registers itself (dynamic registration), with **Read only** access.

## Connecting Claude (claude.ai)

claude.ai on the web, Claude Desktop and the Claude mobile apps connect a remote
MCP server as a custom connector and share one redirect address,
`https://claude.ai/api/mcp/auth_callback`. Anthropic describes the dialog in
[Add a custom connector](https://claude.com/docs/connectors/custom/add-unlisted).
Claude Code is different: connect it with a token through the
[OpenTodo plugin](claude.md).

1. In OpenTodo, open **Settings → Integrations → AI assistants → Apps that sign
   in with OAuth**, choose **App: Claude** and a permission, and press **Create
   client**. Keep the client ID and the secret (shown once) at hand.
2. In Claude, go to **Customize → Connectors** and click **Add custom
   connector**. On a Team or Enterprise plan, an owner adds it in
   **Organization settings → Connectors** instead.
3. Enter `https://<your-server>/mcp` as the server URL.
4. Enter the client ID and secret from step 1: under **Advanced settings**, or,
   when the dialog has two steps, with **Use your own OAuth client**. Click
   **Add**.
5. Click **Connect**. Claude sends you to OpenTodo; sign in if asked, check that
   the answer goes to `claude.ai`, and press **Allow**.

Without step 1 and the client ID, Claude can register itself (**Register
automatically**), with **Read only** access. A client made for Claude also
accepts `https://claude.com/api/mcp/auth_callback`, which Anthropic has said the
address may become.

## Other apps

For an app that is not in the list, choose **App: Other app** and enter its
redirect address: the exact address the app returns to after sign-in, as its
documentation names it. It must start with `https://`, and it is matched exactly:
no wildcard, no other path, no query the app adds later. Only the owner can add
such an address; an app cannot register one itself.

## What the assistant sees

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
| `POST /oauth/register` | RFC 7591 dynamic registration, accepted only for the redirect addresses of Gemini, ChatGPT and Claude above |
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

Gemini is the exception: a client whose redirect addresses are all Google's (a client made for
Gemini, and every client Gemini registers itself) gets the **same refresh token back**, because Google's
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
- A client that registers itself always gets **Read only** access and a client
  secret (`client_secret_post`); create the client in Settings for **Can make
  changes**.
- Self-registration is limited to five a minute per address, and clients that
  registered themselves but were never authorized are removed after a day.
- The server never calls out during this flow; it only answers.
