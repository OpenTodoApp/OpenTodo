## Why

The second round of feedback on the October UX work (21 October 2026) found six things that get in the way every day. Close the day cannot be taken back once its toast is gone. Process the Inbox shows a due time that ignores the time format. A task cannot be dropped on a project or a label. A hovered or selected row looks heavy. Sub-projects in the sidebar do not read as children. The title and the page actions jump sideways when a project switches between list, board and timeline. None of them needs a new concept; each is a gap in behaviour the app already has.

## What Changes

- **Reopen the day.** Until the logical day ends, the "Day closed" row at the end of Today (and the Close the day screen) offers **Reopen the day**. It returns the tasks the carry-over moved to where they were (unless they were changed since), clears the close stamp, and keeps the line for tomorrow as a draft. It works on every device of the user, offline, and converges like any edit. The carry-over is recorded on the user's review row in one additive field so another device can reopen too.
- **Dates and times while scheduling follow the preferences.** Process the Inbox and Focus show a task's due time in the chosen time format and in the viewer's zone for a zone-fixed due (today they print the stored `HH:MM`). Date fields' placeholders and error examples use the chosen date order (the When editor's placeholder hard-codes `22/10`).
- **Drop a task on a project or a label.** Dragging a task (or the selected tasks) from a list or a board onto a project in the sidebar, the Inbox or a Favourite moves it there; onto a label adds that label. The target shows a ring while hovered, and a toast offers Undo. The keyboard equivalents stay `m` and `l`.
- **Calmer rows.** Hover marks a row with a tint lighter than the selected row's and nothing else; hovering the selected row adds nothing; the selected row keeps a thinner accent bar and a fainter tint, still at 3:1 contrast.
- **Sub-projects read as children.** More room between project rows, a deeper indent, and a thin guide line from a parent down the side of its open children.
- **One page frame.** Every page puts its title and actions in the same place at a given window width, whatever its content (list, board, timeline, calendar, settings): the header spans one frame shared by all page types; only the content below changes width, starting at the frame's left edge.

Out of scope: section colours and icons and a larger icon catalogue (change `icons-and-section-style`); when a task leaves the Inbox and the scheduling shortcuts in Process the Inbox (change `inbox-means-unplaced`); new drag targets other than projects, the Inbox, Favourites and labels (for example dropping on a date in the sidebar).

ROADMAP.md: advances "Drag-and-drop ordering" (`manual-ordering`, row 49 of Organisation, views and GTD) and the "Design refresh" section (page template, sidebar).

## Capabilities

### New Capabilities

### Modified Capabilities
- `weekly-review`: Reopen the day, until the logical day ends, with the carry-over recorded on the review row.
- `date-time-preferences`: the due shown while scheduling and the examples in date fields follow the date and time formats.
- `project-organization`: the sidebar tree's spacing, indent and guide line; dropping a task on a project or the Inbox moves it.
- `labels`: dropping a task on a label adds the label.
- `task-list-presentation`: quiet hover and a lighter selected row.
- `app-shell`: one page frame whose header does not move between page types.

## Impact

- Web app: `app/CloseDayRow.tsx`, `app/review/CloseDay.tsx`, `lib/review.ts` (reopen, carry-over record); `app/TriageView.tsx`, `app/focus/FocusParts.tsx`, `app/datetime/DatePicker.tsx` (formats); `app/task-list/useListDrag.ts`, `app/Sidebar.tsx`, `app/FavouritesGroup.tsx` (drop targets); `app/TaskRow.tsx`, `index.css` (`.row-selected`, row hover); `app/Sidebar.tsx` (tree spacing, guide line); `ui` page header/body primitives and `TaskListView.tsx` (page frame).
- Sync: one additive field `carry_over` on the `review` entity (`internal/sync/ops.go` Schema, `web/src/lib/types.ts`, `web/src/lib/ops.ts` defaults). No renamed or removed field; no **BREAKING** op-log change. No new environment variable.
- Docs: `docs/tasks-and-projects.md`, `docs/method/rhythms.md`, `docs/process-the-inbox.md`, `docs/interface-guide.md` (page frame), screenshots regenerated with `make docs-screenshots`.
- No new dependency.
