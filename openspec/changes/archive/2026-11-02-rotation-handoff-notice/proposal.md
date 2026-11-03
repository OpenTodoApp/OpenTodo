# Proposal

## Why

A rotating chore passes to the next person in two ways: someone completes the current occurrence, or the person whose turn it is leaves the project (or is removed, or their account is deleted). The first sends the new assignee an "It's your turn" notification; the second hands the task over silently, so the new assignee only finds out by looking at Assigned to me. For the person receiving the turn both are the same event.

## What Changes

- When a departure hands a rotating task to the next person (task-assignment "Unassign on departure"), that person receives the same assignment notification a completion sends, worded as their turn: the in-app inbox, push and the notification channels ("It's your turn").
- Who is not told stays the same as for any assignment: no notification to the author of the change (the person who removed the member, or the project owner for a deleted account).
- Plain unassignments of a departure still notify nobody.

Not **BREAKING**: no op field, no migration, no environment variable.

## Capabilities

### Modified Capabilities
- `task-assignment`: "Unassign on departure" gains the hand-off notification.

## Impact

`internal/sync` (the departure paths emit assignment events after commit, flagged as a turn), tests in `internal/sync`, the shared projects guide. No client change: the inbox, push and channels already word a turn event.
