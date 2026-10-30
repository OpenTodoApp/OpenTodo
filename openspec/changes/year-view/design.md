# Design: year-view

## Context
The Calendar destination has four modes (Day, Week, Month, Plan), remembered per device in `web/src/lib/calendarMode.ts` and switched by `CalendarRangeSwitch` in each view's page header; switching keeps the anchor date. Month (`month-view`, `web/src/app/MonthView.tsx`) draws the weeks of one month with task rows per cell, a capacity line, "+N more", drag and a keyboard grid; below 640 px it shows counts and lists the focused day under the grid. Plan has a per-device span (7, 14, 21 days) chosen from its page menu, which is the precedent for "Months shown". `series-occurrences` (this milestone) adds projected occurrences to Day, Week and Month; `multi-day-tasks` (this milestone) draws spans across days.

## Goals / Non-Goals

**Goals:**
- Look ahead a few months in the familiar Month, and across a whole year at a glance.
- Navigate from the year to a day with the keyboard alone.
- Stay fast at 10,000 tasks and on phones.

**Non-Goals:**
- Editing from the Year view; counting events or deadlines (see proposal).

## Decisions

### D1. Several months are stacked full Month grids
With 2, 3 or 6 months, Month renders consecutive month grids one below the other inside the content column's one scroller, each headed by its month name, with the same cells, rows, capacity line, "+N more", drag and keyboard as one month. Days outside each month are empty cells (no date, no tasks), so a day and its tasks appear once and a drag never has two targets. The page title is the range ("Nov 2026 – Jan 2027").

Alternatives considered:
- **A continuous week list (Google's "custom weeks").** No month edges and no duplicates, but the issue asks for months, and month boundaries are how people plan terms and quarters.
- **Compact grids for 3 and 6 months.** Fits on one screen, but then Month has two different cell designs; the Year view already is the compact one.
- **Side by side months on wide screens.** Halves cell width at 1280 px, making titles unreadable; rejected.

`[` and `]` move by one month, not by the shown count, so the user can step a window forward and keep context; `t` brings the current month first. The choice lives in Month's page menu as "Months shown: 1, 2, 3, 6", stored per device (`ot.calendar.months`), 1 by default, like Plan's span. Below 640 px the setting is ignored and one month is shown (D5).

### D2. Year is a fifth mode of the Calendar destination
`year` joins `CalendarMode` and the switch (Day | Week | Month | Plan | Year), with `g y` (free in the registry) and an address `{ view: 'year', date }` that keeps the anchor date when switching (Year from 18 November 2026 shows 2026; Month from there shows November). The sidebar's Calendar item opens Year when it was the last mode. The planning list (`time-blocking`) is not offered in Year, since nothing is placed there; when it is open and the user switches to Year, the slot keeps it (it stays remembered) but Year does not react to `s`.

Alternative: "12 months" as a Month option. Rejected: twelve full grids are a long scroll and lose the at-a-glance purpose; Year needs its own compact cell.

### D3. Compact grids and the density mark
Twelve month grids laid out 4 × 3 from 1024 px of content width, 3 × 4 from 768 px, 2 columns below 768 px. Each month has its name as a link to Month, weekday initials on the user's first day of the week, and day cells with the date numeral. Each day cell carries:
- a **density mark**: a fill in four steps (none for 0, then 1–2, 3–5, 6 or more) from the sequential chart ramp tokens (`chartRamp`), never the accent (the accent marks selection and state per `design-system`); steps also differ by a numeral weight so they do not depend on colour alone, and the count is in the cell's accessible name;
- an **over-capacity mark**: a small dot in the danger tone when the estimates counted for the day exceed the device's day length (the same sum as Month's capacity line);
- **today** marked as in Month, and days before today in the faint tone.

The counts are fixed thresholds, not relative to the user's busiest day, so a mark means the same every year and on every device.

Alternatives considered: a number in each cell (noisy at twelve months, unreadable at 2 columns); a heat-map relative to the maximum (one huge day flattens the rest).

### D4. What counts
A day's count is: the open tasks due that day in the viewer's zone, with the Month's selection (no deleted, completed or archived-project tasks); plus the projected occurrences of recurring tasks on that day, while the calendar's "Show repeating occurrences" switch is on (`series-occurrences`); plus every day a task drawn as a span covers (`multi-day-tasks`), each counting once per covered day. A series' current occurrence counts once (as a task), its projections after it. Estimates for the capacity dot follow the same sources and Month's rule (a span's estimate on its due day only). Subscribed calendar events and deadlines do not count: the Year answers "how much have I planned", and the events and deadline marks belong with `calendar-clarity`'s follow-ups. If either series or span change has not landed when this ships, that source simply contributes nothing; the requirement is written against their specs.

### D5. Keyboard and pointer
The twelve grids form one keyboard grid with one tab stop (roving focus) after the header and the month name links: Left/Right a day, Up/Down a week, crossing month edges; Page Up/Page Down the same day in the previous/next month (clamped to the month's length); Home/End the first/last day of the focused month; `[` and `]` the previous/next year keeping the day; `t` today; Enter opens Day on the focused day; Escape returns focus to the page header. Pointer: clicking a day opens Day; clicking a month name opens Month. The Tooltip primitive shows, on hover or focus, "4 tasks" and up to three titles, then "+1 more". Shortcuts are registered in the shortcut registry with the `year` view scope; `g y` in the go section.

### D6. Phone layout
Below 640 px:
- **Month** shows one month whatever "Months shown" says (the setting is kept for wider screens), with its existing count cells and focused-day list, so the list under the grid has one grid to belong to.
- **Year** shows the months in two columns; day cells are too small for 48 px targets, so the month is the touch target: tapping anywhere on a month opens Month on that month, where days are tappable. Density marks stay visible. Nothing overflows horizontally at 360 px, in German and French month names.

### D7. Performance
One pass over the local tasks buckets them by viewer-zone date into a `Map<date, {count, minutes, titles[≤3]}>` for the shown year; projections are counted by walking each series once over the year with the shared calculator (no row objects), capped by the existing per-series guard; spans add one per covered day. Day cells are plain elements without per-cell hooks or components with state. Budget: the Year view renders within 100 ms for 10,000 open tasks and 50 daily series on the CI runner, checked by a perf test in the style of `e2eeMigration.perf.test.ts`; changing year recomputes only the bucket map.

### D8. Progressive disclosure and interface budget
Simple-list users see nothing new: the change lives inside the Calendar destination, in its existing range switch and Month's page menu. No new sidebar destination (Year is a mode of Calendar), no new chrome row (the switch gains a segment; below 768 px the switch is in the bar's overflow as today), one scroll region (the content column), the visible task properties unchanged (Year shows no task rows). New shortcuts: `g y` and the Year grid keys, scoped to the Year view, without conflicts.

## Risks / Trade-offs
- [The switch grows to five segments and gets wide in long languages] → the switch already moves to the overflow menu on narrow headers; the layout check at 360 px in German and French covers it.
- [Six stacked months of full grids is a long page] → it is opt-in per device; Year is the compact answer.
- [Daily recurring tasks make every day look busy] → they count like any task the user will do that day; hiding projections in the calendar (`series-occurrences`) also removes them from the density.
- [Thresholds feel wrong for very busy users] → fixed steps keep the meaning stable; a follow-up could make them follow the day length if feedback asks.

## Migration Plan
No data migration. A device without a stored months count shows one month; a stored mode of `year` on an older client falls back to the default mode through the enum reader.
