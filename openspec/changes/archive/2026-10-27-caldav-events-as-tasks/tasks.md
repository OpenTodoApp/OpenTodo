# Tasks

## 1. Events decode as tasks

- [x] 1.1 In `internal/caldav/decode.go`, let `masterTask` accept a `VEVENT` master (refuse `VJOURNAL` and `VFREEBUSY`, and a mixed `VTODO`/`VEVENT` object), and map the event's timing (D2) in `eventTiming`: start as the due date, a timed length as the estimate, and `DTEND`, `TRANSP` and an event `DURATION` not kept. Update the error texts in `vtodo.go`. Verify: `go test ./internal/caldav/`.
- [x] 1.2 Add an Apple Calendar fixture (`testdata/apple-calendar-event.ics`, with `VTIMEZONE`, `VALARM`, `LOCATION` and `TRANSP`) and the decoder tests in `events_test.go`: timed, all-day, `DURATION`, floating, across a DST change, no end, a negative or over-long length, a mapped and an unmapped `RRULE`, the event statuses, and the served-back `VTODO`. `TestDecodeRejects` now checks `VJOURNAL`, `VFREEBUSY` and the mixed object. The fixture round trip accepts the event's shape change. Verify: `go test ./internal/caldav/`.

## 2. The endpoint

- [x] 2.1 `TestEventsBecomeTasks` in `internal/httpapi/caldav_events_test.go`: PUT a timed event with an alarm → 201, task fields, estimate and caldav ops; GET returns a `VTODO` with the same UID and no `VEVENT`, `DTEND` or `TRANSP`; sync REPORT lists it; a PUT of the edited event updates the task; all-day and recurring events; moving between calendars. `TestInvalidCalendarData` now refuses a `VJOURNAL` with `supported-calendar-component`. Verify: `go test ./internal/httpapi/ -run 'TestEventsBecomeTasks|TestInvalidCalendarData|TestMovingBetweenCalendars'`.
- [x] 2.2 Run the whole server suite. Verify: `go test ./...`.

## 3. Docs and release

- [x] 3.1 `docs/caldav.md`: what happens to an item saved from iOS Calendar (it becomes a task, then shows in Reminders, not Calendar); recommend Reminders for new items. Add a CHANGELOG entry (Fixes #500). Verify: `npm run docs:check`.
- [x] 3.2 Validate the change. Verify: `make openspec-validate`.
- [x] 3.3 After the PR is merged, reply on issue #500: thank calli33 (their Reminders observation pinpointed it), explain that events saved or moved to the OpenTodo account now become tasks and appear in OpenTodo and iOS Reminders, not in iOS Calendar, and name the release. Close it if the merge didn't. Verify: `gh issue view 500 -R OpenTodoApp/OpenTodo` shows the reply and the state CLOSED.
