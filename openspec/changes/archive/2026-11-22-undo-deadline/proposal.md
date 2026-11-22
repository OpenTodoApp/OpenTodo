# Undo a deadline change

## Why

#1748 (justinsteven) asks that more changes be undoable. In the task panel's When editor, changing or removing a task's due date offers Undo, but changing or removing its deadline right beside it did not, and recorded nothing in the undo history (#1488).

## What Changes

- Setting or removing one task's deadline in the When editor records one step in the undo history and offers the Undo toast, like the due date beside it, named with the existing words ("Deadline Tue 30 Apr 2030", "Deadline removed").
- Its deadline reminders follow the restored deadline, as they follow any deadline change.
- Setting the deadline a task already has records nothing.
- A repeating task is written as before (carried to its series, following the panel's scope), without a step.

## Out of scope

- Undo for a repeating task's deadline.
- The Timeline's deadline edge drag and its deadline key, which write the deadline through their own path.
- Other action families of #1748.

No new field, no new string, no op-log or API change, no new environment variable. Builds on undo-estimate's shared helper.
