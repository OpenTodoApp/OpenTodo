# calendar-feeds: implementation notes

## Smoke test (2026-10-15, task 8.1)

Ran `./bin/opentodo` on 127.0.0.1:18080 with a throwaway data directory, `OPENTODO_CALENDAR_FEEDS=true` (first start) and `OPENTODO_WEBHOOKS_ALLOW_PRIVATE=true`. The subscribed calendar was a hand-written `.ics` served from `127.0.0.1:18099`. It held a weekly `TZID=Europe/Berlin` meeting with `COUNT=6`, a two-day all-day event, and a `TRANSP:TRANSPARENT` event at 13:00 UTC. The browser checks used headless Chromium in `Europe/Berlin`.

- Subscribing fetched the calendar at once: 8 occurrences, the calendar's own name taken from `X-WR-CALNAME`, no warnings.
- `GET /events` returned the meeting at 10:00 Europe/Berlin both before and after the DST change on 2026-10-25 (Oct 23 and Oct 30), the all-day event as `{date}` only, and the free flag.
- Week view of 2026-10-16:
  - The meeting (10:00–11:00) and a 45-minute task at 10:30 are side by side, and both carry the overlap marker.
  - The day header reads `45m / 8h`, so the meeting does not count.
  - The free event is an outline at 15:00 local time.
  - Tab plus Enter on the meeting opens the popover (summary, time, location, calendar), and Escape closes it.
  - Turning **Calendars** off hides the events, and they stay hidden after a reload.
- Task feed:
  - **Create feed URL** returned an `otfeed_` address. Its `.ics` held `DTSTART:20261016T103000` / `DTEND:20261016T111500` for the 45-minute task, and an all-day `VALUE=DATE` event for a date-only task.
  - After a rotate, the old address answered 404.
- The Settings panel showed the owner switch, the row "Refreshed 4 min ago" and the feed state.

Not done here: subscribing to real Google Calendar or Outlook addresses, and subscribing to the feed from Google Calendar or Apple Calendar. This machine has no accounts for them, and Google needs a public https address. The parser and expander tests use recorded-style fixtures from those services (`internal/calfeed/testdata/`).

## Decisions while implementing

- Event blocks are `button`s inside the day column and stop `pointerdown` from reaching it, so a drag can never start on one. The column itself remains a drop target, so a task can still be dropped on a time that has an event (that is an overlap, which the spec allows).
- Overflowed events (behind "+N") are listed read-only in the overflow list.
- The panel reuses the device's cached subscriptions while offline, so its list is the one from the last event refresh.
- `web/src/ui/icons/site-icons.json`: dropped six icons that ux-overhaul made app icons (`book-open`, `briefcase`, `heart`, `keyboard`, `plane`, `star`). This had broken `make coolify-check` on main.
