## Why

Short tasks close together on the Day and Week grids covered each other (issue #526): a 5- or 10-minute block is drawn at least one slot tall so it can be grabbed, its title needs more than that, but the side-by-side layout followed the real times, so blocks that did not overlap in time were placed in one column and drawn over one another. Zooming the browser cannot help, since the overlap is in the layout.

## What Changes

- A block on the grid is drawn at least one title line tall (25 minutes of the grid, 20 px), tasks and calendar events alike.
- The side-by-side layout follows the drawn length: blocks whose drawn boxes would overlap share the row in columns, as overlapping blocks already do, so every title is readable and nothing is hidden.
- The overlap marker keeps its meaning: only blocks whose times overlap carry it.

Not **BREAKING**: no data, no API; times and estimates are unchanged.

## Out of scope

- A zoomed or variable time scale around busy hours (suggested in the issue); the columns solve the hiding without changing the scale.

## Roadmap

Fixes #526 for `time-blocking` (ROADMAP section 4, calendar).

## Capabilities

### New Capabilities

### Modified Capabilities
- `time-blocking`: short blocks never cover each other.

## Impact

- `web/src/lib/layout.ts` (`layoutDay` gains a drawn minimum length; the marker is computed from real times), `web/src/lib/calendar.ts` (`MIN_BLOCK_MINUTES`), `web/src/lib/calendarDays.ts`, `web/src/app/calendar/DayColumn.tsx`. No dependency, no measurable size change.
