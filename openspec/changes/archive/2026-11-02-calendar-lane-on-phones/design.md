# Design

## D1 Where it applies

`(pointer: coarse), (max-width: 47.99rem)`: a touch screen (phones and tablets, where rows are 44 px) or a window narrower than the desktop header breakpoint. A desktop with a mouse keeps its 24 px rows and its unfolded lane, so nothing changes there.

## D2 Folding

`laneShape(count, choice)`: an empty lane keeps its "Unscheduled" placeholder; with no choice stored a lane of more than three items (`LANE_FEW`, the same "a few" as the all-day strip's cap) folds; after "closed" every non-empty lane folds; after "open" a long lane keeps its header so it can fold again. The choice lives under `calendar.laneFold` in localStorage through `createStoredValue`, like the all-day strip's expansion, so every column follows a tap at once. One choice for all days: per-day state would leave a Week's columns ragged.

The header is a button inside the lane's `data-drop-lane` element, so drag hit testing (`closest('[data-drop-lane]')`) treats it as the lane. Its accessible name is "Unscheduled" and the count; `aria-expanded` reports the state.

## D3 Cap

The header's body rows (all-day strips and lanes of every column) are one `overflow-y-auto` region with `max-height: min(calc(var(--size-row) * 3.5), 25dvh)`: a half row shows there is more. One region for every column keeps the screen within the interface budget (the calendar scroller plus this region: two vertical scroll regions, at most three). A touch swipe in the region scrolls it; a long press still lifts a row for dragging (the drag layer cancels the press on movement).

## D4 Now line

The sticky header is `z-20`; the now line (`z-20`), overflow lists (`z-20`) and ghosts (`z-30`) inside the day columns shared the header's stacking context and, later in the document, painted over it. The grid row gets `isolation: isolate`, so everything in it stacks below the header whatever its own z-index.

## Interface budget

No new chrome row above the grid (the fold header replaces lane rows), no new task properties, no sidebar change, two vertical scroll regions, no new shortcut.

## Data model, size

None; no new dependency.
