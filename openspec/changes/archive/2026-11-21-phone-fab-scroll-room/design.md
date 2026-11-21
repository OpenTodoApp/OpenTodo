# Design

## Context

Below 768 px the shell draws the tab bar and, 12 px above it at the right, the add button (56 px). The content column (`#content`, the page's one scroller) has `padding-bottom: var(--add-room)` (4.75 rem: the button, its offset, an 8 px gap; `phone-v2` D2). A page is a block in that column, so whatever ends it sits above the room once the column is scrolled to its end. That is the list's mechanism, and it already serves every page that scrolls in the column: boards (their columns are sized, the page scrolls), the timeline, Month, Plan, Year, a project's calendar, dashboards, Notes.

The sweep: the built app, the layout check's seeded account, Chromium with touch at 360 × 740 and 390 × 844. Each screen and every vertical scroller inside it is scrolled to its end; then every control in the column is compared with the add button's box where it rests, clipped by the scrollers around it. "Room" is the padding at the end of the column (and of an inner scroller); "scrolls by" is how far the column scrolls.

| Screen | Add button | Before | After |
| --- | --- | --- | --- |
| Inbox, Today, Upcoming, Assigned, Completed, Someday, Anytime, Next, Waiting, a project (list), a label, a saved view, Process the Inbox, the Loop, Daily check, Monthly look, Labels, Views, Projects, Locations, a new filter | yes | room 76 px, clear | same |
| Board, Timeline, a project's Calendar, Dashboard, Month, Plan, Year, Notes | yes | room 76 px, clear | same |
| Day, Week | yes | page 76 px short: the grid ends 8 px above the button (478 px tall at 360 × 740, 582 at 390 × 844), no room in the grid, clear | the grid ends at the tab bar (554 and 658 px), 76 px room at the end of the grid, clear |
| Notes, Graph | yes | canvas 76 px short, zoom control 164 px above the tab bar | canvas to the tab bar, zoom control 88 px above it, clear of the button |
| Statistics, Assistant, Trash, Updates, Habits, Focus, Settings, Help, Import, Routines | no | room 76 px | no room |
| Weekly review | no | room 76 px; scrolls by 71 px at 360 px, by 0 at 390 | no room; does not scroll at either |

No screen had a control under the button at the end of its scroll, before or after, at either size; a task at 23:00 in Day and Week ends 8 px above the button. At 768 and 1280 px nothing changes: the column has no room, the Day grid ends at the frame's edge (measured after; the rules are all below 768 px).

## Goals / Non-Goals

**Goals:** one rule for the room; the room where the scroll ends; no room without the button; a check that keeps it.

**Non-Goals:** a button that moves; room in the middle of a scroll; the selection bar's or the toast's room.

## Decisions

### D1. The room follows the button

The shell sets `data-add-room` and the padding on the column while `phoneChrome && offersQuickAdd(route)`, the condition that renders the button. Before, it was `phoneChrome` alone, so a screen with the tab bar and no button kept the room.

### D2. A page that fills the column: `.page-fill` and `.add-room-end`

Day and Week and the notes graph are as tall as the column and scroll (or pan) inside themselves. A percentage height resolves against the column's content box, so the padding made them 76 px short. Two classes in `index.css`, next to `--add-room`:

- `.page-fill`: `height: 100%`; below 768 px under `#content[data-add-room]` its height is `100% + var(--add-room)` with the same negative bottom margin, so the page covers the column's padding and the column does not scroll.
- `.add-room-end`: under the same condition, `padding-bottom: var(--add-room)` on the page's own scroller.

The calendar's page and grid scroller take one each; the notes graph takes `.page-fill` and keeps its controls' existing lift (`--add-room` above the canvas's edge), which now puts them just above the button instead of twice as high.

Alternatives: no padding on the column for those routes (the shell would have to know which page scrolls itself, and the notes graph is a mode inside a route); a `:has()` on `#content` (refused since issue 1179: it restyled every list on every change); a padding per page (what the issue asks not to do). A board column or the timeline needs neither class: they are sized blocks in a page that scrolls in the column.

Blocks in the middle of the grid now pass under the button, as rows do in every list; the grid gains 76 px at every position.

### D3. The layout check

`addButtonRoom` in `scripts/ux-audit/measure.mjs`, run by `scripts/e2e-layout.mjs` on every screen at its phone widths (and a no-op from 768 px, where there is no button and no tab bar): the sweep's measure, plus a failure when a screen with the tab bar and no add button has padding at the end of the column. It joins `addButtonCovers`, which looks at the last task row and at fields only, and only in the column. Tested on fixtures in `measure.test.mjs`. Not a rule of the tour: the tour measures a screen as it opens, and this is about its end.

### Data model, size, interface budget

No data, op or setting. No dependency; the first load grows by two CSS rules and one condition. Chrome rows, row metadata, destinations and shortcuts are unchanged; the scroll regions are the same ones (the calendar grid stays the page's designated scroller, the column no longer scrolls under it).

## Risks / Trade-offs

- The add button now stands over the lower right of the Day and Week grid while it is not at its end. A block there is reached by scrolling, as a row is. The owner may prefer the old band under the grid.
- While tasks are selected the column's padding is 5 rem (the selection bar's rule), 4 px more than the room a `.page-fill` takes back. Neither the calendar nor the notes graph has the selection bar.
- A new page that fills the column must use the two classes; the layout check fails when its last control ends under the button.
