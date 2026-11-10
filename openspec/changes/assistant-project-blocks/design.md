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

## Implementation notes

- **Offering (D2).** No turn fits Anthropic's strict limits today: a turn without a skill offers about 40 tools, and every skill already has more than 24 optional parameters. A turn without a skill therefore keeps every display tool (cutting it to the first six would leave the task, activity and habit blocks unreachable, since no view suggests them). A skill turn offers the skill's own display tools plus its view's (`project`: board and timeline; `today`: stats and deadlines), and still none of the others, as assistant-skills requires. The manifest's `view_display` carries the mapping to the device. `weekly-review` lists `show_stats`.
- **Board (D1).** `BoardView` draws every column at the screen's height with a phone pager and sideways scrolling, so the block reuses its parts instead: the column surface and the board's cards (`TaskRow` in its card shape). A named column shows alone; without one, the first with cards shows, with the other columns' names as buttons that wrap. A column is checked to belong to the project (`Registry.ShownSection`).
- **Timeline (D1).** `TimelineView` is the project's editor (drag targets, its own keyboard scope, a fixed scale that scrolls sideways), and its keyboard scope would compete with the project page beside the panel. The block draws the same bars from `lib/timeline`'s spans with the same bar styles, late tone, past tone and deadline diamond, on an axis fitted to the block (at most 13 weeks), so nothing scrolls or drags.
- **Task (D1).** The task row, the start of the notes, `Subtasks` without its add line and the latest three comments; no editors.
- **Habit.** A habit is a task with `habit` set (`ShownHabit`); `HabitHistory` is already read-only.
