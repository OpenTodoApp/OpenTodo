# Proposal

## Why

A Calendar sync connection writes all its tasks into one target calendar. People who want one calendar per project add a connection per project with a "Tasks from: Only this project" scope, which works but takes a connection each and does not scale past a few projects (issue #1160).

## What Changes

- **Calendars per project, in one connection.** A connection's **Calendars** dialog gets **Write to: One calendar** (today) **or A calendar per project**. With the second, each of the connection's projects (and the Inbox) is matched to one of the account's writable calendars, chosen from a list; unmatched projects go to the connection's target calendar. Sub-projects follow their project unless matched themselves.
- **Moving a task to another project moves its event** to that project's calendar (a delete and a create, as a move between calendars is in CalDAV).
- **An event moved to another calendar in the calendar app** moves the task to that calendar's project when the calendar is matched to exactly one project; otherwise it stays where it was.
- Everything else (times, titles, notes, scope, conflicts, limits) works as today.

## Capabilities

### Modified Capabilities

- `calendar-sync`: per-project target calendars of a connection.

## Impact

`internal/store/migrations` (`calsync_project_targets(connection_id, project_id, calendar_url)`), `internal/calsync` (the cycle pushes each task to its project's calendar, links remember the calendar, pulls read every matched calendar), routes for the mapping in `internal/httpapi/calsync*.go`, the Calendars dialog, docs (`docs/calendar-sync.md`).
