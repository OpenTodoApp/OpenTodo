# Proposal: year-view

## Why
The calendar stops at one month. People planning a term, a quarter of launches, holidays or a training block want to see further ahead: where the busy weeks are, which month is still empty, when a recurring commitment lands. Issue #557 (split from #427) asks for a Month that shows 1, 2, 3 or 6 months, and a Year view of twelve compact month grids with a density mark per day, a day opening the Day view, with keyboard and phone layouts designed. The research places OpenTodo against planners and calendar-first apps (Sunsama, Akiflow, Morgen, TickTick's year view) and ranks the integrated calendar as table stakes; Pullein's Time Sector system asks to plan by month and quarter, which needs a view at that scale.

Roadmap: milestone 0.19 "Series and time", item `year-view`.

## What Changes
- **Several months.** The Month view can show 1, 2, 3 or 6 consecutive months, chosen per device from the page's menu ("Months shown"), 1 by default. Months are stacked as full month grids, each with its name; days outside a month are left empty so no day appears twice. `[` and `]` move by one month; `t` returns to the current month first.
- **Year view.** A new mode of the Calendar destination, `Year`, reachable by `g y`, from the Day | Week | Month | Plan | Year switch and from the sidebar's Calendar item when it was last used. It shows the twelve months of a year as compact grids. Each day carries a density mark in four steps from the number of open tasks on it, and a small over-capacity mark when its estimates exceed the device's day length. Hovering or focusing a day names its count and up to three titles. A day opens the Day view; a month's name opens the Month.
- **What counts.** Density counts the open tasks due that day in the viewer's zone (the Month's selection), the projected occurrences of recurring tasks while the calendar's "Show repeating occurrences" switch is on (`series-occurrences`), and each day a multi-day task covers (`multi-day-tasks`). Subscribed calendar events and deadlines are not counted.
- **Keyboard.** The Year grid is one keyboard grid across the twelve months: arrows move by a day and a week across month edges, `Page Up`/`Page Down` by a month, `[`/`]` by a year, `t` to today, Enter opens the focused day in Day view.
- **Phone.** Below 640 px Month shows one month whatever the setting, and Year shows the months in two columns; a month (not a day) is the touch target and opens the Month.
- Everything renders from local data, offline; nothing is written and nothing syncs.

## Capabilities

### New Capabilities
- `year-view`: the Year mode, its density marks, keyboard model, phone layout and performance budget.

### Modified Capabilities
- `month-view`: "Month grid" (1, 2, 3 or 6 months, and Year in the switch), "Keyboard in the month" (moving across stacked months), "Month on narrow screens" (one month below 640 px).

## Out of scope
- Counting subscribed calendar events or deadlines in the density (a follow-up once `calendar-clarity` draws deadlines on the calendar).
- Dragging tasks in the Year view: it is for reading and navigating; moves happen in Day, Week, Month and Plan.
- A continuous scrolling month view, a quarter view, or a synced preference for the months shown.
- Time horizons (`time-sectors`, 0.21), which may later show their own marks here.

## Impact
- **Data model, sync, op schema, E2EE:** none. The months shown and the last calendar mode are per-device preferences in device storage, never synced. Encrypted accounts work unchanged: the view reads decrypted local rows and shows only counts and titles the device already holds.
- **API, CLI, MCP, CalDAV, vault:** none; this is a web view of local data. No route is added.
- **Performance:** the Year view buckets tasks by day once per render and counts projections without building rows; budget in design D6, checked by a test at 10,000 tasks.
- **Bundle size:** no dependency; estimated +5 KB gzipped (Year view, compact month grid, keyboard grid), loaded with the Calendar chunk.

Fixes #557
Relates to #427
