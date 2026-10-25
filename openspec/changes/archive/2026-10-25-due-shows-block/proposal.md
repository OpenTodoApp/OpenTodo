# A timed due with an estimate reads as its block

## Why

Issue #356: after placing a task on the calendar, its details showed "Do: Today 12:00" and, two rows below, "Start: Set a start". The calendar had drawn a block from 12:00 to 13:45, but the details showed neither the end nor anything called a start time, so the reporter could not tell when the task was planned. "Start" in the details is a different property (the date from which a task is available), which made it worse.

## What Changes

- The Do row of the task page, the facet line in the panel and the phone's facts card read a timed due with an estimate as the calendar's block: "Today 12:00–13:30", with the zone's city when the time is fixed to a zone. Without an estimate they read as before ("Today 12:00").
- The Start row is unchanged; the docs say that the planned time is the Do row and that Start is the date a task becomes available.

Not **BREAKING**: no op, API or storage change.

## Impact

- `web/src/lib/facets.ts` (`blockEnd`), test `web/src/lib/facets.test.ts`.
- `docs/place-tasks-on-the-calendar.md`, CHANGELOG.
