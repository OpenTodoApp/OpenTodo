# Implementation notes

## Status (2026-10-15)

Done on `feat/display-mode` (the parts that touch no screen, router or design token file):

- 1.1, first half: `web/src/lib/dayLists.ts` holds the Today, Upcoming and project selections, the Today groups (overdue, day, This Evening, blocked), the Upcoming grouping, the next-day columns and the completed-today list, with unit tests. Switching `TaskListView` over to them is the second half and waits for the hold, because ux-overhaul is rewriting that file.
- 4.2, library half: `StartView` accepts `display:<path>`, and `displayStartPath` validates it (a display path; a named project or saved view must exist). Returning it from `resolveStartView` needs a new result kind, which Shell.tsx must handle, so that wiring and the Settings entries come with the screens.

Held until the ux-overhaul PRs (through its group 4) merge: 1.2 (`router.ts`), 2.1–2.2 (`index.css` overrides and the workbench story), all of group 3, 4.1, 4.3, group 5 (public-links must merge first too) and group 6.

## Decisions taken while implementing

- `completedToday` uses the device's local day of `completed_at`, like the Completed view's grouping.
- `nextDays` clamps `days` to 1–7 (the option's range) and keeps empty days, so the columns line up with the calendar.
