# Proposal

## Why

GitHub issue [#1382](https://github.com/OpenTodoApp/OpenTodo/issues/1382): on a phone the calendar's Day and Week looked as if the floating add button stood on the last block of the grid, with no way to scroll the block clear.

Measured on the seeded account at 360 × 740 and 390 × 844 with touch, every one of the 33 screens that show the add button already scrolls its last control clear of it: the content column keeps the button's footprint (76 px, `--add-room`) at its end, and a page in the column ends above that room. The sweep found what the issue saw, and one thing more:

- **The Day and Week grid stops 76 px above the tab bar.** The page fills the column, the column's room is taken off its height, so the grid is cut in mid-air with the button in the empty band under it: a block at the cut reads as covered. The grid loses 76 of its 554 px (360 × 740) at every scroll position, not only at its end. The notes graph loses the same band, and lifts its zoom control by the room a second time.
- **A screen without the add button keeps the room anyway**: 76 px of nothing at the end of Statistics, Updates, the Trash, Habits, the Assistant, Focus, Settings and the Weekly review. At 360 px the Weekly review scrolls by 71 px only because of it.

## What Changes

- **One rule, stated once.** The content column keeps the add button's room at its end exactly while the button is offered. A page that fills the column and scrolls inside itself takes the room back and gives it to its own scroller.
- **Day and Week run down to the tab bar** below 768 px; the grid's scroller ends with the button's room, so the last hour and a block in it scroll clear of the button as a list's last row does. The notes graph fills the column too; its zoom control stays above the button.
- **No room without the button.** A screen that does not show the add button ends at the tab bar.
- **The layout check keeps it.** At every phone width it scrolls each screen and the scrollers inside it to their ends and fails on a control left under the add button, and on a screen that keeps the room without the button.

Out of scope: the add button over rows and blocks in the middle of a scroll (it slides out while a list scrolls down; `phone-v2`), where the button stands, which screens offer it (`phone-fab-clearance`), the toast's lift, the selection bar's room, and every width from 768 px.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`); the web app in a phone browser gets the same.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: a new requirement, "Room under the floating add button".

## Impact

- `web/src/app/Shell.tsx` (the room follows the button), `web/src/index.css` (`.page-fill`, `.add-room-end`), `web/src/app/CalendarView.tsx`, `web/src/app/notes/NotesPage.tsx`.
- `scripts/ux-audit/measure.mjs` (`addButtonRoom`), `scripts/e2e-layout.mjs`, `scripts/ux-audit/measure.test.mjs`; `docs/interface-guide.md`.
- No data, op, route, setting or string changes. No dependency.
- Phone-width UI screenshots change: Day and Week (a taller grid), the notes graph, and the end of the screens without the add button.
