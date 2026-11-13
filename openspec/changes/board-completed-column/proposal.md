## Why

A project's List layout can show its completed tasks (Project menu, **Show completed tasks**: a Completed group at the end), but the Board layout only ever shows open tasks. People who run a project as a kanban want to see what is finished next to what is in progress, and to finish a card by dropping it in a Done column (GitHub issue 1291).

## What Changes

- The Project menu offers **Show completed tasks** in the Board layout too, the same device preference per project that the List layout uses (on in one layout means on in the other on that device).
- While it is on, the board ends with a **Completed** column: every completed (not skipped) task of the project, most recently completed first, folded by default with its count on the strip.
- Dropping a card on the Completed column, or moving it there with Shift+Right, completes it, as ticking it does (a repeating task completes its occurrence and moves on). Unticking a card in the column, or dragging it out into a section, reopens it (into that section).
- While it is off, the board is unchanged.

Out of scope: saved views in the Board layout and boards of filters (their columns are groups of a query); the Timeline layout; a per-project setting shared across devices; ordering inside the Completed column.

Advances the board items of GitHub issue 898 (a project's Board layout as a kanban) and closes issue 1291.

## Capabilities

### Modified Capabilities

- `task-list-presentation`: "Completed group in a project" is offered in the Board layout as well.
- `sections-and-boards`: a Completed column at the end of a project board.

## Impact

- `web/src/app/ProjectHeader.tsx` (the menu item in both layouts), `web/src/app/BoardView.tsx` and the board's column model (a trailing Completed column, drops that complete or reopen), the shared fold state. No server change, no new op field, no dependency.
