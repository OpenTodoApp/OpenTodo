# Proposal: assistant-time-blocks

## Why

Questions about time are where prose answers worst: "where did my time go this week?", "when am I free for two hours?", "what's due before Friday?". The data exists (time entries, frames, slots, calendar events, deadlines), but the model can only list it.

## What Changes

**Three display tools for the in-app assistant**, on the server and on the device:
- **`show_time`:** tracked time over a range, grouped by project or by day, as bars with totals.
- **`show_free_time`:** a day or week's free slots between events, frames and planned tasks, within the working day.
- **`show_deadlines`:** upcoming deadlines with their countdowns, from a date range.

**A new shared read tool, `find_free_time`** (a date range and a minimum length; returns free slots), in the agent registry:
- MCP clients get it too, for example Claude Desktop asking "when am I free?";
- it is read-only like the other registry reads;
- the on-device loop gets a twin, pinned by vectors.

## Capabilities

### New Capabilities

### Modified Capabilities

- `assistant-blocks`: new requirements for the time, free time and deadlines blocks.
- `mcp-server`: the new read tool `find_free_time`.

## Out of scope

- Writing anything: placing a task into a free slot stays a proposal through the existing write tools.
- Other people's calendars beyond the user's own subscribed feeds.

## Roadmap

A follow-up to `assistant-generative-ui`. It needs `assistant-device-reads` for the on-device loop.

## Impact

- `internal/agenttools`: the `find_free_time` reader, over frames, slots, dated tasks and subscribed calendar events.
- `internal/assistant/blocks.go`: three display tools; the manifest and vectors.
- `web/src/app/assistant/blocks`: three lazy renderers reusing the statistics bars, the agenda and the deadline markers.
- MCP golden lists and docs.
