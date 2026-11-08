# Choose the level of a dropped task

## Why

In a project's tree, a drop between two rows always took the level of the row above (#1037). With `D`, then `A > B > C`, then `E`, dropping `D` under `C` made it a subtask of `B`, and there was no way to drop it between `A`'s subtree and `E` as a top-level task: the line under `C` and the line above `E` looked the same and meant different things.

## What Changes

- A drop between two rows of a tree list (a project, the Inbox) takes a level. Moving straight up or down keeps the dragged task's own level; moving the pointer or finger to the right by one indent nests it one level deeper, to the left one level shallower. The level stays between the row below's (the rows under the line keep their parent) and one deeper than the row above (a subtask of it).
- The drop line starts at the indent of that level, as the sidebar's project line already does, so the place is visible before the drop.
- Dropping on the middle of a row still makes the task its last subtask; boards and lists with their own order are unchanged.

No new control, setting, string or shortcut. The ways without dragging stay: Tab and Shift+Tab, the Reorder items of the row menu, and the task's Parent field.

## Capabilities

### Modified Capabilities

- `manual-ordering`: "Drag and drop within a list" says how a drop between rows of a tree list picks its level.
- `task-list-presentation`: "Drag feedback" says the task list's line starts at that level.

## Impact

- Web app: `web/src/app/task-list/dropDepth.ts` (the gap rule), `useListDrag.ts`, `web/src/app/listDrop.ts` (the depth on the indicator), `ListGroups.tsx`, `TaskRow.tsx` (the line's start), `TaskListView.tsx` (the groups to the drag).
- Tests: `web/src/app/listDrop.test.ts`, `web/src/app/dropDepth.test.tsx`.
- Docs: `docs/work-from-the-list.md`, `scripts/ux-audit/drag-alternatives.json`, a changelog fragment.
- Out of scope: dragging the add button to a place (#1036, its own change), a horizontal rule on boards (cards are not nested), the sidebar's project tree (it keeps its rule).
- Roadmap: 1.x polish of manual ordering; no milestone item.
