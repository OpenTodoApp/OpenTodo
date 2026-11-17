# Design

## Context

`Fetcher.Fetch` read the body whole (`io.ReadAll` with a 2 MB limit), `caldav.ParseWithLimits` unfolded every line and built the whole component tree, and `ExpandContext` then kept the occurrences overlapping `StoreWindow` (62 days back, 400 days ahead). Peak memory was several times the body. Google's secret address exports the whole history of a calendar; a family calendar of ten years is about 10 MB (#1481), of which a few kilobytes reach the window.

## Goals / Non-Goals

Goals: a 10 MB Google export imports; memory does not grow with the download; the stored result is the same as before for any calendar that fit.

Non-goals: a larger occurrence window, ranged or incremental downloads, a streaming expansion.

## Decisions

### D1 Stream the body, one child of the VCALENDAR at a time

`caldav.Stream(r, limits, child)` reads physical lines with a `bufio.Scanner` (CRLF, LF or a lone CR, like `Unfold`), unfolds them, and feeds logical lines to the same tree builder `ParseWithLimits` now uses, so both accept and refuse the same data (a test compares them over every fixture). Each finished child of the root (a `VEVENT`, a `VTIMEZONE`) is handed to the callback with the root's properties read so far, and is not kept. `calfeed.ReadCalendar` parses each `VEVENT` and keeps it when a filter accepts it; `ParseCalendar` (calendar sync's objects, tests) is `ReadCalendar` over bytes with no filter. Calendar properties apply to the events after them: RFC 5545 puts them before the components, and every published calendar seen does.

Alternative: keep `io.ReadAll` with a 16 MB cap and filter after parsing. Rejected: memory would still be a multiple of 16 MB, per fetch, and two fetches run at once.

### D2 Keep the events that can reach the window

`Reaches(ev, window)` over the window widened by 3 days (Expand applies the exact window afterwards):

- an event whose own time, or an `RDATE` occurrence, overlaps it;
- a series (`RRULE`) that starts before the window's end and has no `UNTIL`, or an `UNTIL` plus one event length that is not before the window; `COUNT` is not evaluated (kept), and a rule Expand does not read is kept (it shows the first occurrence, and a cancelled master still hides its overrides);
- an override (`RECURRENCE-ID`) whose new time overlaps the window, or whose replaced instance is in it (it moves an occurrence out), and every `RANGE=THISANDFUTURE` override.

A series from 2015 without an end is kept and expands into the window as before; a past single event or a series that ended in 2019 is dropped while it is read. An override is kept whether or not its master is.

Accepted difference: a calendar that publishes two masters of one UID (only the higher `SEQUENCE` is used) where only the older one is near the window now shows that one. Published feeds carry one master per UID.

### D3 Limits

| Limit | Value | Why |
| --- | --- | --- |
| Download | 32 MB (`MaxFeedBytes`) | Three times the 10 MB of #1481. It bounds time only: about 13 Mbit/s within the 20-second timeout, and parsing 32 MB takes well under a second. More than that answers `too_large` |
| One event or other component | 1 MB and 5,000 content lines | The bounds of one CalDAV resource; a component over them makes the calendar `invalid_calendar` |
| A content line | 64 KB | Unchanged (`caldav.MaxLineBytes`) |
| Kept events | 4 MB (`MaxKeptBytes`, text plus 256 bytes each) | Twice the old whole cap; past it the rest are left out with a warning |
| Occurrences, expansion | 5,000, 500,000 units, 5 s | Unchanged |

The whole-calendar limit of 200,000 content lines is dropped: it bounded the tree, which is now one event; the work of reading is linear in the bytes.

Memory: the scanner's buffer (up to 64 KB), one event (at most 1 MB), the kept events (at most 4 MB). A test reads a generated 10 MB calendar and measures live heap growth during the read in kilobytes (about 70 KB). Before, a 2 MB calendar held the body, its lines and its tree.

### D4 Wording

The stored reason stays `too_large` (API and backoff unchanged). The Calendar feeds screen words it: "the calendar is larger than 32 MB; connect it with calendar sync instead". Calendar sync (CalDAV, Google, Microsoft) reads a window of events, not the whole export.

## Data model

None. No op, field, table or route changes.

## Size

No dependency. Server binary within a few KB. Runtime memory per fetch goes down for every calendar.

## Risks

- A feed whose calendar properties come after its events loses its default zone for the events before them (floating times stay floating). Such a feed is not valid iCalendar.
- The interface: one status line changes text; no chrome, property, scroll region or shortcut.
