# Design

## Context

MCP serves read and write tools from the shared registry (`internal/mcp` over `internal/agenttools`). Display tools are defined in `internal/assistant/blocks.go`, checked by `parseBlock` and `displayTurn`, and rendered on the device from its own rows for the in-app assistant. The MCP Apps extension (a `ui://` resource named by a tool's `_meta.ui.resourceUri`, rendered by the host in a sandboxed frame) is the standard way for hosts to show a tool's interface.

## Spike (2026-11-10)

Read from primary sources on 2026-11-10.

**Shape and version.** MCP Apps is SEP-1865, an official extension with its own repository, [`modelcontextprotocol/ext-apps`](https://github.com/modelcontextprotocol/ext-apps). Its specification [`specification/2026-01-26/apps.mdx`](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx) is marked **Stable (2026-01-26)**. A draft adds features without breaking that version. The SDK is at v2.0.4 (2026-10-27), and its README says the wire protocol did not change between 1.x and 2.x. The core specification [`2026-07-28`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/blog/content/posts/2026-05-21-mcp-2026-07-28-rc.md) lists MCP Apps as one of its two official extensions.

- Extension id `io.modelcontextprotocol/ui`. A resource has a `ui://` URI and the MIME type `text/html;profile=mcp-app`, and its content is a full HTML5 document in `text`.
- A tool names its view in `tools/list` with `_meta.ui.resourceUri`, plus an optional `visibility` (`["model","app"]` by default). Templates are **predeclared and static**: hosts may prefetch, cache and review them before any call. The call's data reaches the view as a `ui/notifications/tool-result` notification carrying the tool result (`content`, `structuredContent`, `_meta`). It is not baked into the resource.
- The view talks JSON-RPC over `postMessage` with the host: `ui/initialize` → `ui/notifications/initialized`, then `tool-input` / `tool-result` from the host and `ui/notifications/size-changed` from the view. A view may call the server's tools with `tools/call` through the host, which may ask the user first.

**How support is announced.** The client adds `capabilities.extensions["io.modelcontextprotocol/ui"] = {"mimeTypes": ["text/html;profile=mcp-app"]}` to `initialize` ("Client<>Server Capability Negotiation", stable spec). Servers SHOULD check it before offering UI tools. Claude sends it ([ext-apps#671](https://github.com/modelcontextprotocol/ext-apps/issues/671): "Claude sends io.modelcontextprotocol/ui in the initialize request"). In `2026-07-28` the handshake is gone and the client capabilities travel in every request's `_meta["io.modelcontextprotocol/clientCapabilities"]`. This server speaks `2025-03-26` to `2025-11-25`, so it sees the announcement only once, in `initialize`, and has no session to remember it in (see D6).

**Hosts that render it today:**
- Claude on the web, desktop and iOS ([MCP Apps announcement](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/blog/content/posts/2026-01-26-mcp-apps.md): "available today both on web and desktop experiences"; [Claude troubleshooting](https://claude.com/docs/connectors/building/mcp-apps/troubleshooting.md) covers the iOS `WKWebView`).
- ChatGPT ([OpenAI: MCP Apps in ChatGPT](https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt/): "ChatGPT implements the open MCP Apps standard").
- VS Code ([VS Code blog, 2026-01-26](https://code.visualstudio.com/blogs/2026/01/26/mcp-apps-support)).
- Goose and Postman (both linked from the [ext-apps README](https://github.com/modelcontextprotocol/ext-apps#readme)).
- Claude Code does not render views.

**Security model of the frame.**
- The host renders the view in a sandboxed iframe on an origin other than its own (`allow-scripts allow-same-origin`, single or double frame). The host sets the CSP itself, in HTTP headers on a document it serves. With no `_meta.ui.csp`, the host MUST apply `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'none'`. It MUST NOT allow undeclared domains, and nested frames and `object-src` are off.
- Everything the view does goes through `postMessage` as auditable JSON-RPC. View-initiated tool calls follow the host's consent rules, and Claude asks before it shows an app ("Allow" / "Always allow").
- `ui.domain` (a stable sandbox origin) is optional and only needed for an app's own OAuth or network access. Its format is per host (Claude: a hash of the connector URL), so a self-hosted server leaves it out.

**Our Go server.** The protocol is plain JSON-RPC fields on messages we already produce: `_meta` on tool definitions, `structuredContent` on results, `resources/read` of an extra URI, plus a capability in `initialize`. The view is one HTML file with inline CSS and a small inline script. It needs no new Go or npm dependency. The ext-apps SDK is optional ("you don't need an SDK to talk MCP with the host").

**Decision: go, with a narrower scope.**
- *Kinds.* Only `show_tasks`, `show_calendar` and `show_deadlines`, the three a routine's AI step also gets (`assistant-routine-blocks`). The map would need tiles inside the frame. Choices and follow-ups are part of the host's own chat. Note, project and the project views can follow once these three prove useful.
- *Static templates.* Views are static templates and data arrives in the tool result (D2, D3), replacing the earlier plan of per-call resources held for 10 minutes. Hosts cache templates by URI, so a per-call resource would be wrong for them.
- *Encrypted accounts.* They get blocks only through `ot mcp --decrypt`: the bridge decrypts the structured content and the host draws it with the same template (D4).
- *Host check (2026-11-10).* The reference host of `ext-apps` v2.0.4 (`examples/basic-host`, double sandboxed iframe, CSP in HTTP headers) rendered all three views against a local server, in light and dark. A title of `<img src=x onerror=alert(1)><script>alert(2)</script>` showed as text: no dialog and no element was created. The view made no request outside the host. Ticking a task completed it through `complete_tasks` with an `agent` token. A self-hosted test server can't be reached by claude.ai from CI.
- *Announcement in practice.* The reference host's own `Client` does not announce the extension, so for the check it was patched to send the capability. Claude does announce it (above). A host that renders views without announcing the extension sees no display tools; that is the safe side, and it is listed under Risks.

## Decisions

### D1. Spike first

Done: see the Spike section above.

### D2. One embedded view, drawn from the tool result

`internal/mcp/blocks/view.html` is embedded once. It holds CSS built from the app's tokens (the light and dark values of `web/src/index.css`, switched with `prefers-color-scheme` and the host's `theme`), and one inline script.

The script does the `ui/initialize` handshake. When `ui/notifications/tool-result` arrives, it builds the rows of the result's `structuredContent` with `textContent` and `createElement` only, never `innerHTML`, so every user-written string is text and never markup. It then reports its height with `size-changed`.

The server sends the same document for each kind. Only the kind in its `<html data-kind>` attribute differs, so the host's review sees three small, fixed documents.

A strict CSP `<meta>` adds to the host's policy and cannot widen it: `default-src 'none'`, the script and style allowed by their SHA-256 hashes and nothing inline otherwise, `img-src data:`, and `connect-src`, `frame-src`, `object-src`, `base-uri` and `form-action` all `'none'`. The resource declares no `_meta.ui.csp` domains, so the host applies its restrictive default. A test computes the hashes, checks the document makes no external reference (no `http`, `//` or `url(` outside data), and checks the tokens equal those of `index.css`.

### D3. Resources and results

- **Resources.** `ui://opentodo/blocks/tasks`, `ui://opentodo/blocks/calendar` and `ui://opentodo/blocks/deadlines` are static templates. `resources/read` serves them to any authenticated MCP caller: they hold no content. `resources/list` lists them only to an Apps client. Any other `ui://opentodo/…` URI is "Resource not found" (`-32002`).
- **Results.** A display call returns the checked block in `structuredContent`, with `kind`, the block's parameters, `count`, `not_found`, `can_complete` and the rows. Rows are slim task objects: id, `untrusted_text` title and project, project id, due, deadline, completed, estimate and encrypted.
- **Model context.** The text `content` names only the kind and count shown, like the in-app tool result ("A tool result SHALL name the kind and count shown, never content"). The rows go to the view and do not go back into the model's context.
- **Gating.** Ids are checked with the same `Shown` the in-app assistant uses, so unknown ids and ids of projects kept away from assistants look alike. A call whose ids all fail is the same `not_found` error.
- **Limits.** Calendars list at most 50 rows and deadlines 20, with a `more` count. Nothing is stored.

### D4. Encrypted accounts

The server holds no key. For an encrypted account it neither lists the display tools nor runs them, answering `encryption_enabled` with a pointer to `ot mcp --decrypt`. The exception is a request from the decrypting bridge, which sends `OpenTodo-MCP-Bridge: decrypt`.

The bridge's existing result walk replaces the placeholders in the rows with plaintext on the user's machine. The host then draws them with the same template, which holds no content, so the bridge passes `resources/read` of a view through unchanged.

The header is not a trust boundary. A client that sends it without the bridge gets the same placeholders the read tools already return to it. The bridge keeps the display result's text content as the server wrote it (kind and count), so decrypted rows reach only the view.

### D5. Actions through the host

On a row, the view shows a checkbox only when `can_complete` is true, which means the caller passes the write gate (owner switch, user switch, `agent` token). Ticking sends `tools/call complete_tasks {ids:[id]}` (unticking sends `reopen_tasks`) to the host. The host proxies it to this server, where the call runs through the same registry gate and limits as any MCP write. A refused or failed call puts the checkbox back. Otherwise the block is read-only.

The display tools keep the default visibility (`model` and `app`). The write tools are unchanged.

### D6. Remembering the announcement without sessions

The server stays stateless. When an `initialize` announces `io.modelcontextprotocol/ui` with `text/html;profile=mcp-app`, the answer carries `Mcp-Session-Id: apps.<32 random hex>`. Per the streamable HTTP transport, the client sends that header with every later request, and a request whose session id starts with `apps.` counts as an Apps client.

The server never answers 404 for an unknown session id, so a restart loses nothing, and `DELETE` stays 405 as the transport allows. The id is not a credential, since the bearer token authorizes each request: forging it only lists three read-only display tools. The decrypting bridge keeps the id from its `initialize` answer and sends it on.

### D7. Ordering with `assistant-routine-blocks`

Both changes modify "Display tools are for the in-app assistant only". This change's MODIFIED block already carries the routine text of `assistant-routine-blocks`, so it is correct whichever archives first. If `assistant-routine-blocks` archives second, it takes this text.

## Data model, size, memory

- **Data:** none, and no migration.
- **Binary size:** one HTML template of a few KB plus the Go code, measured in the PR.
- **Memory:** none. Templates are static, and nothing is held between calls.

## Risks / Trade-offs

- **The extension keeps evolving.** The stable 2026-01-26 version is what we implement, behind capability negotiation. Clients without it see no change.
- **Content leaves the server in rendered form.** It is the same content the read tools return to that token, and it leaves out projects kept away from assistants.
- **A host that ignores the session id, or renders views without announcing the extension,** sees no display tools. That is the safe failure. If a mainstream host turns out to render without announcing, a follow-up can offer the tools to it by name.
- **A host that injects its own inline code into the view** would see it blocked by the view's hash-based CSP. The spec has the host talk to the view only by `postMessage`, and the reference host writes the document unchanged.
