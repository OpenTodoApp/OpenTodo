# Proposal

## Why

On a phone, the Day calendar's unscheduled lane grows with every date-only task. Each row is a 44 px touch target, so seven tasks take about 355 px of a 428 px calendar on a 360 px phone and leave the hour grid a sliver, which makes dragging a task onto a time hard. The red now line also paints over the lane when the grid is scrolled under the sticky header. GitHub issue #775, reported by a user on an iPhone PWA. The same happens in the Week grid at tablet width.

## What Changes

- On a touch screen or a window narrower than 768 px, a lane with more than three items folds behind a header, **Unscheduled** with the count, collapsed by default. A tap opens or folds it; the choice is kept on this device (one choice for every day's lane, so a Week's columns stay aligned) and is never synced. While the keyboard selection is a task of a folded lane, the lane shows its rows.
- A folded lane is still the lane's drop target: a block dragged onto its header loses its time and keeps its date, as before.
- The all-day strips and lanes sit in one region of the sticky header capped at three and a half rows (at most a quarter of the screen) that scrolls on its own, so the hour grid keeps most of the screen even with the lane open.
- The hour grid is its own stacking layer under the sticky header, so the now line, drag and placement ghosts and re-plan ghosts never paint over the lanes. This applies at every width.
- With a mouse on a window of 768 px or more the lane looks and behaves as before.

Not **BREAKING**: no data, op or environment change.

## Out of scope

- The phone Week agenda (a list without a grid, drag or now line), Month, Plan and the planning list.
- Rows below the 44 px touch target: the design system keeps 44 px on touch; the density comes from folding and the cap.
- A per-day fold choice.

## Roadmap

User bug report GitHub issue #775. Not a ROADMAP.md row.

## Capabilities

### Modified Capabilities

- `time-blocking`: a new requirement for the unscheduled lane on a touch screen or a narrow window and the now line's layer.

## Impact

- `web/src/app/calendar/laneFold.ts` (new: the device choice, the shape rule, the media query, the cap), `web/src/app/calendar/DayColumn.tsx` (the fold header), `web/src/app/CalendarView.tsx` (the capped region, the grid's stacking layer).
- No new strings, dependency or bundle change beyond a few hundred bytes.
