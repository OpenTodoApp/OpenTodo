# Proposal

## Why

Google Calendar sync stops with `http_409` and never recovers (GitHub issue [#1573](https://github.com/OpenTodoApp/OpenTodo/issues/1573)). Google keeps a deleted event in its Bin for 30 days and refuses a new event with the same UID with 409 Conflict. Every event OpenTodo writes has the task id as its UID, so a task whose event was deleted (the task was completed, undated or moved out of the window and its event removed, or the person deleted the event in Google) cannot be written again when it qualifies once more: it is reopened, dated again or comes back into the window. The 409 fails the whole cycle, so no other task syncs either, and deleting and adding the connection does not help, because the UIDs stay in the Bin.

## What Changes

- **A taken UID gets the event a UID of its own.** When the calendar answers a creation with 409, the event is created again with the UID `<task-id>-<8 hex digits>` at the address of the same name (`<task-id>-<8 hex digits>.ics`). The connection links the task to that address as before, so reading the event back, later changes and its removal work as for any other event, and those keep its UID.
- Nothing changes for an event whose UID is free, for Microsoft connections (Graph has no UIDs to reuse) or for any data on devices.

Out of scope: emptying Google's Bin, and stopping a single refused event from failing the whole cycle (a broader change of the cycle's error rule).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `calendar-sync`: "Tasks written to the calendar" says what happens when the calendar refuses the task id as UID.

## Impact

- `internal/calsync/transport.go`: the WebDAV transport's create retries once on 409 with its own UID; replace reads the UID from the event's address.
- `internal/calsync/calsynctest`: the test server can keep deleted UIDs taken, like Google.
- No migration, no new field, no op, no route; no size impact.
