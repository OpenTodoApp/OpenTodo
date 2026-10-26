# Design

## D1. A synced preference of the account

The option sits with the other choices about Today's head: the briefing (`user_prefs.briefing`) is a synced account preference, written as an op, so the agenda option is one too. A new additive string field `user_prefs.today_events` holds "shown" or "hidden"; empty or anything else reads as hidden and is never rewritten, so a newer client's value stays. It is a setting, not content: not encrypted, no activity event. Data model impact: one additive field in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the `user_prefs` defaults in `web/src/lib/ops.ts`. Convergence is per field, last writer wins, like every preference. No dependency, so no change to image size or memory.

## D2. In the day-page menu, beside the briefing

Today has no display panel; its one display choice so far, the briefing, is a pair of items in the header's More actions menu ("Show briefing" / "Hide briefing"). The agenda option joins it there with the same wording pattern, "Show calendar events" / "Hide calendar events", and the `calendar-range` icon of the calendar's own Calendars toggle. On a phone the same menu is the bar's overflow, so the option is reachable at every width without a new control. Upcoming does not offer it.

## D3. Offered only where the calendar would offer events

Day and Week show their **Calendars** toggle only when the device knows at least one subscription (`useCalendarFeeds().subs.length > 0`). Today uses the same condition, and hides the item otherwise rather than showing it disabled, as the calendar toolbar does. With feeds off on the server the events route answers 404 and the device learns of no subscription, so the item never appears. A device that cached subscriptions before the owner turned feeds off keeps them, as Day and Week do today; dropping that cache is out of scope.

Today asks for today's range when it opens and when the logical day changes, like a calendar view does on navigation, but only while the option is on or the device already knows a subscription, so a server without feeds sees no request from a device that never had a calendar. The call is served from the cache while it is fresh (10 minutes), and a failed fetch (offline, feeds off, an older server) is not repeated by Today for 10 minutes on that device.

A device learns about its first subscription from Day, Week or the Plan, from the synced option being on, or from Settings → Calendar feeds: after a subscription is added, changed or removed, the panel already refreshes the cached window; without a window it did nothing, and now it fetches today's range instead (`refreshAfterChange` in `lib/calendarFeeds.ts`), so the Today item appears right after the first calendar is added on that device.

## D4. Independent of the device's Calendars toggle; disabled calendars never

The per-device **Calendars** toggle is a way to unclutter the grid while placing tasks; the Today option is the account's choice to see the day's appointments. Coupling them would make the option silently do nothing on a device where the grid toggle is off. So Today ignores that toggle. Disabled subscriptions are never shown: the server leaves their occurrences out, and the agenda also filters on the cached subscription's `enabled` flag, like the grid.

## D5. Content of the list, before its first group

The agenda is an opt-in block of the day's content, so it sits inside the list after the quick add and before the first group, scrolling with the tasks, not in the sticky header. A sticky head would pin a long agenda over the list on a busy day. `task-list-presentation` "Nothing between the header and the list" is amended to allow exactly this block, and only while the user turned it on and today has events. Interface budget (docs/interface-guide.md): no row of chrome is added (header and quick add stay the two), no task property changes, no sidebar destination, no new scroll region (the block is in the column's scroller), no new shortcut.

## D6. One compact block, the calendar's own shapes

- All-day and multi-day events covering today come first, as chips in one wrapping row, sorted as the all-day strip sorts them (`allDayEvents`).
- Timed events follow in start order (`eventBlocks` for the logical today in the viewer's zone, so zoned events convert and an event across midnight shows today's part), one row each: the time range, the summary, the calendar dot and the location when set, truncated on a narrow screen.
- Busy events use `ui-block ui-block--event` (sunken fill, hatched edge, calendar dot); free events the dashed outline in the calendar's hue, as in Day and Week.
- A timed event whose end is at or before the current minute of the logical today is dimmed by mixing (a new `.ui-event-past` rule: faint text, a mixed dot and outline), never by opacity, as the design system dims the past. The minute clock (`useNowMinutes`, moved out of `CalendarView.tsx` into `calendar/useNowMinutes.ts`) refreshes every minute.
- Each event is a button that toggles the same `Popover` with `EventDetails` that Day and Week use (`EventDetails` is exported from `CalendarEvents.tsx`). Its name starts with the visible text (WCAG 2.5.3), followed by hidden text with the location, calendar name, and "free" or "ended" where it applies. The block is a `section` named "Calendar events today".
- No events today: nothing renders, not even an empty block.

## D7. The freshness line

Under the agenda, `CalendarStatus` (the calendar toolbar's status line) says "Calendars as of <time>" when the cached window covering today is stale, or fresh but the device is offline. "Unavailable offline" never shows, since a day outside the cache has no events and so no block.

## D8. Phone, side panel, keyboard

The block is a column of full-width rows, so it fits 375 px; the time is tabular and never wraps, the summary and location truncate. With the side panel docked the list column narrows and the rows truncate the same way. Events are reached with Tab and opened with Enter or Space; j/k and the list shortcuts skip them, as they skip events in the calendar.
