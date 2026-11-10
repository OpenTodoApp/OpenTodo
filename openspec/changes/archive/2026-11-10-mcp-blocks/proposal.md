# Proposal: mcp-blocks

## Why

Blocks make the in-app assistant's answers show the app's own interface. People also use OpenTodo from external agents over MCP (Claude, ChatGPT, VS Code and others). The MCP Apps extension (stable since 2026-01-26) lets a tool name a `ui://` HTML view that the host renders in a sandboxed frame with the call's result. With it, an external agent's answer can show the same task list, day or week agenda and deadlines.

## What Changes

- **Display tools over MCP:** `show_tasks`, `show_calendar` and `show_deadlines` are offered to MCP clients that announce the Apps extension, while the owner's MCP switch is on. Each call returns its checked block as structured content (the block and its rows), and the tool names a `ui://opentodo/blocks/<kind>` view.
- **Content travels in the result:** the view is a static template, so the host hands it the result's rows (titles, dates, projects). This is the same privacy level as the read tools, which already return that content to a token holder. Projects kept away from assistants never appear, and the text the model reads names only the kind and count shown.
- **Self-contained HTML:** one embedded template with OpenTodo's tokens, light and dark, a strict CSP and no network request. User text is set as text, never as markup.
- **Actions:** ticking a row in a block becomes a `complete_tasks` (or `reopen_tasks`) call through the host. It follows the existing MCP write rules: an `agent` token and the owner's and the user's switches. Without them, the block is read-only.
- **Encrypted accounts:** the server can't show content it can't read. Those accounts get blocks only through `ot mcp --decrypt`, which decrypts the rows locally for the host to draw.
- **A spike first:** done, see `design.md`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `assistant-blocks`: three display tools may be offered to MCP clients that support the Apps extension.
- `mcp-server`: block views and results for the Apps extension.

## Out of scope

- Blocks for MCP clients without the Apps extension. They see no display tools.
- The other display kinds (map, note, project, the project views, time, choice, follow-ups). They are follow-ups once these three are in use.
- Protocol revision `2026-07-28` (per-request capabilities). It is a separate change to the transport.

## Roadmap

A follow-up to `mcp-server` and `assistant-generative-ui`.

## Impact

- `internal/mcp`: the announcement, the three display tools and their views, and the `ui://` resources.
- `internal/httpapi/mcp.go`: the session id that remembers the announcement, and the bridge header.
- `internal/assistant`: an exported entry to the existing display call checks (no behaviour change).
- `internal/agenttools`: the rows of a block, read through the same snapshot as the read tools.
- `ot mcp --decrypt`: keeps the session id and decrypts block rows.
- No dependency. The binary grows by one small template and its code.
