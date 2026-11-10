# Proposal: assistant-memory

## Why

Every conversation starts from zero. People repeat the same facts: "I work four days a week", "mornings are for deep work", "never schedule anything on Fridays", "Anna is my manager". Assistants that remember stated preferences feel personal, and plan better because they keep to them.

## What Changes

- **Memory items:** short facts the user states, stored as a new synced entity, `memory`. They follow the user to every device through the op log, like settings. The text is a content field, so end-to-end encrypted accounts encrypt it.
- **Adding them:** the user adds, edits and deletes items in **Settings → Integrations → Assistant → Memory**. The assistant can propose one with an in-app tool, `remember` ("Remember that you work four days a week?"). It arrives as a proposed change and is reviewed, applied and undone like any other. Nothing is remembered silently.
- **Using them:** every turn, on the server and on the device, sends the user's memory items in the fixed instructions as the user's own stated preferences. At most 20 items of 200 characters each.
- **Staying in the app:** memory is never offered to MCP clients or agent tokens, and it is not read by routines' AI steps. It is in the user's export, like all their data.
- **Consent:** the assistant disclosure names memory (disclosure version 5). People who consented earlier are told once, without being asked again.

## Capabilities

### New Capabilities

- `assistant-memory`: memory items, how they are proposed, managed and sent, and where they never go.

### Modified Capabilities

## Out of scope

- Memory the model infers without the user confirming it.
- Memory for routines' AI steps, MCP clients, or shared workspaces.

## Roadmap

A new row under AI: "The assistant remembers what you tell it".

## Impact

- **Op schema:** a new entity `memory` with fields `text` (content), `position`, `created_at` and `deleted_at`, personal scope. Additive; the generated types and the e2ee content fields are regenerated.
- `internal/assistant`: the `remember` tool (in-app only), memory in the system text, and the disclosure version.
- **Web:** the Settings section, review rows for memory items, and the device loop reading memory.
- **Docs:** the privacy page and the assistant settings page.
