# Design

## Context

`TimelineView` draws each task's bar as a 24 px tall block in a 36 px lane, with a 6 px span at each end. A pointer press on the bar starts `beginDrag` (`web/src/lib/dnd.ts`) as a move, a press on an end span as a start or deadline drag; the day columns under the rows are the drop targets, and a drop is one `calendarEditWithUndo` batch of ordinary field ops. On touch `beginDrag` lifts only after a 350 ms hold, so a swipe scrolls the grid. A click on a bar selected its row and a double click opened the task; a tap on the name opens the task on a coarse pointer.

Measured before this change on the built app, Chromium with touch at 390 × 844, the layout check's seed plus a five-day bar (160 px) and a one-day bar (32 px):

| Gesture | Result |
| --- | --- |
| Tap on a bar | The row is selected; the task does not open |
| Hold 12 px inside the bar's end, move one day | The whole bar moves |
| Hold 2 px inside the bar's end, move one day | The deadline moves |
| Hold the middle, move one day | The whole bar moves |
| Swipe on a bar, no hold | The grid scrolls 105 to 145 px; no date changes |
| Swipe beside a bar | The grid scrolls |
| Hold a bar at the grid's right or left edge for 1.5 s | The grid does not scroll |
| Tap on the name | The task opens |

## Goals / Non-Goals

**Goals:** a tap on a bar opens the task by touch; a finger can drag a bar's start and deadline; a dragged bar reaches days off screen, and never an empty strip after the axis; a mouse behaves as before except that the grid also scrolls under its drag.

**Non-Goals:** a new control, a new string, a change to how a bar is drawn, a change to `lib/dnd`.

## Decisions

### D1. A tap on a bar opens the task where a tap on its name does

The bar's click handler takes the same branch as the name's: `(pointer: coarse)` opens, otherwise it selects and a double click opens. One condition for both parts of a row, so a row never opens from its name and selects from its bar. A hold that ends without a move stays nothing, and the click after a drop is swallowed by `beginDrag`, so a drag never opens the task.

Rejected: reading the click's own `pointerType`. On a laptop with a touch screen the name would then select and the bar open; the name's rule would have to change with it, and `phone-timeline-rows` settled that rule.

### D2. The pressed part of a bar, from the press's pointer type

`touchGrab(x, barWidth, ends)` in `lib/timeline.ts` returns `start`, `move` or `end` for a press `x` pixels from the bar's left edge: an end within `TOUCH_END_PX` (24 px, WCAG 2.2's target size) of it, and never more than a third of the bar, so a one-day bar (32 px on the day axis) keeps 10.7 px at each end and its middle third for moving. An end that cannot be dragged (the bar runs past the axis there) is part of the middle. It is the same rule as `resizeZone` for calendar blocks (`phone-calendar` D5).

The bar's `pointerdown` calls it when the event's `pointerType` is `touch`, and the 6 px end spans ignore a touch press so it reaches the bar. A mouse or a pen keeps the spans as they are, with their resize cursor. The pointer type of the press decides, not a media query, so a mouse on a tablet keeps its precise handles and a finger on a laptop's screen gets the wide zones. Nothing is drawn differently.

Rejected: wider end spans on a coarse pointer. On a one-day bar two 24 px spans cover the whole bar, the later one on top, and the bar could no longer be moved.

Rejected: zones that reach outside the bar. They would lie over the note after the bar and over a neighbouring bar's row, and a press there would no longer scroll the grid.

### D3. The grid scrolls sideways under a lifted drag, in the timeline's own code

`beginDrag` reports every move of a lifted drag through `onMove`. The timeline keeps the last pointer position and, in an animation frame loop, scrolls its grid by a quarter of `edgeStep` (the lists' step from `lib/dnd`: a zone of 48 px or a quarter of the width, up to 16 px a frame, so up to 4 px here) while the pointer is inside the grid's height and near its left or right edge. The left edge is the grid's own from 768 px on, after the sticky names column. The loop stops when the grid cannot scroll further, when the pointer leaves the zone, and when the drag ends.

`beginDrag` marks the column under the pointer only when the pointer moves, so after each step the timeline marks the day now under the still pointer itself. The drop reads the element under the pointer on release, so it lands on that day. The day the bar was grabbed at is an ISO date taken at the press, so the number of days a move shifts counts the days that scrolled past.

It lives in `TimelineView.tsx`, not in `lib/dnd`: the lists' edge scroll there is vertical and looks for the page's scrollers, and the board's sideways scroll is being added there by another change. Rejected: adding the grid to `lib/dnd`'s scrollers. It would touch the same lines as that change and give every drag of the app a horizontal case.

The lists' full step was tried first and measured: a bar held at the edge for 1.5 s crossed the whole axis, 81 days, which no one can stop on a date. A quarter is 240 px a second at the edge: about a week a second on the day axis and two and a half on the week axis, and one pixel a frame at the zone's inner edge.

It applies to every pointer. With a mouse the grid did not scroll under a drag either, and the keyboard's `[` and `]` cannot be pressed mid-drag.

### D4. No touch control for moving dates a day at a time

The keyboard has `←`, `→` and Shift with them; touch has the drag, which the measurement shows works, and with D2 and D3 it reaches both ends and days off screen. The task's page, now one tap on the bar away, has its date rows for an exact date. A row of step buttons would be chrome between the hint and the grid, against the interface guide's fourth rule.

### D5. The grid ends where the axis ends

The first run of D3 showed a defect that was there before: below 768 px the grid scrolled about 110 px past the axis's last day into an empty strip, and a bar dropped there did nothing. A group bar's row is a flex row of its name and a spacer as wide as the axis; from 768 px the name is a column beside the axis, but below it the name is drawn over the axis and the two together were wider than it by the name's width. The spacer now takes the rest of the row (`flex-1`) at every width, which from 768 px is the same width as before.

### Data model, size

No data model impact: no field, op, route or setting. A touch drag ends in the same `calendarEditWithUndo` batch as the mouse drag (`start`, `due`, `deadline`, one op per field). No dependency; the project view's chunk grows by a few hundred bytes and the first load not at all.

### Interface budget

No chrome is added above the list's first item: the timeline keeps its zoom switch and hint. No new task property, sidebar destination, vertical scroll region or shortcut. The grid stays the timeline's one horizontal scroller.

## Risks / Trade-offs

- A one-day bar's ends are 10.7 px for a finger: enough to keep the middle for moving, small to hit. The Weeks zoom makes a short bar narrower still; the Days zoom and the task's page are the way to an exact date there.
- A press on a bar's end by touch still needs the 350 ms hold before it drags, as every touch drag does; without it the press is a scroll.

## Open Questions

- The hint says "Drag a bar" and not that a finger holds first. `phone-timeline-rows` fixed its wording; a hint for touch is a new string in every language.
