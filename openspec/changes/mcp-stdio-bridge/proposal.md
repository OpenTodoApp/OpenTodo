# MCP stdio bridge

## Why

OpenTodo exposes read-only MCP over streamable HTTP, but many desktop clients
can launch only local stdio servers. Requiring a third-party proxy adds another
credential holder and setup step.

## What Changes

- Add `ot mcp`, a newline-delimited JSON-RPC stdio-to-HTTP bridge using the
  configured OpenTodo URL and token.
- Reserve stdout for protocol responses and keep notifications response-free.
- Require a read-only token by default, with an explicit full-token override.
- Document stdio client configuration.

## Out of scope

- A second MCP implementation or server-side session transport.
- Automatic token creation or changes to token storage.
- Writes through MCP.

ROADMAP: advances MCP client compatibility; no named ROADMAP item is changed.

## Impact

CLI and documentation only. No route, data model, op-log, environment variable,
dependency, or breaking change.
