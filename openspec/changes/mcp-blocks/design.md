# Design

## Context

MCP serves read and write tools from the shared registry (`internal/mcp`). Display tools are defined in `internal/assistant/blocks.go` and checked by `displayTurn`. Content is rendered on the device for the in-app assistant. The MCP Apps extension (a `ui://` resource referenced from a tool result and rendered by the host in a sandboxed frame) is the standard way for hosts to show tool interface.

## Decisions

### D1. Spike first

Before building, confirm which hosts render Apps resources (Claude Desktop, Claude.ai, ChatGPT, VS Code), the capability name the client announces, and the resource MIME type. The spike's result is recorded in this design. If no host supports it, the change stops there.

### D2. Server-side rendering with `html/template`

`internal/mcpblocks` renders each kind to HTML with inline CSS from the design tokens. Each item is escaped as untrusted text, and there is no script except a tiny bridge for actions where the extension provides one. Map blocks render the list only (no tiles from inside the frame), with a link to open the place in a map.

### D3. Lifetime and scope of resources

A block resource is generated per call, held in memory for 10 minutes, and readable only by the token that made the call. Nothing is stored.

### D4. Encrypted accounts

The server can't render encrypted content, so it returns the structured block with placeholders. The `ot mcp --decrypt` bridge, which already decrypts read results locally, renders the same templates locally from decrypted data.

### D5. Ordering with `assistant-routine-blocks`

Both changes modify "Display tools are for the in-app assistant only". Whichever archives second updates its MODIFIED block to the text the first one left before archiving.

## Data model, size, memory

- **Data:** none.
- **Binary size:** a few templates, under 50 KB.
- **Memory:** recent block resources, bounded (10 minutes, at most 100 per token).

## Risks / Trade-offs

- **The extension is still evolving.** It sits behind capability negotiation; clients without it see no change.
- **Content leaves the server in rendered form.** It is the same content the read tools return to that token.
