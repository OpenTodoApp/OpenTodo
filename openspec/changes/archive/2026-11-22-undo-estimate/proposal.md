# Undo an estimate change

## Why

#1748 (justinsteven) asks that more changes be undoable. Setting or removing one task's estimate (the task panel's Estimate field and its remove button) recorded nothing in the undo history (#1488). In the calendar, stretching a block's lower edge changed the estimate without the Undo its other edits (moving it, moving its upper edge) already offer.

## What Changes

- Setting or removing one task's estimate in the task panel records one step in the undo history, named with the existing words ("Estimate 90 min", "Estimate removed"). No toast is added there, as for the other single edits.
- Stretching a calendar block's lower edge records the same step and offers the Undo toast, like the block's other edits.
- Setting the estimate a task already has records nothing.
- A repeating task is written as before (carried to its series, following the panel's scope), without a step.
- One small shared helper writes such plain field edits as a step, so later families of #1748 reuse it.

## Out of scope

- Undo for a repeating task's estimate.
- Other action families of #1748.

No new field, no new string, no op-log or API change, no new environment variable.
