# Proposal

## Why

A model can write task titles in its answer that no tool returned (#1317, from discussion #1223: a free model listed tasks the user never created, in a project they never shared). The server only ever hands the model the user's own data, but nothing in the chat shows which rows came from the account, so an invented row reads exactly like a real one.

## What Changes

- **Sources in place.** Each call of a task or project read tool (`list_tasks`, `search_tasks`, `get_task`, `today_summary`, `list_projects`) shows, where it ran in the answer, one quiet line: "Looked at 12 tasks", or "No tasks found". It is closed by default; opening it lists the tasks or projects the tool returned, each a link that opens it.
- **Ids only.** The turn stream carries a source as a new `source` event with the kind, the returned ids (at most 50) and the total, never a title; the device renders the titles from its own rows, decrypted on an encrypted account, like a block. The on-device assistant emits the same events from its own reads.
- **Stored with the answer** as ids, like blocks: on the device only, never synced, cleared with the conversation.

Not **BREAKING**: one additive stream event that older clients skip; no route, op field or environment variable.

Out of scope: sources for note, time, frame and free time reads; checking the model's prose against the sources; sources in routines' AI steps and over MCP.

Roadmap: the "Assistant area" in ROADMAP.md.

## Capabilities

### Modified Capabilities

- `assistant-blocks`: tool sources in the answer.

## Impact

- Server: `internal/assistant` (the source of a read result, the `Source` event), `internal/httpapi/assistant.go` (streams it).
- Web: `web/src/lib/assistantSources.ts` (reading a result and an event, shared vectors with Go), the device loop, the stream reader, `AssistantMessage.sources`, a lazily loaded `SourcesLine` in the answer.
- Docs: `docs/assistant.md`.
- Size: the stream reader's few lines on the first load; the line itself loads with the assistant's blocks.
