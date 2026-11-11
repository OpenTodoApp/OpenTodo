# Proposal

## Why

Adding a subtask from a list is several steps today: the row menu's Add subtask exists only in a project or the Inbox, the `a` shortcut opens a line whose new subtask flat views cannot show, and the always-available path is opening the task page for its "Add subtask" input (#1191). Other task apps keep an add line at the end of a parent's visible subtasks, so adding one more never leaves the list.

## What Changes

- **An "Add a subtask" line at the end of a parent's visible subtasks.** Wherever a list renders subtasks as indented rows — a project's or the Inbox's tree, and Today and Upcoming with Nest subtasks on — a muted "+ Add a subtask" row sits at child indent after the parent's last visible subtask. Clicking it turns it into the same inline input `a` opens; Enter creates the subtask above the line and the input stays for the next; Escape or an empty blur returns it to the muted line. The line writes through `createSubtask`, so it works offline and converges like every other add.
- **Only where a subtask list already shows.** A task with no visible subtasks gets no line — childless tasks, or parents whose subtasks are folded — and neither do completed tasks or read-only rows, matching the row menu's own rules. Several parents ending at the same row each get a line at their own indent, so the line always reads "add under this parent".

Out of scope: flat views (Today and Upcoming without Nest subtasks, labels, places, Filter and saved views), board cards, and the `a` shortcut's behaviour in flat views — where it does create the subtask but the flat list cannot show it (reported to the maintainer under #1191 rather than changed here).

Not on the roadmap (community request).

Fixes #1191

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `subtasks`: "Create subtasks" gains the list add line as a way to add a subtask; a new requirement "Add-subtask line in lists" covers where the line shows, its muted and open states and its rules.

## Impact

- **Data model and op schema:** none — the line writes the same `createSubtask` ops as the row menu, `a` and the task panel; offline and convergence behaviour is inherited unchanged.
- **Web:** `web/src/lib/listGroups.ts` marks each row with the parents whose visible subtree ends after it (an additive `ListRow` field, folded into `sameRow`/`keepGroups` so the line follows the rows as they are patched); `web/src/app/task-list/ListGroups.tsx` renders the line; `SubtaskAddLine` in `TaskListRow.tsx` swaps the muted line for the existing `SubtaskInput`.
- **i18n:** the existing strings "Add a subtask" and "Add subtask" are reused.
- **Bundle:** inside the list's own code path (~1 KB min); no dependency, no new lazy chunk.
