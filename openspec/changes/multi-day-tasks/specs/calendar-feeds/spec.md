## ADDED Requirements

### Requirement: Spans in the task feed
In the personal task feed, a task drawn as a span (OpenSpec `multi-day-tasks`) SHALL be an all-day event with `DTSTART;VALUE=DATE` its start date and `DTEND;VALUE=DATE` the day after its do-on date, and a recurring span SHALL keep that length on every occurrence the `RRULE` produces.

#### Scenario: Span in the feed
- **WHEN** a task is a span from 2026-11-03 to 2026-11-05 and a calendar app fetches the feed
- **THEN** the feed holds an all-day event with `DTSTART;VALUE=DATE:20261103` and `DTEND;VALUE=DATE:20261106`

#### Scenario: Not a span
- **WHEN** a task has the start `2026-11-03`, is due `2026-11-05` without a time, and is not a span
- **THEN** the feed holds an all-day event on 2026-11-05 only, as before
