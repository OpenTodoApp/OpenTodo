# Proposal

## Why

A project's timeline is the one layout where a finger could not do what a mouse does. Measured on the built app at 390 × 844 with touch (Chromium, the layout check's seed, a five-day and a one-day bar):

- **A tap on a bar only selected its row.** A tap on the task's name opens the task (`phone-timeline-rows`), a tap on the bar 20 px under it did not, and a phone has no double click and no Enter.
- **A bar's ends were 6 px wide.** A press held 12 px inside the end of a 160 px bar moved the whole bar; only a press within 2 px of the end changed the deadline. A finger could not set the start or the deadline from the timeline.
- **The grid did not scroll under a held bar.** With a bar held at the grid's right edge for 1.5 s the grid stayed where it was, so a bar could only reach the ten or so days in view, and a drop outside the grid did nothing.

The same run showed a fourth: below 768 px the grid scrolled about 110 px past the last day of the axis, into an empty strip where a drop did nothing.

Two things already worked and stay as they are: a press held past the hold interval and then moved drags a bar and writes its dates, and a swipe that starts on a bar or beside it without the hold scrolls the grid.

## What Changes

- **A tap on a bar opens the task on a touch screen**, as a tap on its name does. With a mouse a click still selects the row and a double click opens it.
- **A finger takes a bar's end from a zone it can hit.** A touch press within 24 px of a bar's left or right end drags the start or the deadline; the zone is never more than a third of the bar, so the middle of a short bar still moves it. The bar is drawn as before, and a mouse or a pen keeps the 6 px handles.
- **The grid scrolls under a dragged bar.** While a lifted drag rests near the grid's left or right edge the grid scrolls that way, faster nearer the edge and at most about a week a second on the day axis, for touch, mouse and pen, and the drop lands on the day then under the pointer.
- **The grid ends where the axis ends.** On a phone a group bar no longer makes the grid wider than its days.

Out of scope: the Earlier, Today and Later buttons for the visible range (the change `phone-touch-gaps`); a touch control that moves the selected task's dates a day at a time (the drag works by touch, and the task's own page, one tap away now, has its date rows); a larger touch area above and below the 24 px bar or outside its ends; the hint's wording; edge scrolling of other screens (the lists scroll vertically through `lib/dnd`, the board's columns are another change); the names column from 768 px.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, not a squeezed desktop page).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-timeline`: "Timeline on narrow screens" (a tap on a bar opens the task on a touch screen), and two new requirements: a bar's ends by touch, and the grid scrolling under a dragged bar.

## Impact

- `web/src/lib/timeline.ts`: `touchGrab`, the part of a bar a finger pressed, a pure function.
- `web/src/app/TimelineView.tsx`: the bar's tap, the part of the bar a touch press drags, the grid's sideways scroll during a drag, and the group bar's width.
- `docs/project-timeline.md`: the timeline by touch.
- No data, op, route or setting changes: a touch drag writes the same field ops as the mouse drag. No new string. No dependency. No new mandatory environment variable.
