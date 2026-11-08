# Add a task right where it belongs

## Why

Building an outline meant adding a task at the end of the list and then moving it into place (#1036). The issue asked to press and hold the floating add button and drag it to the spot. The need is real: put a new sibling at the right place, or a subtask under the right task, without the move afterwards.

## What Changes

- A task's row menu (right-click, the row's More button, or a press and hold on a phone) gets **Add task below** and **Add subtask** in a project or the Inbox, for a task the user may change.
- **Add task below** opens an inline line right after the task and its subtasks, at the task's level. Each entry becomes a sibling right after the previous one, and the line moves down under it, so it always sits where the next task will appear. Escape, or leaving the line empty, closes it.
- **Add subtask** opens the inline line `a` already opens under the task.

No new gesture, setting or shortcut; the menu items work on every device and with assistive technology.

## Capabilities

### Modified Capabilities

- `subtasks`: "Create subtasks" names the row menu's Add subtask.
- `manual-ordering`: a new requirement, "Add a task below another".

## Impact

- Web app: `web/src/app/bulk/BulkActions.tsx` (the items), `web/src/app/TaskListView.tsx`, `task-list/belowLine.ts` (where the line is drawn), `task-list/SiblingInput.tsx` (the line, lazy), `task-list/TaskListRow.tsx` (one inline add line for both), `ListGroups.tsx`, `useListShortcuts.ts`, `useListBindings.ts`, `web/src/lib/createAfter.ts` (`createTaskAfter`).
- Strings: "Add task below" and the line's placeholder, in every shipped language.
- Tests: `web/src/app/addBelow.test.tsx`.
- Docs: `docs/notes-and-subtasks.md`, `docs/work-from-the-list.md`, a changelog fragment.
- Out of scope: dragging the add button (see design D1), quick-add syntax on the inline line (it takes a title, like the subtask line), boards and lists without a tree.
- Roadmap: 1.x polish of capture and manual ordering; no milestone item.
