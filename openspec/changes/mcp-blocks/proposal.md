# Proposal: mcp-blocks

## Why

Blocks make the in-app assistant's answers show the app's own interface. People also use OpenTodo from external agents over MCP (Claude Desktop, Claude Code, ChatGPT and others). The MCP Apps extension lets a tool's result point to a `ui://` HTML resource that the host renders in a sandboxed frame. With it, an external agent's answer could show the same task list, day agenda or map.

## What Changes

- **Display tools over MCP:** while the owner's MCP switch is on, the display tools are offered to MCP clients that announce support for the Apps extension. Each call returns its checked block as structured content, plus a `ui://opentodo/blocks/<kind>` resource the host can render.
- **Content travels with the block:** the host can't read the device's data, so the resource includes the block's content (titles, dates, places). The privacy level is the same as the read tools, which already return that content to a token holder. Projects kept away from assistants never appear.
- **Self-contained HTML:** no external network requests from the frame, styled with OpenTodo's tokens, light and dark.
- **Actions** inside a block (ticking a task) become tool calls through the host, so they follow the existing MCP write rules: an `agent` token and the owner's and the user's switches. Otherwise the block is read-only.
- **Encrypted accounts:** the server can't render content it can't read, so those accounts get blocks through the `ot mcp --decrypt` bridge, which renders them locally.
- **A spike first:** confirm which hosts render MCP Apps resources and the extension's current shape, before building.

## Capabilities

### New Capabilities

### Modified Capabilities

- `assistant-blocks`: display tools may be offered to MCP clients that support the Apps extension.
- `mcp-server`: block resources for the Apps extension.

## Out of scope

- Blocks for MCP clients without the Apps extension (they keep receiving the structured content only).

## Roadmap

A follow-up to `mcp-server` and `assistant-generative-ui`.

## Impact

- `internal/mcp`: capability negotiation, `ui://` resources, and the display tools from `internal/assistant` (shared definitions).
- A server-side block renderer to self-contained HTML (Go `html/template`, no JS framework).
- `ot mcp --decrypt` renders locally for encrypted accounts.
