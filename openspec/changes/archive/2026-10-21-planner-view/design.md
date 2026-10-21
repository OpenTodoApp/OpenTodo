# Design

## Context

See proposal.md for motivation. What exists and shapes the approach:

- **The calendar is a pure projection plus one write path.** `web/src/lib/calendar.ts` selects the shown tasks (`calendarTasks`: open, live, archived projects left out, in a date range), gives the capacity figures (`dayLoad`, `formatLoad`, `GridPrefs` with `dayLength`, stored per device in Dexie `meta` under `calendar.grid` and read with `useGridPrefs`) and the keyboard move (`nudgeDue`). `web/src/lib/month.ts` orders a day's tasks (`cellTasks`: timed by time, then priority, then position) and is zone-aware through `viewedTask`. Every write of the three views is `updateTask(id, { due: dueFromView(stored, view) })`, with Undo through `setDueWithUndo` (`web/src/app/undoable.ts`).
- **Two drag primitives.** `web/src/app/calendarDrag.ts` turns pixels into minutes for the time grid; `web/src/lib/dnd.ts` (`beginDrag`, `data-drop-target`, `elementFromPoint`, touch press-and-hold, Escape) serves discrete targets and is what `MonthView.tsx` uses with the key scheme `day:<ISO>`.
- **The Month's keyboard model** (`MonthView.tsx`): a roving `role="grid"` with a focused day, an optional selected task, `j`/`k` in grid order, arrows that move the day or the task, `q` into a `Dialog` holding `QuickAdd` with the focused day as `due`, a serial queue for keyboard edits on the freshest row, `editable(task)` from `canEditTasks(roleOf(...))`. Its keys are `view` entries `month.*` in `web/src/lib/shortcuts.ts` with `VIEW_SCOPES.month = []`.
- **Events** come from the device cache (`web/src/lib/calendarFeeds.ts`: `ensureEventsFor`, `eventsStatus`, the `Calendars` toggle) through the hooks `useCalendarEvents`, `useCalendarSubscriptions`, `useCachedEventsWindow`, `useShowEvents` in `web/src/lib/liveData.ts`; `CalendarView.tsx` wraps them in a local `useCalendarFeeds(from, to)` and `web/src/app/CalendarEvents.tsx` has the read-only popover (`eventLabel`, `eventTimeText`). `eventBlocks(events, date, zone)` in `lib/calendar.ts` already clips a timed event to a day in the viewer's zone and skips all-day ones; `CalendarEvent.free` marks transparent events.
- **Recurrence** is one shared calculator (`web/src/lib/recurrence.ts`, pinned to `recurrence.vectors.json` with the Go port): `followingOccurrence(rule, due, today, completedOn, done)` returns the next date or null at the end condition; `previewOccurrences` chains it for the panel's next-three preview, taking completion-relative rules as "completed on each due date". `completedOccurrences(seriesId, tasks)` in `web/src/lib/recurring.ts` gives `done`.
- **One Calendar destination.** `web/src/lib/calendarMode.ts` remembers `'day' | 'week' | 'month'` in `localStorage`; `Sidebar.tsx` treats the three views as one active item and opens the remembered one; `CalendarRange.tsx` is the segmented switch; `web/src/lib/help.ts` maps the three views to the `calendar` help page; `scripts/e2e-layout.mjs` and `scripts/docs-screenshots.mjs` have one entry per mode.
- **Shortcuts**: `g p` is `go.triage` and `g Shift+P` is All projects (`go.projects`, sidebar-favourites); `g Shift+C` (the Calendar's plan) is unbound. `Shift+C` alone is not bound in any scope a `g` sequence meets, so no conflict in `shortcuts.test.ts`.
- **Budget** (docs/interface-guide.md, `budget.test.tsx`): two rows of chrome above the first item, three scroll regions, no unregistered shortcut; the content column is the only vertical scroller unless a region is marked `data-scroll-y`.

## Goals / Non-Goals

**Goals:**
- A fourth calendar mode built from the Month's keyboard and drag model and the Week's capacity vocabulary, so a person who knows one of them knows the Plan.
- Every number on the screen is a pure function of local rows (tasks, cached events, the rule) in `web/src/lib/plan.ts`, unit-tested against the recurrence vectors, so every device shows the same plan.
- Nothing new is written. The one new state is a per-device span.

**Non-Goals:**
- No time axis, slot drag or resize (Day and Week), no change to how Day, Week and Month count capacity.
- No overdue lane, no automatic scheduling, no per-weekday day length.
- No virtualisation: 21 columns of a personal task list render as plain rows.

## Decisions

### D1. Plan is a sibling view, not a mode of CalendarView

Route `{ view: 'plan'; date?: string }` (`/plan/YYYY-MM-DD`, printed without the date when the anchor is today, as Day, Week and Month do), `CalendarMode` gains `'plan'`, the sidebar's `calendar(v)` test and `help.ts` list it, `CalendarRangeSwitch` gets a fourth entry `{ mode: 'plan', label: msg('Plan') }`, and `go.plan` (`g Shift+C`) joins the `go` section. `PlanView.tsx` is its own component like `MonthView.tsx`: `CalendarView` is built around a minute axis (`PX_PER_MIN`, lanes, resize) that the Plan does not have.

- *Alternative: a `mode: 'plan'` inside `CalendarView`.* Rejected for the reason the Month was: shared data selection and header, different geometry. The header pieces (prev / Today / next, the range switch, the calendars toggle and the status line) are reused as components; `CalendarStatus` moves out of `CalendarView.tsx` into `web/src/app/calendar/CalendarStatus.tsx` so both views import it.
- *Alternative: a Plan layout of Upcoming.* Rejected: Upcoming is a list with its own grouping and the brief keeps it unchanged; the Plan needs capacity and events, which belong to the Calendar destination.

### D2. Columns seven per row, no horizontal scroll

`spanDates(anchor, days)` gives the dates; the grid is `role="grid"` with one `role="row"` per seven dates and a `role="gridcell"` per day (`data-plan-day`, `data-drop-target="day:<ISO>"`), CSS `grid-cols-7`, each row as tall as its longest column. A 14-day span is two rows, 21 three, 7 one. Today is marked like the Month; weekday names are the row's column headers only in the first row, each cell repeating its short date.

- *Alternative: 14 columns in one horizontally scrolling strip.* Rejected: at 1280 px fourteen readable columns do not fit, so the second week would be off screen, which defeats "see the fortnight at once"; a horizontal scroller would also be the screen's second scroll region.

### D3. Rows, not blocks

A column's task rows come from `cellTasks(shownRaw, date, zone)` (timed first by time, then priority, then position), rendered like the Month's `row` (time, title, priority) plus the estimate in the Week agenda's style. Event rows (`planEvents(events, date, zone)`: `eventBlocks` for the timed ones, `allDayEvents` for the chips) sit above the tasks in the calendar's hue, as buttons that open the existing `EventDetails` popover. Projected rows sit at their time position among the tasks, `opacity` from the `text-faint` token pair, `aria-disabled`, with the text "projected" in their accessible name and a `repeat` icon. Only task rows carry `data-plan-task` and so take part in `j`/`k` order and drag.

### D4. Writes: `dnd.ts` day targets and the Month's serial queue

Identical to the Month (D3 there): `beginDrag(e, { label, onDrop: (key) => key.startsWith('day:') && dropOn(id, key.slice(4)) })` on editable rows only, `dropOn` writing `setDueWithUndo(id, dueFromView(raw.due, { date, time? }))`, and keyboard moves through a queued `getTask` → `nudgeDue(due, { days: ±1 | ±7 })` → `updateTask`, then `follow(date)`: when the new date is outside the span the view navigates to `{ view: 'plan', date: anchor ± 7 }` (whole weeks, so the row layout does not jump) with the task still selected. Rows the user cannot edit (`canEditTasks(roleOf(task.project_id, memberMap))`) get no `onPointerDown`, no `cursor-grab`, and the arrow handler returns without writing. Projected and event rows have no handler at all.

### D5. Capacity from three sources, in one pure function

`web/src/lib/plan.ts`:

```
spanDates(anchor: string, days: 7 | 14 | 21): string[]
projectedOccurrences(series: Task[], allTasks: Task[], today: string, from: string, to: string): Projection[]
   // Projection = { id: `proj:${seriesId}:${date}`, seriesId, date, time?, title, estimate_minutes }
eventMinutes(events: CalendarEvent[], date: string, zone?: string): number
   // busy timed occurrences clipped to the day (eventBlocks), intervals merged, all-day and free skipped
planLoad(tasks, projections, events, date, dayLength, zone?): PlanLoad
   // { tasks: number; events: number; projected: number; unestimated: number; total: number; over: boolean }
formatPlanLoad(load, dayLength): string            // `5h 5m / 8h`, reusing formatMinutes
planLoadTooltip(load, dayLength): string           // the Week's wording extended per source
```

`projectedOccurrences` walks `followingOccurrence(rule, cur, today, completedOn, done + i)` from the series' current due until the date passes `to` or the function returns null, with `done = completedOccurrences(series.id, allTasks)` and, for `afterCompletion` rules, `completedOn = cur` as `previewOccurrences` does; a guard stops after 31 steps per series. The capacity bar is a `div` with three stacked segments (`bg-accent` tasks, `bg-hue-solid` with the first subscription's hue for events, `bg-accent-soft` for projections) whose widths are percentages of `dayLength`, capped at 100 % with the whole bar turning `bg-danger-soft`/`text-danger` when `over`; the figure and the tooltip carry the meaning, the bar is `aria-hidden`.

- *Alternative: reuse `dayLoad` and add events and projections in the view.* Rejected: the Week's tooltip, the Month's marker and the Plan's bar would then disagree on wording and rounding; one function and one test fixture keep them aligned, and `dayLoad` stays untouched for Day, Week and Month, which the `time-blocking` spec requires to ignore events.
- *Alternative: count overlapping meetings twice.* Rejected: merging intervals is ten lines and the honest figure.

### D6. Keyboard: `view` entries `plan.*`, the Month's model

`VIEW_SCOPES.plan = []` (no lane-and-blocks calendar scope), and entries mirror `month.*`: `plan.move` (arrows: focused day or selected task), `plan.focus` (Shift+arrows, hidden), `plan.next`/`plan.prev` (`j`/`k` over `data-plan-task` rows in column order), `plan.open` (Enter), `plan.complete` (`c`, `completeWithUndo`), `plan.quick-add` (`q`), `plan.range-prev`/`plan.range-next` (`[`/`]`, seven days, `overrides: ['global.sidebar']` for `[`), `plan.today` (`t`), `plan.escape` (hidden). Section `calendar`, whose title becomes "Day, Week, Month and Plan calendar". `shortcuts.test.ts` guards the conflicts; `make docs` regenerates `docs/keyboard.md`. Up and Down move a task seven days ("a week") exactly as the Month, so the two views share one habit.

### D7. Span as a per-device grid preference

`GridPrefs` gains `planDays: 7 | 14 | 21` (default 14), normalised in `normalizeGridPrefs` (anything else → 14) and saved with `saveGridPrefs`; it lives in the same `calendar.grid` meta row, never synced. The choice sits in the Plan header's overflow menu as three `MenuItem`s with a check mark, so the header stays one row; `CalendarSettingsSection` is not changed (the menu is where the choice is used).

- *Alternative: a segmented control in the header's second row.* Rejected: it would spend the second chrome row the budget allows on a choice made once.

### D8. Phone agenda

Below 640 px (`useWide()`), `PlanAgenda.tsx` renders the span as `WeekAgenda.tsx` does: one `section` per day with the header (date, capacity bar and figure), then event rows, task rows and projected rows in the column order, the same `onSelect`/`onOpen` and the same detail panel sheet. No drag on the phone; the date is changed in the panel, as the Week agenda already works. `WeekAgenda`'s row is not reused directly because the Plan row carries the priority and the projected marker; the shared parts become a `PlanRow` used by both column and agenda.

### D9. Quick add into a column

`q` opens the Month's `Dialog` with `QuickAdd` and `createTask({ due: { date: focused }, ...input })`. Each column also ends in a ghost "Add" button (`plus` icon, visible on hover, focus-within and on coarse pointers) that opens the same dialog for its day, so touch users have a way in without `q`.

### D10. Stories and tests

`calendar.stories.tsx` gains `Plan` over `seedCalendarWeek` extended with one recurring task (`every monday`, 45 minutes) so the projected rows and the three-segment bar are in the baseline (light/dark × 375/1280 through `make ui-check`). `plan.test.ts` covers the pure functions, including a projection case per recurrence kind taken from `recurrence.vectors.json`; `planView.test.tsx` renders the view with fake IndexedDB as `monthView.test.tsx` does.

## Data model

No change. Reads: `task.due`, `estimate_minutes`, `recurrence`, `series_id`, `completed_at`, `deleted_at`, `priority`, `position`, `project_id`; cached `calendarEvents` and `calendarSubscriptions`; the `calendar.grid` meta row. Writes: only `due` (an existing field, through `updateTask`/`setDueWithUndo`) and `createTask` from quick add. Projections and loads are derived at render time and stored nowhere. No op field added, renamed or removed.

## Size and resources

No dependency. About 6 KB gzipped of client code in the main chunk (`PlanView`, `PlanAgenda`, `plan.ts`, the registry rows), in line with `MonthView`. Container image, server binary and runtime memory unchanged; the server is not touched. Projection cost: one `followingOccurrence` walk per recurring task per render, at most 31 steps each, memoised on the tasks, `today` and the span; a few hundred recurring tasks stay well under a frame.

## Interface budget

- Rows of chrome above the first item: the page header only (1 of 2); the span choice and "Plan from a list" live in its overflow menu.
- Task properties visible by default: time, title, estimate, priority on a row (4 of 7).
- Primary sidebar destinations: unchanged; Plan is a mode of the Calendar item.
- Vertical scroll regions: the content column only (1 of 3); the columns grow with their content and the phone agenda is one list.
- Shortcuts: `go.plan` (`g Shift+C`) and the `plan.*` view entries, all in `web/src/lib/shortcuts.ts`, no conflict (`g p` stays triage, `g Shift+P` stays All projects).

## Risks / Trade-offs

- [Events count in the Plan but not in Day, Week or Month, which can read as a contradiction] → the Plan's tooltip names each source ("1h 30m in calendar events"), docs/other-calendars.md says in one sentence where events count, and Day and Week keep their spec'd behaviour unchanged.
- [A projection on a day looks like a task someone can move] → dimmed rows with a `repeat` icon, "projected" in the accessible name, no hover affordance, no drag handle; the docs explain that moving the series moves its projections.
- [Three rows of seven columns at 21 days is a long page] → the page scrolls in the content column like any list; today's row comes first; the default stays 14.
- [Long titles squeeze seven columns at 640 to 900 px] → rows truncate the title with the full text in the accessible name, as the Month cell does; the 768 px layout check covers it.
- [Recurring tasks with a `for N times` end rely on `completedOccurrences`, which scans the tasks] → it already runs on completion; here it runs once per recurring task per render, memoised; measured in the unit test with 500 tasks.
- [A device offline with a stale event cache shows yesterday's meetings] → the header's "Calendars as of" status from the Week is shown, and days outside the cache read "Calendars unavailable offline for these days".

## Migration Plan

Pure UI shipped with the web bundle. The `calendar.grid` meta row gains an optional `planDays`; older rows normalise to 14. A device that opened `/plan` and then runs an older release falls back to the router's unknown-route handling, as any removed view would. Rollback is reverting the commit. Screenshots are generated with `make docs-screenshots` (`plan` only).

## Implementation notes

- **Shortcut.** `g Shift+P` became All projects (`go.projects`, sidebar-favourites) before this change was applied, so `go.plan` is `g Shift+C` (the Calendar's plan). The delta spec, proposal, design and tasks say so; `planView.test.tsx` asserts no other entry binds it and that `g p` and `g Shift+P` keep their meaning. `plan.open` and `plan.escape` are added to the `overrides` of `assistant.review` and `vim.leave-field`, as the Month's entries are.
- **Logical today.** The span starts on `useToday()` (day-boundary), and `projectedOccurrences` receives the same day as its `today`; nothing in the Plan calls `todayISO()`.
- **Calm and Detailed rows.** The Plan's rows follow calm-rows: the column states the day, so no date words; the time is muted, accent when timed today in Calm, success today in Detailed, danger before today in both; Calm colours only P1 and P2 (P3 in the muted text), Detailed P1 to P3; the estimate uses tabular figures in a neutral chip style. `PlanView` takes an optional `detail` for tests and stories, otherwise `useRowDetail()`.
- **Weekly report scenario.** A 14-day span from Monday the 12th ends on the 25th, so the 26th is not in it. The scenario now says the 21-day span (the 19th and the 26th); with 14 days only the 19th is projected (unit test).
- **Projection walk.** Completion-relative rules use the occurrence's own day as the completion date (the scenario: due the 14th → the 17th and the 20th), except that an overdue current occurrence is taken as completed today. The 31-step guard counts projections drawn per series; the walk up to the span's first day is allowed `daysBetween(due, from)` extra steps (at most 3,700), so a span far ahead still shows its projections. A projection's date is the viewer's day of the series' due moved to that date with its time and zone.
- **Event minutes.** `eventMinutes` uses `eventBlocks` but undoes its 15-minute drawing minimum and skips zero-length events, so a 5-minute meeting counts 5 minutes. Free events are listed (dashed) but not counted.
- **Events in the bar's colour.** The events segment takes the first subscription's hue (`hueFor`), as designed.
- **Projected rows** are plain elements with "projected" in their spoken text and a `repeat` icon; `aria-disabled` was left out because axe flags it on non-interactive elements, and they have no handler, tab stop or `data-plan-task`.
- **Shared parts.** `CalendarStatus` moved to `web/src/app/calendar/CalendarStatus.tsx` and the `useCalendarFeeds` hook to `web/src/app/calendar/useCalendarFeeds.ts`; Day and Week import both. `EventRow` (a timed event as a row) is in `CalendarEvents.tsx`. `PlanRow.tsx` holds `PlanTaskRow`, `ProjectedRow`, `CapacityBar` and `PlanDayRows`, used by the grid and by `PlanAgenda.tsx`.
- **Header.** The title is "Next 14 days · 12 Oct – 25 Oct" ("14 days · …" when the anchor is not today). The span choice and "Plan from a list" are in the overflow menu; the planning list's `s` puts a task on the focused day, and its drag uses the `day:` drop targets.
- **Phone agenda.** An empty day is one quiet line with "Add a task" instead of an `EmptyState`: fourteen empty-view sections with one name fail axe's `landmark-unique`. Tapping a selected row opens the panel (a double tap works too).
- **Assistant working day.** `GridPrefs` now carries `planDays`; `workday()` in `web/src/lib/assistantSkills.ts` sends only `startHour`, `endHour` and `dayLength`, because the assistant route refuses unknown fields.
- **Story.** The `Plan` story uses its own `seedCalendarPlan` (the calendar week plus a weekly Monday report, a weekly task tomorrow and a subscribed meeting tomorrow) instead of extending `seedCalendarWeek`, so the Day and Week baselines do not change.
- **Docs.** The `specs` front matter of docs/calendar-views.md does not name `planner-view` yet: `make docs-check` refuses specs that are not in `openspec/specs/`; add it when the change is archived. docs/time-blocking.md and docs/other-calendars.md were near the 600-word guide limit, so they get a short section and one sentence; the timeline paragraph of time-blocking was tightened to make room.
- **Palette.** "Go to Calendar (Plan)" is a palette command with the `g Shift+C` hint.
- **Row layout and priority mark.** In the columns a task row puts the title on its first line and time, estimate and priority on the second (one line truncated titles to a few letters at 1280 px). The priority's colour is a small dot beside muted "P1" text: coloured `text-p1`/`text-p2` at hint size failed axe's contrast check on the row's fill in the layout check. Calm: P1 and P2 dots coloured, P3 a neutral ring; Detailed: all three coloured.
- **Screenshots and baselines.** `docs/images/plan-{light,dark}.webp` were generated with `node scripts/docs-screenshots.mjs plan` (bundled Chromium) and shown in docs/calendar-views.md. No other image changed. Story baselines need `make ui-baselines` (Docker), not available here.
- **Help.** `web/src/lib/help.ts` has no per-view mapping any more; the Plan's page header passes `help="calendar"` as Day, Week and Month do, and the `?` sheet's context list (`ShortcutHelp.tsx`) includes `plan` in the calendar section.
