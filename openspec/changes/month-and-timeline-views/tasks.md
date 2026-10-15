# Tasks

## 1. Month math and route (design D1, D2)

- [x] 1.1 Create `web/src/lib/month.ts`: `monthGrid(anchor, weekStart)` (six rows on `weekDates`), `cellTasks` (timed by time, then priority, then position), `visibleRows`. Verify with unit tests for a Sunday and a Monday week start, a month spanning six rows, zoned dues (via `viewedTask`) and the cell order (`npm test` in web/).
- [ ] 1.2 Add `{ view: 'month'; date? }` to `web/src/app/router.ts` (path `/month/YYYY-MM-DD`), the sidebar entry after Week (`calendar-days`), `g m` in `web/src/lib/shortcuts.ts` and the Month button in the Day | Week | Month switch extracted into a shared `CalendarHeader`. Verify with router tests for parse and print, and `npm run build`; run `make docs` so `docs/keyboard.md` lists `g m`.

## 2. Month view (design D2, D3, D4, D8)

- [ ] 2.1 Build `web/src/app/MonthView.tsx`: six-row `role="grid"` with roving day focus, today marked, outside days dimmed, cells from `cellTasks` with "+N more" expansion and the capacity marker from `dayLoad` when planned > 0. Verify with a component test for the overflow control and the `9h / 8h` marker, and an axe check in the test (`npm test`).
- [ ] 2.2 Writes: day drop targets on `lib/dnd.ts` (`day:<ISO>`) writing `due` through `dueFromView` with the time kept; keyboard moves (Left/Right a day, Up/Down a week) through a serial edit queue with `nudgeDue`, following the task into the next month; no drag or keys for tasks the user cannot edit. Verify with tests for the three spec scenarios (time kept, week move offline queues one op, viewer cannot move) (`npm test`).
- [ ] 2.3 Keyboard model: `j`/`k` task selection in grid order, Enter opens, Escape steps back to day navigation, `q` quick-adds with the focused day as due context, `[`/`]`/`t`. Verify with a component test for "focus the 15th, `q`, type, Enter → task due on the 15th" and the `j j Enter` scenario (`npm test`).
- [ ] 2.4 Phone layout below 640 px: count badges, the focused day's tasks under the grid as list rows. Verify with `scripts/e2e-layout.mjs` entries at 360, 390 and 768 px (`npm run test:browser` after a build).
- [ ] 2.5 Document the Month view in `docs/time-blocking.md` (a "See the month" section) and `docs/views.md` (table row and a paragraph), with screenshots from `make docs-screenshots`. Verify with `npm run docs:check` in web/.

## 3. Timeline math and layout switch (design D5)

- [x] 3.1 Create `web/src/lib/timeline.ts`: `spanOf` (earliest to latest of `start`, due date in the viewer's zone and `deadline`; null for no dates or `start === 'someday'`), `axis` (days, or weeks on the preferred first day), `shiftDates`, `edges`. Verify with unit tests for the spec scenarios (all three dates, due only, someday, a past deadline flagged) and for `shiftDates` keeping the due time and zone and touching only present fields (`npm test`).
- [ ] 3.2 Extend `ProjectViewMode` in `web/src/lib/sections.ts` to `'timeline'` with unknown values read as `list`, cycle `v` list → board → timeline in `TaskListView.tsx`, and make the `ProjectHeader` toggle three-way. Verify with the existing `sections.test.ts` extended for the new value and a test that `v` twice from the board lands on the list (`npm test`).

## 4. Timeline view (design D5, D6, D7, D8)

- [ ] 4.1 Build `web/src/app/TimelineView.tsx` rendered from `TaskListView` with the list's section groups and tree depth: sticky labels, the day/week axis with a today line, bars from `spanOf` with due and deadline markers, clipped bars with a "beyond" glyph, the "Unscheduled" group, the Days/Weeks toggle reachable by Tab, `[`/`]`/`t`. Verify with component tests for the three bar scenarios and the zoom switch, plus an axe check (`npm test`).
- [ ] 4.2 Writes: bar drag and edge drag on `lib/dnd.ts` day columns (`shiftDates` in one `mutateMany` batch; left edge → `start`, right edge → `deadline`, created when absent; unscheduled row → `due`), keyboard Left/Right and Shift+Left/Right, read-only for viewers. Verify with tests for the spec scenarios (shift keeps 09:00, right edge creates the deadline, Shift+Right seeds the deadline from the due date, concurrent different-field edits both apply) (`npm test`).
- [ ] 4.3 Dependencies: arrows from `edges` as one inline SVG overlay with a halo, the relation in the dependent row's accessible name, blocked rows dimmed through `isBlocked` from `task-dependencies`. Verify with a test that the arrow and dimming appear and disappear when the blocker is completed by a remote op (`npm test`). Gate on `task-dependencies` being archived; until then `edges` returns none.
- [ ] 4.4 Phone layout below 640 px: sticky 40 % label column, horizontally scrolling axis marked `data-scroll-x`, touch press-and-hold drag. Verify with `scripts/e2e-layout.mjs` entries at 360, 390 and 768 px (`npm run test:browser`).
- [ ] 4.5 Document the timeline in `docs/sections-and-boards.md` (the third layout, `v` cycle), `docs/views.md` and `docs/time-blocking.md` (a short "Plan a project on a timeline" section), with screenshots from `make docs-screenshots`; run `make docs` for the new timeline shortcuts. Verify with `npm run docs:check`.

## 5. Integration

- [x] 5.1 Confirm the sibling contracts once they are archived: `task.deadline`, `task.start` (`someday`) and `task.blocked_by` are read by `timeline.ts` under the names and shapes their specs state; adjust `spanOf` and `edges` and their tests if a name differs. Verify with `npm test` and `npx @fission-ai/openspec validate --all --strict`.
- [ ] 5.2 Manual smoke on `make dev`: open the month at 360 px and desktop, drag a timed task across days, move one with the keys into the next month, switch a project to its timeline, drag a bar and an edge, check the arrow between a blocked pair and its disappearance on completion. Record the result in the change folder notes.
- [ ] 5.3 Run `make check` (go test, web test and build, docs check, ui lint). Verify it passes.

## Workflow follow-up

- Add a CHANGELOG.md entry under Unreleased ("Month view (`g m`) with drag and keyboard rescheduling; project timeline with start, due and deadline bars, dependency arrows and `v` cycling through list, board and timeline").
- Mark ROADMAP.md row 11 as shipped by its change name.
- Archive with `/opsx:archive` after `deadlines`, `someday-and-evening` and `task-dependencies`, then confirm `npx @fission-ai/openspec validate --all --strict` passes.
