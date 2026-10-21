# Proposal

## Why

Calendar clients that are not Apple Reminders, Thunderbird or DAVx⁵ lose task dates when they talk to OpenTodo over CalDAV. GitHub issue #196 (Mitra, a calendar client) lays it out: OpenTodo never serves the duration estimate, serves a deadline task as `DTSTART` + `DUE` (which a scheduling client reads as a time block with no due date), and reads any VTODO that arrives without `DUE` as "clear the due date and the deadline", so a client that writes `DTSTART` + `ESTIMATED-DURATION` for a scheduled task silently erases both dates on every device. The roadmap also still lists "Reminders over CalDAV": alarms set in a calendar app are kept as opaque client data and never become OpenTodo reminders, and OpenTodo reminders never reach the calendar app. Both are interoperability gaps in a feature whose whole point is that a calendar app is one more synced device.

## What Changes

- **Estimates travel.** A task's duration estimate is served as `ESTIMATED-DURATION` (RFC 9253, from draft-ietf-calext-ical-tasks), and an inbound `ESTIMATED-DURATION` sets `estimate_minutes`, rounded to whole minutes, bounded by the field's limit. A client that never sends the property leaves the estimate alone; a client that sends it on a task that has one and then drops it leaves the estimate alone too (absence is not removal, as for the other optional properties). The property is no longer stored in `ical_extra`.
- **A start with a duration is a scheduled time.** A VTODO with `DTSTART` and no `DUE` sets the due date (and time) from `DTSTART` when it also carries `ESTIMATED-DURATION` or `DURATION`, instead of being treated as client data on a task whose dates are then cleared. A bare `DTSTART` without `DUE` and without a duration is still client data, and leaves the task's dates as they are.
- **Omitting `DUE` never clears both dates.** The inbound date rules are restated as one table of shapes (`DUE` only, `DTSTART` + `DUE` equal, `DTSTART` + `DUE` different, `DTSTART` + duration, `DTSTART` alone, neither) against the task's current state (plain, deadline, recurring, deferred), saying for each which fields are set, which are cleared and which are left alone. The one data-loss case of the issue (a client moves a deadline or recurring task and writes no `DUE`) now keeps the task's deadline and sets the due date from the start. Clearing a due date through CalDAV still works, through a VTODO with neither date nor duration.
- **Alarms become reminders, both ways.** A `VALARM` with a relative `TRIGGER` maps to a relative reminder (offset from the due time, `RELATED=END` and the default) or, on a task that has a deadline and an alarm the server itself served against the deadline, to a deadline reminder; a `TRIGGER;VALUE=DATE-TIME` maps to an absolute reminder. OpenTodo reminders are served as `VALARM` components with `ACTION:DISPLAY`, one per live reminder, with a stable alarm UID derived from the reminder id so a client can match them across fetches. Alarms the mapping cannot express (`ACTION:AUDIO`/`EMAIL`, `REPEAT`/`DURATION`, triggers relative to `DTSTART` of a task served without one, more than the reminder limit) stay in `ical_extra` verbatim as today. Dismissed and delivered state is not exchanged: an alarm the client acknowledges stays a reminder OpenTodo may still deliver, as for two OpenTodo devices.
- **The deadline is served as a date, the planned day as a start, and the client is told so.** Nothing changes in the served shapes for deadline tasks (`DTSTART` = due, `DUE` = deadline) because Apple Reminders and Thunderbird already round-trip them; the fix for scheduling clients is on the inbound side, and the comparison table in the design records what each known client writes back.
- **Verification is tracked.** A checklist per real client (Apple Reminders on iOS and macOS, Thunderbird, DAVx⁵ with Tasks.org and jtx Board, Mitra) with the exact scenarios of this change, results recorded in `docs/caldav.md` and the "still pending" line removed when done. This is the CalDAV part of ROADMAP.md "Real-world verification" and issue #9 "Call for testers".

Out of scope: `VALARM` `REPEAT`/`DURATION` (snooze patterns), `ACTION:EMAIL` and `AUDIO` alarms, exchanging delivered or dismissed state, per-occurrence alarm overrides, `LOCATION`/`GEO` (follow-up of `task-locations`), serving OpenTodo reminders in the read-only calendar feed, time tracking over CalDAV, changes to Mitra (the issue names two on its side; this change only makes OpenTodo robust to the shapes Mitra writes today), and any change to the due, deadline, start or reminder data model. No new environment variable; no op-log format change; nothing **BREAKING**.

ROADMAP.md: completes the "Reminders over CalDAV" future idea and the CalDAV row of "Real-world verification"; closes issue #196 on OpenTodo's side.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `caldav-sync`: "Property mapping" gains `ESTIMATED-DURATION`; "Due forms and recurrence" and "Deadline mapping" are restated so that the absence of `DUE` never clears a deadline and a `DTSTART` with a duration sets the due date; "Unmapped properties preserved" no longer lists alarms and estimates as unmapped; new requirements "Estimate mapping", "Inbound date shapes", "Alarms as reminders" (both directions, limits and what stays client data) and "Real-client verification".
- `reminders`: the "Reminder entity" requirement gains the CalDAV device as a writer of reminders through the same operations and limits (one added requirement "Reminders written by calendar clients"), so that reminders created from alarms follow every rule above (recomputed with the due date, dismissed by the server on completion, Trash rule).

## Impact

- Server: `internal/caldav` (`vtodo.go` encode of `ESTIMATED-DURATION` and `VALARM`; `decode.go` date shapes, duration, alarm parsing into an `Alarms` list on `Inbound`; `ical.go` duration parsing), `internal/httpapi/caldav_write.go` (`fields` date table, estimate, reminder ops through `ApplyStrict` with device `caldav:<app-password-id>`), `internal/httpapi/caldav_dav.go` (`encode` passes the estimate and the task's live reminders; the view loads reminders once per request, indexed by task, within the "CalDAV lookups do not scan the account" rule), the ETag input (reminders now change the resource).
- Data: no new fields or entities. Reminders written by CalDAV use the existing `reminder` entity and the existing kinds. `ical_extra` shrinks for tasks whose alarms are now mapped (the mapped lines are consumed on the next write by the client).
- Clients: nothing in `web/`; devices see reminders created by a calendar app like any other reminder, in the panel and in push.
- Docs: `docs/caldav.md` (mapping table, "Alarms" section rewritten, a new "Estimates and scheduled times" section, the verification table), `docs/api.md` (`ical_extra` note), `docs/task-reminders.md` (one line that calendar apps can add reminders), `CHANGELOG.md`.
- Fixtures: `internal/caldav/testdata/` gains `mitra.ics` (the shapes in the issue) and alarm fixtures per client; `internal/httpapi/caldav_test.go` gains the date-shape table test and the reminder round-trip tests.
- Size: no dependency; the server binary grows by a few KB. Runtime: one more indexed list per CalDAV request (the user's reminders), bounded like the task list.
