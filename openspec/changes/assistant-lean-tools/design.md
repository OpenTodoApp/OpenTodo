# Design

## Decisions

### D1. A meta tool, not a classifier

`propose_changes` (no arguments) is defined in `internal/assistant`. The loop keeps a per-turn flag; once it is set, the tool list of the next `Start` or `Next` includes the write tools. The providers already accept a tool list per request, so the conversation history keeps the earlier tool calls valid.

The device loop mirrors it, and the manifest marks `propose_changes` with kind `meta`.

### D2. Measured

`assistant-eval` reports tokens per scenario. The change lands only if every scenario passes and question-only turns use clearly fewer input tokens.

## Data model, size, interface budget

None: no data, size or interface changes.

## Risks / Trade-offs

- **The model forgets to call `propose_changes`** and says it cannot change things. The instructions and the tool description make it explicit, and the eval has a scenario for it.
