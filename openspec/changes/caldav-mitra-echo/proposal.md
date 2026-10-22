# Proposal

## Why

Mitra fixed its side of issue #196 (commit b532d323): `DUE` is now always the due date, `DTSTART` the start and `ESTIMATED-DURATION` the length, and a task with a start and no length is a scheduled moment. Two gaps remain on OpenTodo's side (issue #248): a task scheduled in Mitra comes back as `DUE` + `ESTIMATED-DURATION` without `DTSTART`, so Mitra shows it as unscheduled again; and when Mitra moves a task that was served with `DTSTART` = `DUE` it sends the new `DTSTART` with the old `DUE` echoed, which the inbound date table reads as a start and a deadline, so the task gains a deadline nobody set.

## What Changes

- A task with a due time and no deadline is served with `DTSTART` = `DUE` (as recurring tasks already are), so DTSTART-scheduling clients keep it scheduled. A due date without time stays `DUE` only. The server's own start replaces a stale copy a client had echoed into the preserved remainder, and an equal `DTSTART` echoed back on a timed `DUE` is no longer stored as client data (an equal `DTSTART` on a date-only `DUE`, a "started" task in Thunderbird, still is).
- Inbound, `DTSTART` with a different `DUE` on a task without a deadline is a move, not a new deadline, when the `DUE` is exactly the task's current due date, time and zone (what the server served): the due date follows `DTSTART` and no deadline is written. A `DUE` the client changed still sets the deadline, and on a task that has a deadline the echoed `DUE` is that deadline as before.
- No op, data or settings change.

Out of scope: `DTSTART` on date-only due dates; any other row of the inbound date table; what Mitra does with `DUE;VALUE=DATE` of a deadline task.

ROADMAP: follows the `caldav-interop` change (issue #196).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `caldav-sync`: "Property mapping" (timed tasks served with `DTSTART`), "Due forms and recurrence" (`DTSTART` = `DUE` for a due time), "Deadline mapping" (the echoed `DUE`), "Unmapped properties preserved" (an echoed equal `DTSTART` on a timed `DUE` is not client data). The requirement texts build on the `caldav-interop` deltas, which archive first.

## Impact

- `internal/caldav/vtodo.go` (`Encode`, `Inbound.SentDue`), `decode.go` (`dates`), `internal/httpapi/caldav_write.go` (`dateWrites`, `dueEchoed`); fixtures `internal/caldav/testdata/mitra/*-echoed-due.ics`; tests in both packages.
- `docs/caldav.md` (mapping rows, the shapes table, Recurrence), `CHANGELOG.md`.
