# Design

## Decisions

### D1. Same tools, smaller set

`routine.go` offers the AI step `show_tasks`, `show_calendar` and `show_deadlines` from `DisplayTools`, checked by the same `displayTurn`. The emitted blocks are collected into the run result (`blocks: [{at, block}]`), the same shape as the chat.

### D2. Rendering

The routine inbox imports `AnswerContent` from the assistant chunk lazily, so the routine inbox stays light. The device runner (encrypted accounts) records blocks the same way.

### D3. Ordering with `mcp-blocks`

Both this change and `mcp-blocks` modify "Display tools are for the in-app assistant only". Whichever archives second updates its MODIFIED block to the text the first one left before archiving.

## Data model, size, interface budget

- **Data:** the run result gains `blocks`, server state rather than an op.
- **Size:** renderers are shared, lazy chunks.
- **Interface budget:** blocks sit inside the existing card; no new scroll region (each block is bounded).

## Risks / Trade-offs

- **Stale ids in old runs.** Blocks render "Removed" for deleted entities, as in the chat.
