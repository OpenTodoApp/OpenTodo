# Undo a task added with quick add

## Why

#1748 (justinsteven): adding a task, renaming it or moving it should be undoable. On `main`, renaming, moving, rescheduling, parking, completing and deleting already record a step in the undo history (#1488), and so does pasting several lines into quick add. Adding **one** task with quick add records nothing: Ctrl/Cmd-Z and the palette's Undo skip it, so a task added by mistake has to be found and deleted by hand.

## What Changes

- A task added with quick add records one step in the undo history: in a list's quick add line, the quick add sheet and the command bar's add. The step has the same words as a pasted batch ("1 task added"). Undoing it moves the task, and the reminders and time entry quick add made with it, to the Trash; redo brings them back.
- No toast is added. A single add stays as quiet as today; the history is reached with Ctrl/Cmd-Z and the palette, as the undo-history spec already describes.
- The write is the same: the task is planned exactly as before (position, recurrence, quick-add reminders, spent time) and applied as one batch, locally first and offline-capable, through the op log.

## Out of scope

- Other ways to create a task (a calendar day's add dialog, share capture, the review flows; Vim's `o` opens the quick add line, so it is covered) and other action families from #1748: one family per change, next ones after this.
- A toast for a single add.

No new field, no op-log or API change, no new environment variable.
