## Context

The sidebar is the one element that stays on every page beside a list and the side panel. Today's agenda (`today-agenda`) already reads today's events from the device cache, and the calendar's blocks come from `blockFor` on tasks with a due time.

## Decisions

### D1 A list of times, not an hour grid
A grid in a 240 px column needs its own scroller to cover a day, and short items overlap (issue 526). A list of "time · title" rows reads the same as the requested sketch, never overlaps and fits five items in about 150 px. The Day calendar remains the grid.

### D2 Pinned above the footer, folded by default
Placed inside the scroller it would scroll away, which is the problem the user has. Pinned between the scroller and the footer it is always visible; folded by default so nobody's sidebar changes until they open it, remembered per device (`ot.sidebar.group.schedule`) like Projects, Labels and Views.

### D3 What is "ahead"
Today's open, undeleted tasks with a due time outside archived projects (`calendarTasks`, viewed in the viewer's zone), and timed events of enabled subscriptions, whose end is after now. An item is current when it has started. Ties put tasks first. The list follows the minute clock of the calendar's now line.

### D4 Opening things
A task opens with `openTaskPanel`, so on a list page it docks in the side panel beside the list, the user's layout. An event reuses Today's agenda event button and popover.

## Data model impact

None: no op, field, table or route. Events are read from the existing cache; the section asks for a fresh copy only when the device knows a subscription, like Today.

## Bundle and memory

About 2 KB of source, loaded with the sidebar (first load); no dependency. The first-load gzip budget is checked by `make bundle-budget`.

## Interface budget

No new destination (still at most six primary), no chrome row above the list, no task property. The section never scrolls on its own: vertical scroll regions stay the sidebar's scroller, the page and the side panel (three). It takes room from the sidebar's scroller while open, which the user chose by opening it. No shortcut.

## Risks

- On a very short window the open section leaves little room for projects: it can be folded with one click, and is folded by default.
