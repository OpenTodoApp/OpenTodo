# Design

## D1. One definition of event minutes

The Plan's `eventMinutes(events, date, zone)` (`web/src/lib/plan.ts`, spec `planner-view` "Event minutes in the capacity") is the only definition: busy timed occurrences of enabled subscriptions shown on this device, intervals merged so overlaps count once, clipped to the day in the viewer's zone, all-day and free (transparent) occurrences excluded. Day, Week and Month call the same function on the same cached events the grid draws. Connected calendars (`calendar-sync`) are stored as managed subscriptions, so their events count the same way.

Alternative considered: subtract meetings from the day length (`4h 15m / 5h 30m`). Rejected: the denominator would change from day to day and stop lining up across columns, and the Plan already shows the sum form. One form in all four views.

## D2. A per-device option next to Day length, off by default

The option joins the grid preferences in the device's `calendar.grid` meta value as `countEvents: boolean` (missing or invalid reads as `false`). Day length, start and end hours are per device because a laptop at work and a phone at home plan different days; whether meetings count follows the same reasoning, and keeping it beside Day length keeps one place to understand the number.

Alternatives considered:
- A synced `user_prefs` field. Rejected for consistency with the day length it modifies; a synced option compared against a per-device length would give different answers on two devices anyway.
- On by default. Rejected by the anti-roadmap (calm by default) and because the current behaviour is spec'd and documented; users who never subscribed a calendar would not notice, but users with a busy calendar would see every day turn amber after an update.

Progressive disclosure: the row is shown in Settings › Calendar only while the device knows a subscription (the condition Day and Week use for their Calendars toggle). Simple-list users, and anyone without a calendar, see nothing new.

## D3. Two over states, two tones

`dayLoad` returns `overTasks` (tasks alone exceed the day length) and `overWithEvents` (tasks plus counted event minutes exceed it, tasks alone do not). The line uses:
- the muted tone at rest, as today;
- the danger tone and "Over capacity" for `overTasks`, as today;
- the warning tone (`--color-warning`, amber, already in the tokens) and "Over with meetings" for `overWithEvents`.

The words carry the meaning, never the colour alone, and the line's accessible name includes them. Red keeps meaning "you planned more work than the day holds"; amber means "your tasks fit, but not around your meetings", which is the guardrail the research asks for without alarming.

Alternative: one danger state for any overflow. Rejected: it would hide the difference between a plan that cannot fit and one that only collides with meetings.

## D4. What is counted is what is drawn

When the toolbar's **Calendars** toggle hides events on this device, the grid draws none, so none count and the line is exactly today's. A disabled subscription's events are neither drawn nor counted. A day outside the cache while offline counts zero and the tooltip adds "Calendars unavailable offline for this day", the Plan's wording.

## D5. Month cells

A Month cell shows the line only when its tasks carry estimates (spec `month-view` "Cell contents"). With the option on, a cell also shows it when the day has counted event minutes, so a meeting-only day reads `3h / 8h`. On a phone the Month shows counts instead of titles and no capacity line, unchanged.

## D6. Data model, size, budget

No op field, no server change, no dependency, so no effect on image size or memory. Interface budget (docs/interface-guide.md): the capacity line already exists in each column header and cell; no row of chrome, no task property, no sidebar destination, no scroll region and no shortcut is added. One Settings row is added to an existing section.

## D7. Edge cases

- Events across midnight count on both days (D1).
- Zoned events convert to the viewer's zone; tasks fixed to a zone already do.
- Encrypted accounts: event titles are not read; only start, end and transparency, which the cache holds in clear on the device.
- Shared projects and viewers: capacity counts the open tasks the column shows, unchanged; meetings are personal to the device's subscriptions.
- Changing the option re-renders the open view at once; nothing is written.
