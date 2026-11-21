# Proposal

## Why

Projects are archived one at a time from their menu. After an import, or a clean-up, that is one menu, one confirmation and one wait per project (GitHub issue [#1661](https://github.com/OpenTodoApp/OpenTodo/issues/1661), reported on Discord by kwong; #1498 asks for multi-select more widely).

## What Changes

- The All projects table gets the task lists' selection: Ctrl or ⌘+click ticks a row instead of opening it, Shift+click and Shift+↑/↓ extend from the last tick, Space or x ticks the focused row, Ctrl+A ticks every listed row while something is ticked, and Escape clears. "Select projects" in the page's ⋯ menu shows the boxes on a touch screen. While the boxes show, a row's box stands where its colour mark is and a click ticks.
- While projects are ticked, the selection bar shows the count, **Archive** and **Clear**. Archive asks first ("Archive 3 projects?"), then archives every ticked project with its sub-projects in one batch with one Undo toast.
- Only projects the user may archive (owner, admin and editor roles, as in the Project menu) can be ticked.
- No new screen, field or operation: it is the `archived` field the Project menu already writes.

## Design

- **D1 — The task lists' model.** `useSelection` (app/selection.ts) and `SelectionBar` are reused as the Notes page reuses them (notes-bulk-actions). The bar holds one button, Archive, in place of an Actions menu: archiving is the only action people asked for, and a menu of one item is a detour.
- **D2 — One batch.** `archiveProjectsUndoable` writes each ticked project and its live sub-projects that are not archived yet, each once, through `applyBatch`, so one Undo restores them and every device converges by last-writer-wins.

## Capabilities

- Modified: `project-organization` (a new requirement, "Archive several projects at once").

## Impact

- `web/src/app/projectBulk.tsx` (new), `ProjectsTable.tsx`, `ProjectsView.tsx`, `lib/undoActions.ts`; four new strings in every catalog; `docs/all-projects.md`.
