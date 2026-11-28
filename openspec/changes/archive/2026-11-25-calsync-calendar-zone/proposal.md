# Proposal

## Why

GitHub issue [#2084](https://github.com/OpenTodoApp/OpenTodo/issues/2084): a task at 13:00 synced to a CalDAV calendar in Europe/Amsterdam shows at 14:00 in the provider's web client. Calendar sync writes a task without a time zone of its own as a floating time (`DTSTART:20261126T130000`). Android and Evolution read that as local time, as intended, but the provider's web client reads it as UTC, so the event is an hour late in winter and two in summer. The user's other events name their zone and show correctly.

## What Changes

- A floating timed task is written at its wall-clock time in the target calendar's time zone (the `calendar-timezone` that discovery already reads), with that zone's TZID and VTIMEZONE: `DTSTART;TZID=Europe/Amsterdam:20261126T130000`. Every client then shows 13:00.
- Reading the event back keeps the task floating at the event's wall time, as it already does for a zoned event of a floating task, so nothing changes in OpenTodo and the next cycle writes nothing.
- An event written floating before is written again once, in the calendar's zone; so is one whose calendar's zone changes.
- A calendar that names no time zone keeps floating times. Zoned tasks, date-only tasks, spans, Microsoft connections (already written in the mailbox zone) and the subscribed task feed are unchanged.

No op, field, route or environment variable change; not **BREAKING**.

## Out of scope

- Writing floating tasks in a zone in the subscribed task feed (`calendar-feeds`), which has no calendar zone to use.
- Showing the calendar's time zone on the connection card.

ROADMAP.md: none (a fix from an issue).

## Capabilities

### Modified Capabilities

- `calendar-sync`: a floating timed task is written in the calendar's time zone when the calendar names one.
