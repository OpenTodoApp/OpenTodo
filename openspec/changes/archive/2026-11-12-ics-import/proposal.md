## Why

Nextcloud Tasks, Thunderbird, Evolution, Tasks.org and most other CalDAV task apps can save a task list as an iCalendar file (`.ics` with `VTODO` components, RFC 5545). OpenTodo already reads `VTODO` for CalDAV, but it cannot import such a file: someone leaving Nextcloud, or restoring an offline backup of a task list, has to set up a CalDAV client and copy tasks across by hand (issue #1201). The reporter's lists use subtasks (`RELATED-TO`), which a copy through another client easily flattens.

## What Changes

- A new import format `ics`: an iCalendar file is detected by its `BEGIN:VCALENDAR` and read through the same `VTODO` mapping CalDAV uses (`internal/caldav`): title, notes, due date and time, deadline, start date, priority, completion and its time, created time, categories as labels, repeat rules (`RRULE`), alarms (`VALARM`) as reminders, the estimate and OpenTodo's own `X-OPENTODO-*` properties.
- Subtasks: `RELATED-TO;RELTYPE=PARENT` (and `RELATED-TO` without `RELTYPE`, which RFC 5545 defines as a parent) makes the task a subtask of the task with that `UID`, wherever that task appears in the file. `RELTYPE=DEPENDS-ON` becomes "blocked by".
- One file is one project named after the calendar's `X-WR-CALNAME`; a file without one goes to the Inbox or the chosen target project.
- A component the mapping cannot read is one row in error with the reason; the rest of the file still imports. Events, journal entries and other components are reported in a file note and not imported.
- Each task keeps its `UID` as the origin `{kind: "import", provider: "ics", id: <UID>}`, which also makes a second import of the same file skip the tasks it already created.
- The import screen lists the format as "iCalendar tasks (.ics)" and its file picker accepts `.ics` files; `ot import --format ics` works the same way.

Not **BREAKING**: no new op field, route, setting or environment variable. All writes are the import job's ordinary operations (device `import`), with undo like every other import.

## Out of scope

- Events (`VEVENT`): an `.ics` of a calendar is not imported as tasks; calendar feeds (`calendar-feeds`) show such calendars.
- Several calendars in one file (Nextcloud exports one list per file; a file is one project).
- Per-occurrence changes of a repeating task (`RECURRENCE-ID` overrides) and skipped occurrences (`EXDATE`): the series is imported, the overrides and exceptions are reported as a warning.
- `PERCENT-COMPLETE` below 100, `CLASS`, `LOCATION`, `URL`, attendees and other properties the task model does not hold: they are not kept (CalDAV keeps them as client data on its own objects; an imported task is a new task).
- Exporting a project as `.ics` (the CalDAV server and the calendar feed already serve tasks as iCalendar).

## Roadmap

Advances ROADMAP.md "JSON / CSV import, including export files from popular commercial task apps" (`data-import`), and closes issue #1201.

## Capabilities

### New Capabilities

### Modified Capabilities
- `data-import`: a new accepted format `ics` and its mapping, including subtasks.

## Impact

`internal/importer` (a new profile `profile_ics.go` beside the others, fixtures under `internal/importer/testdata/ics/`), `internal/origin` and `web/src/lib/taskOrigin.ts` (the provider `ics` reads as "iCalendar"), `internal/cli/cmd_import.go` (the format list), `web/src/lib/types.ts` and `web/src/app/ImportScreen.tsx` (format label and `accept`), `docs/import.md`. No dependency; the profile reuses `internal/caldav`, already linked into the server.
