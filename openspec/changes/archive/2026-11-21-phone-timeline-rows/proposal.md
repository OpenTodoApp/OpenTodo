# Proposal

## Why

A project's Timeline is hard to use on a phone (GitHub issue [#1372](https://github.com/OpenTodoApp/OpenTodo/issues/1372), found by the interface audit at 360 px):

- Rows are 36 px, but each task name is a button that touch makes 44 px tall, so the names of neighbouring rows overlap by 8 px (4 findings of overlapping touch targets).
- The name column takes 144 of 328 px and still cuts names after 16 to 19 characters ("Get three quotes f…"). The grid keeps 183 px: under six days.
- A three-line hint sits above the grid, a third of it about arrow keys a phone does not have.
- A tap on a name only selected the row; opening the task needed a double tap.

## What Changes

- **Below 768 px the name sits above its bar.** A task row is the name on one line across the width of the grid, with its bar under it. The name stays at the left edge while the days scroll sideways. At 360 px the seeded names (up to 36 characters) show whole, and the grid shows ten days instead of under six.
- **Rows fit a finger.** Such a row is 56 px with a bar and 44 px without one (Unscheduled), and the whole row is the name's button, so no two names share a touch area. Where the names stay beside the grid (from 768 px), a row is 44 px on a touch screen.
- **A tap opens the task.** On a touch screen a tap on a name opens the task, as a row of the list does. The bar keeps its own presses: a tap selects it, press and hold drags it.
- **The hint loses its keys on a phone.** The hint is two sentences now; the one about arrow keys is marked as a keyboard hint, which `touch-keyboard-hints` does not draw on a device without a keyboard. Same words in every language.
- **Nothing changes with a mouse from 768 px**: 36 px rows, the name column, a click selects and a double click opens.

Out of scope: the Timeline of a tablet in portrait beside the sidebar (the name column still takes 256 of 436 px there), the name buttons' 20 px height with a mouse, two-line names, the week zoom's column width, the board and calendar layouts, and any change to dates, dragging rules or dependencies.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, not a squeezed desktop page).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-timeline`: the layout requirement states where the 36 px row applies, and the narrow-screen requirement describes the phone row, the touch row, the tap and the hint.

## Impact

- `web/src/app/TimelineView.tsx`: the row's two shapes, row heights by width and pointer, the arrows' positions from them, the hint in two parts.
- `web/src/locales/*.json`: the hint's translation split in two at its sentence boundary; no new wording.
- `docs/project-timeline.md`, `docs/interface-guide.md`.
- No data, op, route or setting changes. No dependency.
- The phone-width screenshot of the story `Screens/Timeline` changes.
