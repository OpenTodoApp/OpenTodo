# Undo an assignee change

## Why

#1748 (justinsteven) asks that more changes be undoable. Assigning or unassigning one task in the task panel recorded nothing in the undo history (#1488), so a member picked by mistake, in the panel or with the list's Assign picker, could not be put back with Ctrl/Cmd-Z, while the same change made to ticked tasks can.

## What Changes

- Assigning one task to a member, to yourself or to nobody, in the task panel (the Assignee editor, its remove button and the solo "Show in Assigned to me" switch) or with the list's Assign picker, records one step in the undo history and offers the Undo toast, named with the existing words ("Assigned to Ana", "Assigned to you", "Unassigned"). The toast matters most in Assigned to me, where the row leaves the list.
- Assigning the person a task already has records nothing.
- A repeating task is written as before (carried to its series, following the panel's scope), without a step.

## Out of scope

- Undo for a repeating task's assignee, and for taking turns.
- Other action families of #1748.

No new field, no new string, no op-log or API change, no new environment variable. Builds on undo-estimate's shared helper.
