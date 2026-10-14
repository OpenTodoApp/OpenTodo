# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **The calendar is a pure projection plus one write path.** `web/src/lib/calendar.ts` holds the math (`calendarTasks` selects open, live, non-archived tasks in a date range; `weekDates(iso, weekStart)` follows the user's first day of the week; `dayLoad` and `formatLoad` give the capacity marker); `CalendarView.tsx` turns pixels and keys into `updateTask(id, { due })` calls, converting zoned dues with `viewedTask` and `dueFromView` (`CalendarView.tsx:93-98, 149-163`). Keyboard edits run through a serial `edit` queue on the freshest row (`CalendarView.tsx:170-183`); `[`, `]`, `t` navigate; `placementSignal` receives `s` from lists.
- **Two drag primitives exist.** `web/src/lib/dnd.ts` is the generic pointer drag with `data-drop-target` keys, a ghost, touch press-and-hold and Escape (board columns, manual ordering). `web/src/app/calendarDrag.ts` is the slot-based variant for the time grid. Day cells and timeline columns are discrete targets, so `dnd.ts` fits them.
- **The board is a renderer of the list's query.** `TaskListView.tsx` buckets a project's tasks by section (`sectionGroups`, `columns`, lines 157-248) and hands cards to `BoardView.tsx` through `renderCard`; selection and keys stay in the parent. The layout choice is `ProjectViewMode = 'list' | 'board'` in `web/src/lib/sections.ts:131-137`, stored in Dexie `meta` per project, toggled by `v` (`TaskListView.tsx:266`).
- **Routes are a small union** (`web/src/app/router.ts:6-27`); Day and Week carry an optional `date`. The sidebar lists Day and Week with icons `clock` and `calendar-range` (`Sidebar.tsx:205-206`); `calendar-days` is already in the icon set (`web/src/ui/icons/names.json`).
- **A keyboard month grid already exists** in the date field's calendar popover (`date-time-preferences` D4: `role=grid`, arrows, Page Up/Down, Home/End, weeks starting on the preference). The Month view reuses its grid math and roving-focus pattern, not its component.
- **Sibling fields are contracts, not code yet.** `task.deadline` (`deadlines`: floating date, countdown tone on rows), `task.start` (`someday-and-evening`: a date or `someday`) and `task.blocked_by` with `isBlocked`/`openBlockers` (`task-dependencies` D2) are being specified in parallel. `TaskRow` already carries the row presentation each of them adds.
- **Layout check and screenshots** run through `scripts/e2e-layout.mjs` (360, 390, 768 px) and `scripts/e2e-views.mjs`; `make docs` regenerates `docs/keyboard.md` from `web/src/lib/shortcuts.ts`.

## Goals / Non-Goals

**Goals:**
- Month and timeline are projections of local rows with pure, unit-tested math; every write is an existing `due`, `start` or `deadline` field op.
- Keyboard parity with Day and Week: the same navigation keys, a key for every placement.
- The timeline degrades gracefully while sibling fields are missing (bars from due dates only, no arrows), so the Month half can ship first.

**Non-Goals:**
- Hour precision in the month (Day and Week keep it), auto-scheduling, dependents following blockers, critical path.
- Virtualised rows or canvas rendering.
- Drag from the Plan tray into the month, and a cross-project timeline.

## Decisions

### D1. Month is a sibling of Day and Week, not a mode of CalendarView

Route `{ view: 'month'; date?: string }` (`/month/YYYY-MM-DD`), `g m`, a sidebar entry "Month" with `calendar-days` after Week, and a third button in the Day | Week | Month range switch of both `CalendarView` and `MonthView` that navigates with the current anchor. `MonthView.tsx` is its own component on a pure `web/src/lib/month.ts`:

```
monthGrid(anchorISO, weekStart): string[][]      // 6 rows × 7 ISO dates, from weekDates()
cellTasks(tasks, date): Task[]                    // timed by time, then priority, then position
cellLoad = dayLoad                                // reused
visibleRows(cell, max): { shown, hidden }
```

`calendarTasks(allTasks, projects, grid[0][0], grid[5][6])` selects the tasks once, after `viewedTask` for zoned dues, exactly as the week does. The grid always has six rows so the layout never jumps between months.

- **Alternative: a `mode: 'month'` inside `CalendarView`.** Rejected. That component is built around a minute axis (`PX_PER_MIN`, slots, lanes, resize); a month shares its data selection and navigation, not its geometry. Sharing happens in `lib/calendar.ts` and the header, which becomes a small shared `CalendarHeader` (title, prev/next/today, range switch).

### D2. Month cells: overflow and capacity

A cell renders `max` rows (three on desktop, computed from the cell height) and a "+N more" button that sets `expanded = date`; an expanded cell grows (the row stretches) and Escape or activating "less" collapses it. This mirrors the "+N" overflow marker of the time grid (`lib/layout.ts`) without a popover, so it stays readable in the layout check. The capacity marker reuses `dayLoad`/`formatLoad` with `useGridPrefs()` and shows only when `planned > 0`, so an empty month is not covered in `0m / 8h`.

### D3. Month writes: day drop targets on `lib/dnd.ts`, keyboard through the serial queue

Each cell carries `data-drop-target="day:<ISO>"`; a row's `onPointerDown` calls `beginDrag` with `onDrop(target)` → `updateTask(id, { due: dueFromView(stored, { date, time: viewed.time }) })`, keeping time and zone exactly like a slot drop keeps the zone (`CalendarView.tsx` `commit`). Keyboard moves reuse the `edit` queue pattern and `nudgeDue(due, { days: ±1 | ±7 })` from `lib/calendar.ts`, then `follow(date)` navigates to the month that contains the new date, as the week does. Rows of tasks the user cannot edit (viewer role, `roleOf` in `lib/sharing.ts`) get no `onPointerDown` and the key handler ignores them, as the board does with `editable`.

- **Alternative: `calendarDrag.ts`.** Rejected: it converts pointer offsets to minutes; day cells need element hit-testing, which `dnd.ts` already does with `elementFromPoint`.

### D4. Month keyboard model: a roving day grid plus task selection

The grid is `role="grid"` with `role="gridcell"` days and a roving `tabindex` like the DateField popover. Two selections exist: a focused day (always) and an optional selected task. With no task selected, arrows move the focused day; `j`/`k` select the next/previous task in grid order (row by row, cell by cell, `cellTasks` order) and make its day the focused day; with a task selected, arrows move the task (D3) and Escape returns to day navigation. `q` opens quick add with the focused day as the due context (the `taskDefaults(route, today)` hook in `TaskListView.tsx:376` already derives defaults from the route; the month passes its focused day), so the Month view inherits the "Capture in Today" behaviour for any day. `Enter` opens the selected task in `TaskDetail`.

### D5. Timeline is a third renderer of the project list

`ProjectViewMode` becomes `'list' | 'board' | 'timeline'`; `loadViewMode` maps unknown stored values to `list`; `v` cycles in that order and the `ProjectHeader` toggle becomes a three-way segmented control. `TaskListView` keeps building `sectionGroups` and the tree and, in timeline mode, renders `TimelineView` with the same rows (section heading rows, then tasks in list order with `depth` for subtasks), its selection id and an `onDrop`/`onShift` pair, exactly as it hands `BoardView` its columns and `renderCard`. Selection, `j`/`k`, Enter, `c` and the detail panel therefore stay in the parent and keep working.

`web/src/lib/timeline.ts` is pure:

```
spanOf(task, zone): { from, to, dueAt?, deadlineAt? } | null   // null = unscheduled (no dates or start === 'someday')
axis(anchor, zoom, weekStart): { columns: string[], pxPerDay }  // days, or weeks starting on weekStart
shiftDates(task, days): Partial<Task>                           // start, due (via dueFromView), deadline, each only when present
edges(rows, byId): { from: id, to: id }[]                       // open blockers inside the project
```

`spanOf` reads `task.start`, `task.deadline` and `task.blocked_by` as optional properties, so it compiles and renders due-only bars before the sibling changes land; the tasks list gates the parts that need them.

- **Alternative: a separate `/project/<id>/timeline` route.** Rejected: the board precedent keeps one route per project and remembers the layout per device, and the docs already teach `v`.

### D6. Timeline geometry and writes

- The visible axis is a window of `anchor − 4 weeks … anchor + 12 weeks` rendered in a horizontally scrolling container; `[` and `]` move the anchor by the visible span, `t` recentres on today, and the window re-renders around the new anchor. Bars outside the window are clipped to its edge with an arrow glyph, so a far-future deadline is still visible as "beyond".
- Bars are absolutely positioned `div`s inside each row (`left = (from − windowStart) × pxPerDay`); arrows are one inline `<svg>` overlay per timeline with a `<path>` per edge from the blocker's right end to the dependent's left end (orthogonal: right, down/up, right), `aria-hidden`, with the relation also stated in the dependent row's accessible name ("blocked by Confirm dates").
- **Drag** uses `lib/dnd.ts` with the day columns as targets (`data-drop-target="day:<ISO>"`, the same key scheme as the month): dropping a bar grabbed on day `g` onto column `d` calls `mutateMany([{ entity: 'task', entityId, patch: shiftDates(task, d − g) }])`, one op per field in one batch. Grabbing within 7 px of an edge (the time grid's `RESIZE_ZONE_PX` rule) starts an edge drag that writes only `start` (left) or `deadline` (right), creating the field; an unscheduled row dropped on a column gets `due: { date }`.
- **Keyboard**: Left/Right → `shiftDates(task, ±1)`; Shift+Left/Right → `deadline ± 1`, seeded from the due date when absent; the start is edited from the detail panel's start field (`someday-and-evening`), which keeps the keyboard set small and still leaves every value reachable.
- Dependents never move with a blocker: shifting writes only the dragged task's fields (Non-goal, spec "Moving a blocker SHALL never move its dependents").

- **Alternative: shift start and deadline but not the due date.** Rejected: the due date is the planned day and the one field every task has; a bar that moves while its due marker stays would misreport the plan.

### D7. Performance bounds

A project with a few hundred open tasks renders a few hundred rows and bars, each a cheap element; the arrow SVG has one path per edge. `spanOf` and `edges` run in a `useMemo` over the project's tasks, O(n + edges). This is the board's scale and needs no virtualisation. A project of thousands of tasks would scroll slowly; the Non-Goals say so, and the list remains available.

### D8. Responsiveness

- Month < 640 px: cells show the day number and a count badge (`cellTasks(...).length`), the focused day's tasks render under the grid through the same `TaskRow` rows used by lists (with the list's keyboard handling), and the seven columns are `1fr` each with a 16 px gutter.
- Timeline < 640 px: the label column is `position: sticky; left: 0` at 40 % width, the axis scrolls inside the container (`data-scroll-x`, which the layout check already treats as an allowed horizontal scroller), and touch drag starts after `TOUCH_HOLD_MS` like the board.

## Risks / Trade-offs

- **[Sibling fields land in a different order or shape]** → `spanOf` and `edges` read optional fields and the tasks are grouped so the Month view and a due-only timeline ship first; the start/deadline/dependency groups are gated on the archived siblings and name the field they expect. A shape change is a one-function edit in `timeline.ts`.
- **[Two keyboard selections in the month confuse]** → The focused day and the selected task are visually distinct (cell outline vs. row highlight), Escape always steps back to day navigation, and the status line says "Moving <task> · arrows move · Esc" like placement mode.
- **[Dragging a bar by accident on touch]** → Press and hold, as on the board; a plain swipe scrolls the axis.
- **[Six-row grid shows an extra week]** → Days outside the month are dimmed and still interactive; the alternative (five or six rows) jumps the layout between months.
- **[Arrows overlap rows in dense projects]** → Paths route in the gutter between the bar and the row edge, carry a 1 px halo in the surface colour, and the relation is also in text in the row.

**Size:** no dependency. Month plus timeline add an estimated 6–8 KB gzipped of client code; the Go binary only gains the embedded bundle growth, and runtime memory is unchanged.

## Migration Plan

No data migration. The per-device layout preference gains a value; an older client reads `timeline` as `list` through `loadViewMode`. Rollback is shipping the previous binary; the routes `/month` fall back to the Inbox on an older client like any unknown path.

## Open Questions

- Should the Month view be offered as a start view (`BUILTIN_START_VIEWS`, `custom-views`)? Day and Week are not today; adding all three is a two-line change in a later change without touching these specs.
