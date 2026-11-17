# Proposal

## Why

GitHub issue [#1481](https://github.com/OpenTodoApp/OpenTodo/issues/1481): a Google Calendar's secret iCal address cannot be subscribed to as a calendar feed. The fetch fails with `too_large`: Google's export holds the calendar's whole history and is about 10 MB, while a feed is cut off at 2 MB before it is read. Yet a feed only keeps the events from two months back to a year ahead, so almost all of those 10 MB are thrown away after parsing. The 2 MB cap was there to bound memory, because the whole body, its lines and its tree were held at once.

## What Changes

- **A calendar is read as it arrives.** The server reads a feed one event at a time and keeps only the events that can reach the stored window (an event in it, a series whose rule still reaches it, an override that changes an occurrence in it). Memory holds the event being read and the kept ones, not the body.
- **New limits.** A feed may be up to 32 MB as downloaded (was 2 MB). One event may hold at most 1 MB and 5,000 content lines (as a CalDAV resource), and the events kept from a feed at most 4 MB; past that the rest are left out with a warning. The whole-calendar limit of 200,000 content lines goes: reading is linear in the bytes, which the 32 MB and the 20-second timeout bound.
- **The status says what to do.** A feed over 32 MB still fails with `too_large`; the Calendar feeds screen now says the calendar is larger than 32 MB and suggests connecting it with calendar sync, which reads only the events it needs.

Out of scope: the occurrence window and the 5,000 stored occurrences, the expansion budget, calendar sync's own limits, the 20-second timeout, incremental or ranged downloads.

Advances the ROADMAP item 8 "Calendar feeds, both ways" (`calendar-feeds`): Google Calendar's secret address is the most common calendar people paste.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `calendar-feeds`: "Scheduled fetching" reads a calendar as it arrives with a 32 MB download limit and keeps only the events near the window.

## Impact

- `internal/caldav/stream.go` (new: `Stream`, the shared tree builder), `internal/caldav/ical.go` (`ParseWithLimits` uses the builder), `internal/calfeed/vevent.go` (`ReadCalendar`, limits), `internal/calfeed/window.go` (new: `Reaches`), `internal/calfeed/fetch.go`.
- `web/src/app/CalendarFeedsPanel.tsx` and one new string in every catalogue.
- `docs/other-calendars.md`, `docs/security/threat-model.md`.
- No data, op, route or setting changes. No dependency; binary size unchanged within a few KB.
