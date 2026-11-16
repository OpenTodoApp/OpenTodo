## Context

The Day and Week already have a placement mode (`s` on a list task): a ghost at a proposed time that the keys move, Enter places with Undo, Escape cancels, and focus goes back to the list. Below 1024 px the panel slot covers the content, so neither drag and drop nor watching the ghost works while the list is open.

## Decisions

### D1: A tap starts the same placement

Tapping a list task where the panel covers the calendar starts the existing placement (same proposed start, frame fit and Undo) and marks it as a tap placement. It isn't a new code path for the write: placing goes through the same `commit` as Enter and drag, so Undo, slots and frames behave the same.

### D2: The list steps aside and comes back

The tap closes the panel without changing what's remembered (`plan-list-remembered`), so the calendar is in sight. When the placement ends (placed or cancelled) the list reopens on the same source and focus goes to the next task, as after Enter.

### D3: A tap on an empty time places

During a tap placement, one tap on an empty part of a day column places the task at the quarter hour under the finger. Taps on a block or an event do nothing, so they can't be planned onto by mistake. Double tap and long press keep their add gestures when no placement is running.

### D4: One bar at the bottom

The bar shows the task's title and Cancel. It's a `role="status"` region, so screen readers hear "Tap a time to plan {title}". Cancel is a real button, and focus moves to it when the bar appears. The keys from `s` keep working.

### D5: Wide screens unchanged

From 1024 px the list sits beside the calendar, a tap on a list task does what it does today (nothing; drag or `s`), and nothing in this change runs.

## Risks

- iOS touch: a tap can be read as the start of a drag. The tap only counts when the pointer didn't move past the drag threshold, as the existing drag already decides. The owner's real-device test (3.1) checks it.
