# Design

## Context

`caldav-interop` D1 decides inbound dates on the shape of the VTODO alone, from one table in `dateWrites(in, current)`. Mitra's fixed reader (commit b532d323) models `DTSTART` + `DUE` without a length as a moment with a deadline and keeps `DUE` across edits, so after a move it writes the new `DTSTART` and the `DUE` it was served. For a task without a deadline the served `DUE` is the due date, so the pair reads as "start and deadline" and `ShapeStartDue` writes a deadline. On the outbound side a due time was served as `DUE` only, which Mitra now reads as a due date without a schedule.

## Decisions

**D1. `DTSTART` = `DUE` for a due time.** `Encode` adds `DTSTART` equal to `DUE` when the due has a time and the task has no deadline, and drops any `DTSTART` from the preserved remainder (a stale echo). A date-only due stays `DUE` only: in Mitra a date without a time is a due date, not a scheduled block, and Thunderbird shows a bare `DTSTART` date as a "start" the user did not set. Apple Reminders, Thunderbird and DAVx⁵ already round-trip equal `DTSTART`/`DUE` for recurring tasks (`ShapeStartDueEqual` → due only), so nothing changes for them. The decoder stops keeping an equal `DTSTART` as client data when the `DUE` has a time (the server serves its own), and keeps it for a date-only `DUE` as before.

**D2. The echo rule, one row, decided on the task's current due.** In `dateWrites`, `ShapeStartDue` on a task without a deadline writes due = `DTSTART` and no deadline when the sent `DUE` equals the current due (date, time and zone). The decoder exposes the `DUE` as sent (`Inbound.SentDue`) because the shape decision rewrites `Due` and keeps only the date in `Deadline`. Alternative: client sniffing on `PRODID`. Rejected: the rule should hold for any client with Mitra's model, and a client-specific branch is what D1 of `caldav-interop` avoided. Alternative: require a duration next to the pair. Rejected: Mitra writes no `ESTIMATED-DURATION` for a moment with a deadline, and the server serves one whenever the task has an estimate, so a duration tells nothing about who wrote the pair.

Trade-off, stated: a user of Thunderbird or Apple Reminders who sets a *start* on an existing timed task and leaves its due unchanged now moves the task to that start instead of gaining a deadline. Before this change the same edit set due = start and deadline = the old due day. The intent "plan it earlier, keep the date as the deadline" is still expressed by changing `DUE` as well, or by setting the deadline in the app; the intent "reschedule" is what both Mitra and a moved event mean, and it is the one that was producing wrong data (a deadline that was never set). A changed `DUE` and a task that already has a deadline keep the previous behaviour, so no existing deadline is lost.

**D3. Equality is exact.** The echoed `DUE` must match the stored due's date, time and zone; a client that drops the zone or the time of what it was served has changed the `DUE` and sets a deadline as before. Zoned dues are served with the same `TZID`, so a faithful echo matches.

## Data model

None. Fixtures `timed-moved-echoed-due.ics`, `recurring-moved-echoed-due.ics` and `dated-scheduled-echoed-due.ics` pin Mitra's new shape.
