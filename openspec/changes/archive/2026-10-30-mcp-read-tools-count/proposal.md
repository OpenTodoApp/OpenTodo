# MCP read tools without a fixed count

## Why

The `mcp-server` spec says `tools/list` advertises "exactly the seven read tools" and, with writes allowed, "the five read tools". Both numbers are out of date: `list_workspaces` (workspaces) and `list_frames` (calendar-frames) are read tools too, so the registry has nine. A hard-coded count goes stale with every new read tool.

## What Changes

- The Read-only tools requirement lists the current nine read tools as an example and states that every read tool of the registry is advertised; its "Read token sees only read tools" scenario no longer counts them.
- The Write permission gate's "All conditions met" scenario says "every read tool" instead of "the five read tools".

No behaviour change: the specs catch up with the code. Not **BREAKING**.

Out of scope: any change to the tools themselves.

Advances no ROADMAP.md item (spec maintenance).

## Capabilities

### Modified Capabilities
- `mcp-server`: Read-only tools; Write permission gate (wording only).

## Impact

Specs only. No code, dependency or size change.
