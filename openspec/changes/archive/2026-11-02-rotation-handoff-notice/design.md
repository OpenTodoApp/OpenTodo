# Design

## D1. Emit after the membership commit

The departure repairs are written inside the membership transaction (`unassignDeparted`) and collected as `Change`s, which the post-commit observer already receives (`membershipTx`, the workspace directory change, `ObserveAccountDeletion`). At those same points the service now hands the changes to the assignment sinks through `emitAssignments`, the function batches use, with every assignee change marked as a turn: a departure sets an assignee only when it passes a rotating task's turn; every other repair writes null, which emits nothing. The author is the change's author (the actor, or the project owner for a deleted account), so the existing "never to the author" rule applies unchanged.

## D2. Same event, no new kind

The event is `notify.Assigned` with `Turn: true`, so the in-app inbox, push and the notification channels word it exactly as after a completion. No new notification kind, no new strings.
