# Proposal

## Why

Lists are sorted by a `position` number that is set once at creation and never changed, so a project's tasks always appear in creation order. People order lists by hand to express priority within a day, sequence inside a project, or simply what they want to look at first. The field, the sync rule and the sort already exist; what is missing is a way to change positions by dragging and from the keyboard, an insertion scheme that does not rewrite the whole list on every move, and a convergence rule so two devices reordering the same list end up with the same order.

## What Changes

- Manual ordering of tasks within a project list (within each section and under each parent task), within the Inbox, and of projects within their sidebar level, using the existing `position` field.
- Drag and drop with mouse and touch, with a drop indicator, using the small pointer-based drag primitive shared with `board-view`.
- Keyboard moves: Alt+Up and Alt+Down move the selected task or project one place within its list; Alt+Shift+Up/Down move it to the top or bottom.
- Fractional insertion: a move writes one position (the midpoint between its new neighbours); when neighbours are too close to bisect, the affected list is renumbered with even spacing, bounded to that list.
- Moves across containers (another section or parent) write the container field and the position in one operation batch, so a task lands in one place with one timestamp.
- Convergence: positions are per-item last-writer-wins registers and lists sort by `(position, id)`, so every device shows the same order after sync; concurrent reorders may interleave but never lose or duplicate an item.
- Date-based and filter views keep their own sort and use position only as a tie-breaker; drag is disabled there.

Out of scope: a separate "manual" position per view (one position per entity), ordering of label or saved-view sidebar groups beyond what `labels` and `custom-views` already define with the same field, reordering through a dedicated API endpoint (`PATCH position` already exists), a sequence CRDT for list order, sorting modes per project (`custom-views` covers alternative sorts), drag between projects in the sidebar when `project-hierarchy` has not shipped (then only same-level reordering is offered).

This change advances ROADMAP.md section 3, "Drag-and-drop ordering (`position` already shipped)".

No new environment variables. No breaking change to the op log: `position` keeps its type and meaning; nothing is renamed or removed.

## Capabilities

### New Capabilities
- `manual-ordering`: the ordering rule, drag and drop, keyboard moves, fractional insertion and renumbering, ordering within sections and parents, cross-container moves, and convergence under concurrent reordering.

### Modified Capabilities
- none. Existing requirements that mention "ordered by position" keep their wording; this capability defines how positions change.

## Impact

- Client only: `lib/order.ts` (midpoint, renumber, neighbours), drag primitive (`lib/dnd.ts`, shared with `board-view`), drop indicators in `TaskListView`, `Sidebar` and board columns, keyboard handlers, `?` help.
- Server: none (REST `PATCH position` already validated as a number).
- Docs: `docs/sync.md` (ordering rule and tie-break), README feature list.
- No new dependencies; bundle growth expected around 4 KB gzipped.
