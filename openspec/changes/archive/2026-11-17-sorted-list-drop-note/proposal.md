# Proposal

## Why

Today and Upcoming have no order of their own yet (that is the feature request [#1480](https://github.com/OpenTodoApp/OpenTodo/issues/1480)), but their rows can still be dragged, because a drop on a sidebar project, the Inbox, a label or Today, and in Upcoming on another day, does something. A drop among the list's own rows does nothing and says nothing, which reads as broken (GitHub issue [#1507](https://github.com/OpenTodoApp/OpenTodo/issues/1507)).

## What Changes

- **A drop that cannot reorder says why.** In a list without an order of its own, releasing a dragged task on one of the list's rows, or in Upcoming on the task's own day, shows the short notice "Lists sorted by date or priority keep their order." and writes nothing. The sentence already exists in every language (Settings → Capture → Add new tasks), so nothing new is translated.
- Nothing else changes: the touch grip keeps its jobs (a tap ticks, a hold selects, hold and move drags), drops on the sidebar and on another day in Upcoming work as before, and lists with an order of their own (projects, the Inbox, labels, Today grouped by Project) are untouched.

Out of scope: an order of their own for Today and Upcoming (#1480, after the feature freeze). A repair: it advances no `ROADMAP.md` item.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: a drop in a list without an order of its own says why nothing moved.

## Impact

`web/src/lib/dnd.ts` (an `onMiss` callback for a lifted release over no target), `web/src/app/task-list/useListDrag.ts`, `web/src/lib/undoActions.ts` (the label of a day drop that changes nothing). No new string, no dependency, first-load size unchanged within rounding.
