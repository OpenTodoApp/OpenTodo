# The rest of the app on a phone

## Why

The owner wants the whole app comfortable in the phone UI (below 768 px, a coarse pointer). The Inbox's Process screen, the Board, the Timeline, the calendar and the tooltips are being worked on in other changes. This change takes the rest: a list of gaps found by reading the code, each one checked in a real browser at 390×844 (and 360 px) with touch before anything was changed.

Three of the gaps were real, three were not, and the layout check found two more once it opened the screens it did not cover:

- **Notes: From template… had no entry on a phone.** It is the split part of New note and `Shift+Q`; below 768 px the header has no New note (the add button starts a blank note), so a phone could not start a note from a template.
- **Routines: the row's text was a 94 px column at 360 px.** The switch, the text, Run now and the menu shared one line, and a routine's sentence took 13 lines.
- **Statistics: a region that scrolls sideways did not show it.** The heatmap, the weekday and hour grid and an open table are cut at the screen's edge with no sign that more follows.
- **The layout check did not open** Next, Waiting, the Loop home, the weekly review, Close the day, the Daily check, Habits, a habit's page, Focus or a note's page.

Not real (nothing changed, see design.md): the add button over the last rows (every screen already ends with the button's room), 32 px text fields in Settings on touch (they measure 44 px), and the Assistants configuration block (the page does not scroll sideways and Copy configuration works).

## What Changes

- **Notes.** Below 768 px, **From template…** is the first item of the Notes page's menu, in List and in Graph mode. It opens the same template list, a sheet below 640 px.
- **Routines.** Below 640 px a routine's row has the switch, the text and the menu; **Run now** is the menu's item (it was there already). From 640 px the row keeps its Run now button.
- **Statistics.** The heatmap, the weekday and hour grid and a chart's table fade at the edge where content is hidden, and only there. The heatmap still opens on the current week.
- **Checks.** The layout check opens the ten screens above (the seed gains one habit and one standalone note), and no longer reports a region that scrolls inside a field being edited as unreachable by keyboard. The Settings height script also lists touch controls under 44 px.

No op field, route, setting, shortcut or dependency. No new text to translate. Not **BREAKING**.

## Out of scope

- The Inbox's Process screen, the Board, the Timeline, the calendar, tooltips and drag and drop (other changes).
- Redesigning the charts, or a table layout that fits a phone without scrolling.
- A keyboard stop on a read-only code block that scrolls sideways (noted in design.md).

ROADMAP.md: none (phone polish asked for by the owner).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `note-templates`: a new requirement, "From template on a phone".
- `routines`: a new requirement, "A routine's row on a narrow screen".
- `statistics`: a new requirement, "Sideways regions show that they continue".

## Impact

- Web: `web/src/app/notes/NotesPage.tsx`, `web/src/app/routines/RoutinesView.tsx`, `web/src/app/review/charts.tsx`, `web/src/ui/patterns/Sidebar.tsx` (`useScrollEdges` reads a row that starts at its right end).
- Scripts: `scripts/ux-audit/seed.mjs`, `layout-screens.mjs`, `screens.json`, `measure.mjs`, `settings-heights.mjs`.
- Docs: `docs/note-templates.md`, `docs/routines.md` (`docs/statistics.md` is at its 600-word limit and is unchanged); `changelog.d/Changed/phone-rest.md`.
- Size: a few hundred bytes, within the first-load budget; the charts are a lazy chunk.
