# Proposal

## Why

A rule for a weekday of one month every year, like Todoist's "every last Sunday in March" (the clocks change, Thanksgiving, a birthday party on a weekday), could not be written. `every year` repeats on the same date, which falls on another weekday each year, and `every last sunday` repeats every month (discussion #1228, issue #1239).

## What Changes

- **A new rule form:** `every <ordinal> <weekday> of <month>`, with `of` or `in`, full month names or three letters, stored as `every last sunday of march`. It repeats once a year, in that month, with the usual `until` and `for N times` ends.
- **Quick add** in every shipped language reads it with the words its one-off dates use ("every last Sunday in March", "jeden letzten Sonntag im März"); English accepts "in" as well as "of".
- **CalDAV and calendar feeds** map it to `FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU`, both ways; the Todoist importer reads it.
- **Older devices:** a 1.0 device cannot read the form (no 1.0 rule gives these dates), so it shows the rule as text and completing the task there ends the series, as for `every 2 weeks on saturday`; documented in docs/stability.md.

## Capabilities

### Modified Capabilities

- `recurring-tasks`: Rule grammar.

## Impact

`web/src/lib/recurrence.ts`, `web/src/lib/habits.ts`, `web/src/lib/nlp/recurrence.ts` and the English vocabulary; `internal/recurrence` (grammar, RRULE, the 1.0 check), `internal/quickadd`; shared vectors (recurrence, quick add, Todoist dates); docs.
