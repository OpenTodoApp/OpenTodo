# Undo ticking and single-row moves everywhere, and deleting sections, labels and fields

## Why

Follow-ups to #1748: #2001, #2002 and #2003. Checked on main (2026-11-25):

- **Already undoable:** ticking a task in the main lists, Triage, Focus, the calendar views, Plan, the task panel and the assistant's blocks (`completeWithUndo`); dragging several ticked rows (`moveTasksUndoable`); a drop on a sidebar project, label, the Inbox, Today or a day of Upcoming; every drag, drop and keyboard step in a label page's, a saved view's, Today's or Upcoming's own order (`viewOrderActions`); reopening a card into a board column.
- **Not undoable:** ticking a task in the Filter view, saved views, the dashboard, the weekly review, the Daily check, the monthly look and the method lists (`setTaskCompletedWithFeedback`); dragging a single row in a project or the Inbox, or onto a section heading (`moveTask`); a board column move by drag or Shift+arrow, and the task panel's section picker (`moveTaskToSection`); keyboard reordering with Alt+arrows, the row menu's Move items, Vim's counts and the task panel's subtask handles (`moveTaskBy`); deleting a section, deleting or merging a label, and deleting a custom field. The last four are behind a confirmation only, and the Trash cannot restore them.

## What Changes

- Every surface above ticks through `completeWithUndo`: one step named "Task completed" with the Undo toast, as in the main list.
- A single row's drag among rows or onto a section heading is one step named "1 task moved", as a drag of ticked rows; a keyboard move is one step per press named "Order changed", as in a view's own order; a move to a board column or a section from the picker is one step named "Moved to {section}". Each shows the Undo toast.
- Deleting a section ("Section deleted"), deleting a label ("Label deleted"), merging a label ("Merged into {label}") and deleting a custom field ("Field deleted") are each one batch and one step with the Undo toast, after the same confirmation. Deleting or merging a label now writes one batch instead of one per task.
- Completing through the undoable step also ends the person's running time entry on the task in the same batch, as the plain completion did (time-tracking "Complete stops tracking"); the main list's completion missed this.

## Out of scope

- Display mode (no toast, no shell), notification and widget actions, and the server's and agents' completions.
- Undo for renaming, recolouring or reordering a section, label or field, and for creating one.
- Dropping the confirmation dialogs.

No ROADMAP.md item: a follow-up to #1748, like the other undo changes. No new field, no op-log or API change, no new environment variable. Four new strings, translated in every shipped catalog.
