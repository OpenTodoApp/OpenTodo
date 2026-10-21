# Design

## Context

See proposal.md for why. The six items are independent in code but meet in three places: the review row (Reopen), the list drag controller (drops on the sidebar) and the shell's page primitives (frame, row look). What exists today:

- **Close the day** (change `close-the-day`, still active, shipped in 0.9.0): Apply writes the carry-over as one bulk batch with an in-memory undo (toast, `Ctrl`/`⌘`+`Z`); Close writes `closed_at` (Unix ms, 0 = never) and `tomorrow_note` on the `review` entity. Once the toast is gone and the page reloads, nothing can take the batch back; `CloseDayRow` offers only "Close again".
- **Formats**: `formatDate`/`formatTime` in `lib/dates.ts` follow the preferences. `TriageView.tsx:240` and `focus/FocusParts.tsx:101` append `task.due.time` raw, so a 12-hour user sees `15:00`, and a zone-fixed due shows the stored wall time instead of the viewer's. `datetime/DatePicker.tsx` has the placeholder `Type a date: fri, 3 days, 22/10` hard-coded in day-month order.
- **Drag**: `task-list/useListDrag.ts` resolves drop targets by `data-drop-target` inside the list only. The sidebar's project rows carry `data-drop-target="project:<id>"` for its own project-reordering drag (`Sidebar.tsx`), and label rows in `LabelsView.tsx` for label reordering; neither accepts a task.
- **Rows**: hover is `hover:bg-canvas` on the whole `li`; selection is `.row-selected` (5% accent tint plus a 3 px `::before` bar, `index.css:667`). On a two-line row the hover block is as large as the selection and reads as heavy.
- **Sidebar tree**: 12 px indent per level (`INDENT_REM`), rows touching, no visual link between a parent and its children.
- **Page template**: `TaskListView.tsx:241` centres lists at `max-w-3xl` (48 rem), columns layout at `max-w-6xl`, and board/timeline at the full column, and the header follows the same container, so the title and actions move when the layout changes.

## Goals / Non-Goals

**Goals:**
- Undo a close at any time during the same logical day, on any device.
- No raw `HH:MM` or hard-coded date order on any scheduling surface.
- Drop on sidebar projects, the Inbox, Favourites and labels with the same feedback and undo as other drags.
- A header that does not move between page types at a given window width.

**Non-Goals:**
- Reopening an earlier day, or keeping more than the latest carry-over.
- New drop targets in the sidebar beyond projects, the Inbox, Favourites and labels (no dates, no filters).
- Changing the content widths themselves (48/42 rem stay).

## Decisions

### D1. The carry-over is recorded on the review row (`carry_over`), not only on the device

Reopen must work after a reload and from the phone after closing on the laptop. Options:
- **Device-local record** (IndexedDB meta): simplest, no schema change, but Reopen would work only on the closing device, and the "Day closed" row on other devices would offer something it cannot do.
- **Recompute from history**: the client does not keep other devices' ops, so "the value before the batch" is not available offline.
- **Chosen: an additive `review.carry_over` field** (`kString` holding JSON, `""` = none): `{ "date": "YYYY-MM-DD", "items": [{ "id", "field", "before", "after" }] }`, written in the same batch as the carry-over and replaced by each Apply. Fields are `due`, `start` (Someday) and their siblings the batch writes; values are dates and the `someday` marker, never titles, so the field is not in `e2ee.ContentFields`. Size: a day with 40 carried tasks is about 4 KB, once per day.

Reopen reads `carry_over`, compares each `after` with the task's current value and writes `before` back where they match, the same "changed since, skipped and named" rule as the bulk undo (`lib/undoActions.ts`), so behaviour is one pattern. It then writes `closed_at = 0` and `carry_over = ""` in the same batch, which gets the usual one-step undo.

Data model: one new field on `review` in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts`, and the defaults in `web/src/lib/ops.ts`; LWW per field like the other review fields; in the JSON export; no activity event. An older server rejects it as unknown (scenario in the spec); the device keeps it locally.

### D2. "Reopen the day" lives where "Day closed" is shown

The row at the end of Today shows "Day closed, 18:42" with two actions: "Reopen the day" (primary for the rest of the day) and "Close again". The Close the day screen shows the same action in its header meta when the day is closed. No new shortcut: the action is a button in content below the list, so the interface budget (two rows of chrome above the first item) is unchanged.

### D3. One formatter call for every due shown while scheduling

Process the Inbox and Focus switch to `formatDueLong(task.due, zone)`, a helper next to `describeDue` in `lib/dates.ts` that reads the due through `localDueOf` and writes it with `formatDate(…, 'long')` and `formatTime`, so it applies the date and time formats and the viewer's zone while keeping the long date these cards showed before (`describeDue` would have turned "Wed 21 Oct" into "Tomorrow"). The DatePicker's placeholder builds its example from `formatDate(addDaysISO(today, 1), 'numeric', resolved)` and the error message already does the same. A unit test renders both views with `time_format: '12h'` and a `month-day` order; a source check (`grep` in the existing `ui-lint` style) forbids appending `due.time` to text without `formatTime`.

### D4. Sidebar drops go through the list's drag controller

The list's drag already owns the pointer and the ghost row. It learns a second kind of target: elements under the pointer with `data-task-drop="project:<id>" | "inbox" | "label:<id>"` (a new attribute, so the sidebar's own `data-drop-target` used for reordering projects keeps its meaning). When over one, the list's drop line hides and the target gets the existing drop ring. Release calls `moveWithUndo` (already used by the inline edit bar) or a new `addLabelWithUndo`, both batched over the bulk selection when the dragged row is in it. Permission (viewer, read-only) is checked before showing the ring, using the same role check as the Move picker. Alternative considered: HTML5 drag and drop across the page; rejected because the list's drag is pointer-based for touch and reduced motion, and mixing models breaks the long-press start on touch.

With `inbox-means-unplaced`, a dated task dropped on the Inbox leaves its project but may not be listed in the Inbox; the toast still says "Moved to Inbox", which stays true (the task has no project).

### D5. Hover is a tint, selection a thin bar

Tokens, no raw colours: hover uses `color-mix(in oklab, var(--text-color-default) 3%, transparent)`; the selected row `color-mix(... accent 4%)` and a 2 px bar. Hover on the selected row is suppressed with `.row-selected:hover { background: <selected tint> }`. The 3:1 contrast of the bar is kept (the accent token already meets it at 2 px in both themes; the layout check's axe pass covers it). Nothing else changes on hover: the trailing counts' contrast rule of `calm-rows` stays as that change specifies.

### D6. Sidebar tree: 16 px indent, guide line from the parent

The guide line is a `::before` on the children's group, positioned at the parent's icon centre, `border-default` colour, `aria-hidden` by being CSS. Rows get `margin-block: 1px` (2 px between rows) and an expanded root's group `margin-bottom: 6px`. The capped indentation of "Deep nesting on narrow screens" also caps the guide line. Alternative: tree connectors with elbows (├─); rejected as heavier and harder to keep crisp at 1.25× zoom.

### D7. One page frame for every page type

The page header primitive renders inside a frame `mx-auto w-full max-w-[80rem] px-4 md:px-8`; the page body primitive renders inside the same frame and applies the content width (48, 42 rem or the whole frame) left-aligned within it. Alternatives:
- **Keep content centred and centre the header over the widest frame**: the title would sit far left of a centred list on wide screens.
- **Header follows the content (today)**: the problem being fixed.
- **Chosen: left-aligned content in a shared frame.** A list now starts at the frame's left edge instead of being centred in the column: wherever the column is wider than 48 rem (a 1280 px window with the sidebar open and the panel closed), the list starts at the header's left edge, up to about 130 px further left than before. The new `make e2e` step ("one page frame") measures the header's left and right edges and the content's left edge across Inbox, Labels, Trash, Filter and a project in list, board and timeline at 1280 and 1440 px; the layout check runs at phone widths only, so the frame check lives with the desktop flows.

As built: `PageBody` is the frame (`PAGE_FRAME`: `page-frame mx-auto w-full max-w-[80rem]` plus the padding) and marks the page type in `data-page-body`; one CSS rule gives every direct child except the header its width (`list` 48, `form` 42, a new `wide` 72 rem for the field columns layout, `full` none). The task lists use the same `PAGE_FRAME` (their padding is on the scroller around them). Settings section pages keep their two-column layout (section list beside the page) in the same 80 rem frame; their header is in the right column, so the "same left edge" check covers single-column pages only.

Boards, timelines and calendars are capped at 80 rem and scroll sideways inside the frame (the board and the timeline already have their own horizontal scroller; Plan and the calendar grids shrink their columns). This is the budget-relevant part: no new vertical scroll region (horizontal scrollers do not count), no new chrome row.

### Interface budget

- Rows of chrome above a list's first item: unchanged (header, quick add).
- Task properties visible by default: unchanged.
- Primary sidebar destinations: unchanged; drops add no item.
- Vertical scroll regions: unchanged (the frame adds only horizontal scrolling inside boards, timelines and Plan).
- Shortcuts: none added; the cheat sheet's `Shift+L` (labels) entry gains "or drag the task onto a label in the sidebar". Lists have no `m`: moving is **Move to project** in the `.` menu, which the docs name next to dragging.

### Size

No dependency. Expected web bundle growth under 3 KB gzipped (reopen, drop targets); no effect on the binary or image size beyond the embedded bundle, and none on server memory.

### Ordering with active changes

- `close-the-day` must be archived first: Reopen adds a requirement next to its requirements and refers to its batch and `closed_at`. Its scenario "Undo does not reopen the day" stays true: the bulk undo still does not touch the stamp; Reopen is the separate action.
- `calm-rows` modifies "One row anatomy" and "Metadata language", not "Selected row indicator"; D5 follows its trailing-counts rule. Archive `calm-rows` before or after; no conflict.
- `quiet-sidebar` and `sidebar-favourites` modify "Sidebar structure", "Open task counts" and pinned items, not "Project tree in the sidebar"; Favourites drop targets (D4) need `sidebar-favourites`' pinned rows, which have shipped.
- `inbox-means-unplaced` (planned) changes what the Inbox lists; see D4.

## Risks / Trade-offs

- [The frame moves list content left on wide screens, which some may read as a regression] → the layout check pins the new positions; the before/after screenshots (`make screens`) go in the pull request for review.
- [Sidebar targets small on a phone] → on touch, dropping uses the same long press and the sidebar is an overlay below 768 px, so phones keep `m` and `l`; the drop targets are only active when the sidebar is visible beside the list.
- [Reopen after other devices changed the same tasks] → the "changed since" rule leaves them alone and names them; LWW per field means no task is put back over a newer edit.
- [`carry_over` rejected by an older server] → the scenario in the spec: the stamp still reopens, the toast says tasks stay; upgrading the server first is the standard advice in the upgrade notes.
