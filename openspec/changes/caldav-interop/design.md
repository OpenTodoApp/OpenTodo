# Design

## Context

See proposal.md for the motivation. Relevant current state, observed in the code:

- `internal/caldav/vtodo.go` `Encode` serves a deadline task as `DUE;VALUE=DATE` = deadline and `DTSTART` = due, a recurring task as `DUE` plus `DTSTART` = `DUE`, and a plain task as `DUE` only. It never writes `ESTIMATED-DURATION` and never writes a `VALARM` of its own; alarms in `ical_extra` are appended verbatim.
- `internal/caldav/decode.go` reads `DUE`, `DTSTART` and `RRULE`; `dates()` turns differing `DTSTART`/`DUE` into due + deadline, equal ones into due only, and keeps a `DTSTART` without `DUE` as client data. Every nested component (`VALARM`) is copied to `Extra` line by line. `DURATION` and `ESTIMATED-DURATION` fall into `default: d.keep(p)`.
- `internal/httpapi/caldav_write.go` `fields()` writes `due` from `in.Due` and `null` when `in.Due == nil`, and writes `deadline: null` whenever the task had one and the client did not send a shape that names it. That is the data loss of issue #196: a VTODO with `DTSTART` and no `DUE` clears both dates. `update()` already calls `reminderOpsForTaskAs` to move relative and deadline reminders with the due or deadline in the same batch.
- `internal/httpapi/caldav_dav.go` `encode()` builds `caldav.Task` from the materialized row; the view loads tasks, projects, labels and resource names once per request (`davView`, "CalDAV lookups do not scan the account"). Reminders are not loaded.
- Reminders (`internal/sync/ops.go` `reminder` entity) have kinds `relative`, `absolute`, `deadline`, an `offset_minutes` within ±525600, `fire_at`, `delivered_at`, `dismissed_at`, `deleted_at`. `estimate_minutes` is a positive integer at most 10080 (`docs/api.md`).
- The ETag is computed from the encoded resource, so anything that changes the encoding changes the ETag.
- Fixtures: `internal/caldav/testdata/apple-reminders.ics` (Apple, `DUE` = `DTSTART` zoned, weekly `RRULE`, one absolute `VALARM`), `thunderbird.ics` (`DUE;TZID`), `davx5-tasks.ics` (`DUE;VALUE=DATE`). None carries `ESTIMATED-DURATION` or a `DTSTART` without `DUE`.
- RFC 9253 defines `ESTIMATED-DURATION` for VTODO as a `DURATION` value; Mitra writes `DTSTART` + `ESTIMATED-DURATION` and adds `DUE` only when the task has a due date (issue #196).

## Goals / Non-Goals

**Goals:**
- No inbound shape a known client writes can clear a date the client did not mean to clear.
- Estimates round-trip as a standard property.
- Reminders and alarms are the same thing seen from two sides, within the limits of what both models express; what one side cannot express is preserved, never dropped.
- Every rule is a table a reader can check a client against, and the table is exercised by fixtures per client.

**Non-Goals:**
- Changing what is served for deadline and recurring tasks. Apple Reminders and Thunderbird round-trip `DTSTART` + `DUE` today; changing the served shape would risk the clients that work for the one that does not. The issue's Mitra-side fixes stay with Mitra.
- Exchanging delivered or dismissed state, `REPEAT`/`DURATION` snooze patterns, `ACTION:EMAIL`/`AUDIO`, per-occurrence alarms, alarms in the read-only calendar feed.
- Any change to the due, deadline, start, estimate or reminder data model.

## Decisions

**D1. One inbound date table, decided on the shape, not on the diff.** `Inbound` gains `Start *Due` (a parsed `DTSTART`), `HasDue`, `HasDuration` and the decoder stops deciding; `fields()` applies the table of "Inbound date shapes" using the task's current `deadline`. The `DueOnly` flag is replaced by the shape. Alternative: keep the decoder's logic and special-case "no `DUE` but a duration". Rejected: the current code mixes the decision between `decode.go` and `caldav_write.go`, which is how the clearing bug slipped in; one table in one place, with a table-driven test over every row × current state, is checkable against the spec line by line.

Round-trip table used to derive the rows (served shape → what each client writes back → what the table does). "unchanged" means the field is not written.

| Task | Served | Mitra writes back | Apple Reminders writes back | Thunderbird writes back | DAVx⁵ (Tasks.org, jtx) writes back | Table result |
| --- | --- | --- | --- | --- | --- | --- |
| due only (date) | `DUE;VALUE=DATE` | `DUE` (no start) or `DTSTART`+`ESTIMATED-DURATION` once scheduled | `DUE` (= `DTSTART` when an alarm or recurrence exists) | `DUE` | `DUE` | due set; deadline unchanged |
| due with time | `DUE` | `DTSTART` = `DUE` + `ESTIMATED-DURATION`, `DUE` kept when it had one | `DUE` + `DTSTART` equal | `DUE` (+ `DTSTART` equal when the task is "started") | `DUE` | due set; deadline unchanged |
| deadline + due | `DTSTART` + `DUE;VALUE=DATE` | `DTSTART` + `ESTIMATED-DURATION`, no `DUE` (issue row 5) | `DTSTART` + `DUE` both | `DTSTART` + `DUE` both | `DTSTART` + `DUE` both | Mitra: due from `DTSTART`, deadline unchanged (was: both cleared). Others: due + deadline as before |
| deadline only | `DUE;VALUE=DATE` | `DUE` (read as due with no start) | `DUE` | `DUE` | `DUE` | deadline set from `DUE`, due cleared (unchanged behaviour, "Deadline-only task edited in a client") |
| recurring | `DUE` + `DTSTART` equal | `DTSTART` + `ESTIMATED-DURATION`, no `DUE` (issue row 5) | `DUE` + `DTSTART` equal | `DUE` + `DTSTART` equal | `DUE` + `DTSTART` equal | Mitra: due from `DTSTART` (was: due cleared). Others: due set |
| undated, scheduled in the client | none | `DTSTART` + `ESTIMATED-DURATION` (issue row 4) | `DUE` | `DUE` | `DUE` | due set from `DTSTART` (was: ignored) |
| undated, estimate only in the client | none | `ESTIMATED-DURATION` only | n/a | n/a | n/a | estimate set, dates unchanged |
| any, due cleared in the client | | no dates, no duration | no `DUE` | no `DUE`, maybe `DTSTART` of a "started" task | no `DUE` | due cleared, deadline unchanged |

The Apple, Thunderbird and DAVx⁵ columns come from the fixtures and from the `caldav-sync` scenarios already pinned ("Recurring anchor unchanged", "Deadline-only task edited in a client", "Client without the properties"); the real-client table of task 6 confirms them. The Thunderbird "started task" row shows why a bare `DTSTART` must leave dates alone rather than set the due date: Thunderbird writes `DTSTART` for a task whose "Start" was set in its own UI, with `DUE` the real due date, so a bare `DTSTART` is the only case where "unchanged" and "client data" is right, and `DTSTART` sets the due date only when a duration says the client meant a scheduled block.

**D2. `ESTIMATED-DURATION` as the estimate; `DURATION` only as a signal.** Outbound only `ESTIMATED-DURATION` (RFC 9253). Inbound both `ESTIMATED-DURATION` and `DURATION` count as "a duration" for the date table, but only `ESTIMATED-DURATION` sets `estimate_minutes`; a `DURATION` (RFC 5545 allows it on VTODO with `DTSTART`) is kept as client data as today. Alternative: map `DURATION` to the estimate too. Rejected: `DURATION` on a VTODO means "the period the task is scheduled for", a block, which is not always the estimate, and a client that sends both would make the two disagree. Values are rendered in hours and minutes (`PT1H30M`, `PT45M`), never days, so every client parses the same thing; seconds in inbound values round up.

**D3. Alarm identity by UID.** Outbound alarms carry `UID:<reminder-id>` and `X-WR-ALARMUID:<reminder-id>` (Apple needs the latter, RFC 9074 the former). Inbound matching: by either UID against the task's live reminders; a match updates, no match creates. Deletion needs a signal that the client knew about the alarms: a served reminder's alarm missing from a VTODO that carries at least one `VALARM`, or from a client that had fetched the resource while it carried one. The second condition cannot be known per client, so it is approximated per resource: `fields()` deletes missing served reminders only when the inbound VTODO carries at least one `VALARM` **or** the inbound `ical_extra` still carries any alarm-less marker the server adds on serve: `X-OPENTODO-ALARMS:<n>` (the count of alarms served). A client that echoes X- properties (all known clients do) returns the marker, which tells the server "this client saw n alarms"; a VTODO without the marker and without alarms came from a client that never saw them, and reminders are left alone. Alternative: delete on any absence. Rejected: a client that strips alarms it does not display (DAVx⁵ with some apps) would delete every reminder on each edit. Alternative: never delete. Rejected: removing an alarm in Apple Reminders must remove the reminder, otherwise the phone keeps buzzing.

**D4. Trigger mapping.** Relative reminder ↔ `TRIGGER;RELATED=END:±PTnM` (outbound always `RELATED=END` against `DUE`; for a task served with a deadline, `DUE` is the deadline, so a *relative* reminder is instead served `RELATED=START` against the `DTSTART` that is the due date, and a *deadline* reminder `RELATED=END`; `X-OPENTODO-KIND:DEADLINE` marks the deadline kind for the inbound side and for clients that drop `RELATED`). Inbound: `X-OPENTODO-KIND:DEADLINE` → deadline kind; otherwise `RELATED=END` or default → relative when the served `DUE` is the due date, and deadline kind when the task has a deadline (because then `DUE` was the deadline); `RELATED=START` → relative when the VTODO's `DTSTART` is the due date (deadline task or recurring task), client data otherwise. Absolute `TRIGGER;VALUE=DATE-TIME` → absolute reminder at that instant (UTC or zoned; a floating date-time is read in the user's zone). Offsets are whole minutes; seconds round toward the due time. Offsets beyond ±525600 minutes stay client data. The chosen limit of 20 mapped alarms per VTODO matches what a hand-made task can carry without making one PUT write dozens of entities.

**D5. Reminders in the request view.** `davView` loads the user's live reminders once (`sync.List(ctx, uid, "reminder", false)`, which is bounded like the task list) and indexes them by task id; `encode()` serves them and the ETag follows. The cost test (`caldav_cost_test.go`) gains the reminder list as one more fixed query per request. Alternative: a per-task lookup. Rejected by "CalDAV lookups do not scan the account".

**D6. One batch per PUT.** Task field ops, label ops, reminder create/update/tombstone ops and the recomputed `fire_at` ops go through one `ApplyStrict` with device `caldav:<app-password-id>` and one timestamp, so a device receives the task and its reminders together ("Reminders created with their task") and undo in the app's history sees one change. Order inside the batch: task fields, then reminders, then `reminderOpsForTaskAs` for the live set including the new ones (computed from the batch's due/deadline, not the stored ones).

**D7. Served marker and `ical_extra` hygiene.** `X-OPENTODO-ALARMS:<n>` is served on every VTODO (0 when none) and consumed on read, never stored. Mapped `VALARM`s and `ESTIMATED-DURATION` are removed from `ical_extra` on the next write by the client that sent them (the decoder no longer keeps them), so a task whose alarm was once opaque becomes a reminder the first time the client writes the task again after the upgrade; nothing is migrated in bulk. Rationale: a bulk migration would create reminders (and push notifications) for every alarm ever preserved without the user doing anything.

**D8. Data model.** No new entity or field. Reminder writes use existing kinds. The CalDAV device id is already a reserved prefix. Nothing to migrate; downgrade: an older server serves no alarms and keeps the ones clients send as `ical_extra` again, reminders already created stay reminders.

**D9. Size and memory.** No dependency. Binary: about 10 KB of Go (duration parsing, alarm encode/decode, the table). Memory: one more list per CalDAV request, proportional to the user's reminders, released with the view.

**D10. Interface.** No screen changes. The task panel shows reminders created by a calendar app with the existing reminder rows; the history attributes them to "Calendar app (<app password name>)" through the device prefix, which the history already labels.

## Risks / Trade-offs

- [A client strips `X-OPENTODO-ALARMS` and sends no alarms] → reminders are left alone (never deleted), which is the safe failure; the verification table records which clients echo X- properties.
- [A client rewrites served alarms with new UIDs on every save (some do)] → the old reminders are deleted and new ones created on each save; `delivered_at`/`dismissed_at` reset, so a dismissed reminder may fire again. Mitigation: match by trigger as a second key when the UID does not match but the trigger and kind equal a served reminder's; recorded as an open question until a real client shows the behaviour.
- [Alarms on recurring tasks] → the reminder follows the series' due date like app reminders; a client that expands occurrences locally shows its own alarms per occurrence, which is its behaviour today.
- [Upgrade creates reminders from alarms a user set long ago in Apple Reminders] → only on the next write of that task from that client (D7), and documented in the CHANGELOG upgrade note.
- [`DURATION` with `DTSTART` from a client that meant a block, not a due time] → the due time is `DTSTART`, the block length is kept as client data; the Day view shows the estimate only when `ESTIMATED-DURATION` was sent.

## Migration Plan

No schema change. Deploy the server; nothing changes for clients until they write. Upgrade note: calendar alarms now become OpenTodo reminders the next time the calendar app saves the task, and OpenTodo reminders now appear as alarms in calendar apps; estimates appear as `ESTIMATED-DURATION`. Rollback: an older server ignores all of it; reminders created meanwhile stay.

## Open Questions

- Whether any target client rewrites alarm UIDs on save (risk above). Decided after the real-client run of task group 6; the second-key match is implemented only if a client needs it.
- Whether Apple Reminders displays `RELATED=START` alarms on a deadline task correctly or needs the `DTSTART`-relative alarm converted; decided by the same run.
