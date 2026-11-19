# Proposal

## Why

GitHub issue [#1573](https://github.com/OpenTodoApp/OpenTodo/issues/1573): a Google Calendar connection stops with `http_409`, and making the connection again does not help. A connection made again (or a database restored from a backup) no longer knows the events it wrote, so it creates each task's event at `<task-id>.ics` again. A CalDAV server answers 412 to that creation because of `If-None-Match: *`, and the cycle then takes the existing event over. Google's CalDAV honours no `If*` header but `If-Match` ([its guide](https://developers.google.com/workspace/calendar/caldav/v2/guide)) and answers 409, which the cycle treated as a failure: the whole cycle ended there, every time.

## What Changes

- **A creation answered 409 takes the existing event over**, exactly as one answered 412: the cycle reads the event's ETag and replaces the event with the task's.

Out of scope: a calendar that refuses the replacement too (the cycle still fails with `http_<status>`), Microsoft connections (Graph has no such answer to a creation), one refused event no longer ending the cycle.

A bug fix; no ROADMAP item.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `calendar-sync`: a new requirement, "An event that already exists is taken over".

## Impact

- `internal/calsync/cycle.go` (one condition), `internal/calsync/calsynctest/server.go` (a test server mode that answers like Google).
- No data, op, route, setting or string changes. No dependency; binary size unchanged.
