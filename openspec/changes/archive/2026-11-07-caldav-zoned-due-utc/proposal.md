## Why

Issue #1028: a task fixed to a time zone (`due.tz`, which tasks created through MCP often carry) showed in Apple Reminders at another time marked GMT, and its alarms fired at the wrong time. Floating times were right.

The due was served as `DUE;TZID=…` with a VTIMEZONE built as a one-year snapshot: a 1970 STANDARD observance, then the due year's transitions once, without RRULE. By RFC 5545 §3.6.5 the last observance then holds forever, so the definition is wrong for every other year and matches no copy of the zone a client has. Apple reads a VTIMEZONE by its definition (it accepts Outlook's `W. Europe Standard Time`); one it cannot match becomes a zone named after its GMT offset: the "GMT" of the report.

## What Changes

- A zoned due on a task that does not repeat is served as its instant in UTC (`DUE:20260710T070000Z`, RFC 5545 §3.3.5 form #2), without a VTIMEZONE. Every client reads the same instant; the alarms (relative to DUE) fire at the right moment.
- A zoned due on a repeating task keeps `TZID`, so its occurrences follow daylight saving time (§3.8.5.3), with a VTIMEZONE in the form Apple, Mozilla and Google write: one STANDARD and one DAYLIGHT observance with a yearly RRULE and a 1970 DTSTART, a single STANDARD for a zone without daylight saving time, before the VTODO. A zone whose transitions follow no yearly weekday rule gets one-off observances for five years. The calendar feed shares this definition.
- Inbound, a UTC time on a task fixed to another zone is read in that zone: the served instant echoed back writes nothing, another instant sets the wall time it falls on in the task's zone, keeping the zone.

Out of scope: MCP, REST and the app keep writing and reading `due.tz` as they do; floating and date-only dues are unchanged; a client that writes its own TZID still sets that zone. Not **BREAKING**: no op field, schema or environment variable changes. A fix of the CalDAV mapping (`caldav`, ROADMAP); no new ROADMAP row.

## Capabilities

### New Capabilities

### Modified Capabilities
- `caldav-sync`: the served form of a zoned due and the reading of a UTC time sent back.

## Impact

`internal/caldav/vtodo.go` (`servedDue`, the UTC form in `dueProp`), `internal/caldav/vtimezone.go` (the zone definition, shared with `internal/calfeed`), `internal/caldav/decode.go` (`Inbound.KeepZone`), `internal/httpapi/davroutes/write.go` (the update reads UTC times in the task's zone). Docs: `docs/caldav.md`. No new dependency; no effect on binary size or memory.
