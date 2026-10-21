# Tasks

## 1. Durations and estimates

- [ ] 1.1 Add an iCalendar duration parser and renderer to `internal/caldav/ical.go` (`ParseDuration` → minutes with round-up of seconds, negative sign, weeks and days accepted inbound; `DurationText(minutes)` rendering hours and minutes only); verify with table tests in `go test ./internal/caldav/...` covering `PT45M`, `PT1H30M`, `P1D`, `P2W`, `PT20M30S` (→21), `-PT1H`, `PT0M` (invalid), `soon` (invalid)
- [ ] 1.2 Serve `ESTIMATED-DURATION` from `estimate_minutes` in `Encode` (`caldav.Task.EstimateMinutes`) and drop any `ESTIMATED-DURATION` from the preserved remainder; verify with `TestEstimateEncode` (90 → `PT1H30M`, none → no property, a stale line in `ical_extra` not served twice)
- [ ] 1.3 Decode `ESTIMATED-DURATION` into `Inbound.EstimateMinutes *int` and `HasDuration` (also set by `DURATION`, which stays client data); invalid values return `ErrInvalid`; verify with `TestEstimateDecode` for every scenario of "Estimate mapping" (`go test ./internal/caldav/...`)
- [ ] 1.4 Write `estimate_minutes` in `fields()` only when the property was sent, refuse values over 10080 with the `valid-calendar-data` precondition; verify with `TestPutEstimate` in `internal/httpapi/caldav_test.go` (set, left alone when absent, 403 on `P2W`, convergence with a later device edit) and `go test ./internal/httpapi/...`

## 2. Inbound date shapes

- [ ] 2.1 Replace the decoder's `dates()` decision with parsed facts on `Inbound` (`Start *Due`, `HasDue`, `HasDuration`, `StartEqualsDue`), keeping the RRULE anchor logic; verify the existing `TestDeadlineDecode` and `TestStartEveningProperties` still pass with the new fields (`go test ./internal/caldav/...`)
- [ ] 2.2 Implement the "Inbound date shapes" table in `caldav_write.go` as one function `dateWrites(in, current) (due, deadline json.RawMessage, writeDue, writeDeadline bool)` with the seven rows, and route a `DTSTART` that sets nothing into the remainder as before; verify with a table-driven `TestInboundDateShapes` over every row × {plain, deadline, recurring, deferred} asserting exactly which fields appear in the op batch (`go test ./internal/httpapi/...`)
- [ ] 2.3 Add `internal/caldav/testdata/mitra.ics` with the issue's shapes (scheduled undated task, deadline task moved, recurring task moved, due cleared) and a fixture test that each row of the design's round-trip table produces the table's result; verify with `go test ./internal/caldav/... ./internal/httpapi/...`
- [ ] 2.4 Verify no data loss: a regression test that a PUT of `DTSTART` + `ESTIMATED-DURATION` without `DUE` on a deadline task keeps `deadline` and on a recurring task keeps `due` and `recurrence` (`TestNoDueNeverClearsDeadline`, `TestRecurringMovedWithoutDue`)

## 3. Alarms as reminders

- [ ] 3.1 Encode live reminders as `VALARM` components in `Encode` (`caldav.Task.Reminders []Reminder` with kind, offset, fire_at, id): `ACTION:DISPLAY`, `DESCRIPTION`, `UID` and `X-WR-ALARMUID` from the reminder id, `TRIGGER` per design D4 (`RELATED=END`/`START`, `X-OPENTODO-KIND:DEADLINE`, absolute UTC), plus the `X-OPENTODO-ALARMS:<n>` marker; verify with `TestAlarmEncode` for relative, absolute, deadline-task relative, deadline kinds and a reminder without `fire_at`
- [ ] 3.2 Decode `VALARM` components into `Inbound.Alarms []Alarm` (uid, kind, offset or instant, mappable flag) per D4, keeping unmappable ones (`AUDIO`, `EMAIL`, `PROCEDURE`, `REPEAT`, `DURATION`, bad trigger, beyond ±525600 minutes, beyond 20) as client data, and consume `X-OPENTODO-ALARMS` into `Inbound.ServedAlarms *int`; verify with `TestAlarmDecode` over the Apple fixture and hand-written alarms for every "Alarms as reminders" scenario (`go test ./internal/caldav/...`)
- [ ] 3.3 Load the user's live reminders once in `davView` indexed by task id and pass them to `encode`; verify `TestEtagChangesOnReminderEdit` (device adds a reminder → new ETag and VALARM) and that `caldav_cost_test.go` counts one extra fixed query, not one per task (`go test ./internal/httpapi/...`)
- [ ] 3.4 Reminder writes in `fields()`/`update()`/`applyCreate()`: match by UID, create, update, tombstone per D3 (delete only when the VTODO carries an alarm or the served marker), one batch with the task ops and the recomputed `fire_at` ops via `reminderOpsForTaskAs` on the merged state; verify with `TestAlarmBecomesReminder`, `TestAlarmEditedKeepsIdentity`, `TestAlarmRemovedTombstones`, `TestClientWithoutAlarmsLeavesReminders`, `TestTooManyAlarms`, `TestAlarmOnUndatedTask` (`go test ./internal/httpapi/...`)
- [ ] 3.5 Delivered and dismissed stay local: a test that a fetch after a device dismissed a reminder serves the alarm unchanged and the following PUT of the unchanged VTODO writes no op (`TestDismissalStaysLocal`)
- [ ] 3.6 Convergence: a test that a CalDAV trigger edit loses to a later offline tombstone from a device (`TestLaterReminderDeleteWins`), and the unauthenticated case (`TestAlarmWriteRequiresAuth`, 401 and no op)
- [ ] 3.7 History attribution: verify in `internal/activity` fixtures that a reminder created by device `caldav:<id>` is labelled as the calendar app in both the Go and the web activity output (`go test ./internal/activity/...`, `npm test -- activity` in `web/`)

## 4. Documentation

- [ ] 4.1 Update `docs/caldav.md`: mapping table rows for `ESTIMATED-DURATION`, `VALARM` and the date shapes; replace the "Alarms" section with "Alarms and reminders" (both directions, what stays client data, the delete rule); add "Scheduled times and estimates" with the shape table; update the "everything else" row and the "Fields without a VTODO counterpart" line; verify `make docs-check`
- [ ] 4.2 Update `docs/api.md` (`ical_extra` note no longer lists alarms as always opaque; `estimate_minutes` mentions CalDAV), `docs/task-reminders.md` (one paragraph: reminders from calendar apps), `docs/time-blocking.md` or the estimates page (estimate travels over CalDAV); verify `make docs-check`
- [ ] 4.3 Reply on GitHub issue #196 with what changed on OpenTodo's side (rows 2, 3, 4 and 5 of its table) and what remains on Mitra's side (reading `DTSTART` = `DUE` as a due time), and close it when the change is archived; verify by the issue thread

## 5. Verification against real clients

- [ ] 5.1 Add the verification table to `docs/caldav.md` with one row per client (Apple Reminders iOS, Apple Reminders macOS, Thunderbird, DAVx⁵ + Tasks.org, DAVx⁵ + jtx Board, Mitra) and one column per behaviour, every cell "not verified" with today's date; remove the "still pending" sentence in "Limits" when the first row is filled; verify `make docs-check`
- [ ] 5.2 Run the scenario script (served shapes, moves without `DUE`, estimate, alarm add/edit/remove, dismissal, recurrence completion) against each client available to the maintainer, record version, date and result per cell, and open an issue per failure with the client's VTODO; verify by the filled table in the pull request
- [ ] 5.3 Fold each client's observed VTODO into `internal/caldav/testdata/<client>.ics` as a fixture so the behaviour is pinned (`go test ./internal/caldav/...`)
- [ ] 5.4 Update issue #9 ("Call for testers") with the CalDAV rows that still read "not verified" and the exact steps a tester should run

## 6. Finish

- [ ] 6.1 Run `make check`; add the CHANGELOG.md entry under Unreleased (Added: estimates and alarms over CalDAV; Fixed: a calendar app that writes a start and a duration without a due date no longer clears the due date and the deadline) with an upgrade note that alarms become reminders on the next save from the calendar app; verify `make check` passes and `openspec validate caldav-interop --strict` is clean
