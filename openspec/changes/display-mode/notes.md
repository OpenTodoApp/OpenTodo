# Implementation notes

## Status (2026-10-15)

Done on `feat/display-mode` (the parts that touch no screen, router or design token file):

- 1.1, first half: `web/src/lib/dayLists.ts` holds the Today, Upcoming and project selections, the Today groups (overdue, day, This Evening, blocked), the Upcoming grouping, the next-day columns and the completed-today list, with unit tests. Switching `TaskListView` over to them is the second half and waits for the hold, because ux-overhaul is rewriting that file.
- 4.2, library half: `StartView` accepts `display:<path>`, and `displayStartPath` validates it (a display path; a named project or saved view must exist). Returning it from `resolveStartView` needs a new result kind, which Shell.tsx must handle, so that wiring and the Settings entries come with the screens.

Screens done after ux-overhaul landed (2026-10-16): groups 1–4. Group 5 (the public link display) waits for public-links (#73).

## Decisions taken while implementing

- `completedToday` uses the device's local day of `completed_at`, like the Completed view's grouping.
- `nextDays` clamps `days` to 1–7 (the option's range) and keeps empty days, so the columns line up with the calendar.
- `TaskListView` now selects Today, Upcoming and project tasks through `lib/dayLists.ts`, so the list and the display can't drift apart.
- `nextDays(days)` returns `days` columns after today, so Wednesday with 3 gives Thursday to Saturday, as in the spec scenario. The first version returned `days − 1`.
- Type scale: xl is 2.15, not 2.1, so body text is 32.25 px (15 px × 2.15) and meets "at least 32 px".
- The router keeps `location.search` in its current path, so display options in the address survive a reload. `parseRoute` already split the query off for the views that ignore it.
- The 7:1 check for the override sits in `contrast.test.ts`, which reads the override blocks from `index.css` and applies them over each mode's tokens for every pair in `pairs.ts`. `pairs.ts` itself is unchanged, since the pairs are the same and only the threshold differs.
- There is no "display" or "monitor" icon in the vendored set, so the entries use `eye` rather than vendoring a new icon.
- The display screen sets `data-display` on `<html>` while it is shown, alongside the contrast and motion attributes, so CSS can target it if needed.

## Smoke test (2026-10-16, groups 1–4)

Setup: `./bin/opentodo` on 127.0.0.1:18080. An owner with two tasks due today, a "Shopping" project, and a "Fridge" member account (via invitation) that the project was shared with as a viewer. Headless Chromium at 1024 × 768.

- **E-ink Today.** `/display/today?eink=1` showed `data-contrast="high"` and `data-motion="none"` on `<html>`, a clock without seconds ("12:43 AM"), the date heading, the Today column and the next three days.
- **Remote completion.** A second browser context completed "Buy bread" over `PATCH`. Within the live round trip it moved to "Done today" on the display.
- **Keyboard.** Home, then Space, completed the focused row.
- **Start view.** "Make this the start view on this device", then opening `/`, landed on `/display?eink=1`.
- **Leaving.** Escape opened `/today`, and the attributes were gone.
- **Viewer.** The Fridge account on `/display/project/<id>?size=xl` saw the project's task with no checkbox.
