# Proposal: assistant-lean-tools

## Why

A turn without a skill sends about 38 tool definitions with every model call, roughly 20k tokens before anything is said. Most questions only read. Sending the write tools only when the model needs them would cut cost and latency, and would bring turns within the provider's strict-tool limits.

## What Changes

- **First round:** a turn without a skill starts with the read tools, the display tools, and one small tool, `propose_changes`, whose description says to call it before proposing any change.
- **When the model calls `propose_changes`,** the next round offers the write tools too. The call itself returns a short note.
- **Skills** keep their own tool lists.
- **The eval suite** (`assistant-eval`) must pass before and after, with tokens reported.

## Capabilities

### New Capabilities

### Modified Capabilities

- `in-app-assistant`: a new requirement, "Write tools on request".

## Out of scope

- A separate classifier call before the turn.

## Roadmap

A follow-up to `in-app-assistant`. It needs `assistant-eval`.

## Impact

- `internal/assistant/loop.go` and the device loop (tools per round), the manifest, and the instructions.
