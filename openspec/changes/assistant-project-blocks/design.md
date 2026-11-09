# Design

## Context

Display tools are listed in `DisplayTools` and offered by `displayOffered`. Anthropic's strict mode allows 20 strict tools and 24 optional parameters. Turns without a skill already exceed that, so they run without strict mode. Skills stay within the limit.

## Decisions

### D1. Reuse views read-only

Each renderer wraps the existing view in a read-only mode:
- **Board:** `BoardView` columns with dragging off.
- **Timeline:** the project timeline component with resizing off.
- **Activity:** `activity.ts` events.
- **Stats:** the dashboard's number cards.
- **Habit:** the habit grid.
- **Task:** `TaskDetail` sections without editors.

Where a component has no read-only mode, the change adds a `readOnly` prop rather than forking it.

### D2. Offering by relevance

`displayOffered(name, skill, view)` returns the original six, plus the skill's list, plus a per-view list (`project`: board and timeline; `today`: stats and deadlines). The manifest records the same mapping, so the device offers the same set. This keeps skill turns inside the strict limit.

## Data model, size, interface budget

- **Data:** none.
- **Size:** lazy renderers; the board and timeline reuse already-split chunks.
- **Interface budget:** blocks sit in the transcript; no scroll region is added (the board block shows at most one column, without a column scroller).

## Risks / Trade-offs

- **Heavy components inside a chat.** Each renderer shows a bounded slice (one column, 20 events, one task).
