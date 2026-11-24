# Design

## D1. A UID of its own, read back from the address

On a 409 to `PUT <task-id>.ics` with `If-None-Match: *`, the transport writes the event once more with UID `<task-id>-<random 8 hex>` at `<that UID>.ics`. The connection's link already stores the event's address, and every later write of the event goes through it, so the UID is read from the address: a name that starts with `<task-id>-` is the event's UID, anything else means the task id. This needs no new column and works for links stored before the change (their address is `<task-id>.ics`).

The pull never matched events by UID (links match by address), so a different UID changes nothing there; the calendars shown as subscriptions skip OpenTodo's own events by address first.

Alternatives: storing the UID on the link (a migration for one rare case); a deterministic suffix (a second removal and re-creation would meet its own Bin entry again). A server other than Google that answers 409 because the UID is used by a live event at another address gets a second event; OpenTodo only writes `<task-id>.ics` or suffixed addresses it keeps linked, so that happens only after links are lost in a restore, the case the 412 adoption covers for the plain address.

## Data model

None: no field, op or table changes.
