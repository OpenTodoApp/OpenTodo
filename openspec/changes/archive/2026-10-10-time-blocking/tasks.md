# Tasks

## 1. Op schema and data layer

- [x] 1.1 Add `task.estimate_minutes` with a minutes validation kind (integer 1–10080 or null) to `internal/sync/ops.go`; verify `TestValidateEstimateMinutes` (valid, zero, fractional, string, too large) (`go test ./...`)
  - Note: the field and its validation kind (`kPositiveInt`, 1–10080 or null) already shipped with `nlp-quick-add`; reused as is, not re-added. Added `TestValidateEstimateMinutes` and `TestEstimateAndDueConvergeIndependently` in `internal/sync/estimate_test.go`.
- [x] 1.2 Mirror the field in `web/src/lib/types.ts`, `TASK_FIELDS` and defaults in `web/src/lib/ops.ts`; verify `ops.test.ts` round-trips an estimate and LWW keeps estimate and due independent (`npm test`)
  - Note: types, `TASK_FIELDS` and defaults already existed (nlp-quick-add); added the LWW-independence and clear-to-null tests to `ops.test.ts`.
- [x] 1.3 `parseDuration` (`15m`, `1h`, `1h30`, `90`) and `formatMinutes` helpers; verify `duration.test.ts` (`npm test`)
  - Note: new `web/src/lib/duration.ts` reuses the quick-add duration matcher; its `formatMinutes` writes `1h 30m` (spec) and rows now use it. The quick-add chip keeps its compact `+1h30m` style.
- [x] 1.4 REST and export include the field; update `docs/sync.md` and `docs/api.md`; verify `TestTaskPatchEstimate` (`go test ./...`) and the docs tables list the field
  - Note: REST, export and both docs tables already carried the field; the tables now mention the calendar block, and `TestTaskPatchEstimate` (`internal/httpapi/estimate_test.go`) covers auth, validation, independence from `due` and export.

## 2. Estimate UI and duration filter

- [x] 2.1 Detail panel estimate control with presets and shorthand, `e` shortcut from a selected row, duration badge in rows; verify browser flow: `e`, type `1h30`, Enter shows `1h 30m` on the row; `npm run build` passes
  - Verified in the browser smoke run: `e` on a Today row focuses the estimate input, `1h30` + Enter shows `1h 30m` on the row.
- [x] 2.2 `durationPredicate` in `src/lib/filters.ts` and filter chips in Inbox, Today, Upcoming and project views persisted per device; verify `filters.test.ts` for all four kinds (`npm test`) and browser flow: filter survives an offline reload
  - `filters.test.ts` covers the four kinds and per-view persistence; the browser smoke run kept "Quick wins" active across an offline reload. The predicate is not wired into the filter query language: the design (D6) leaves that mapping to a later change.

## 3. Calendar grid

- [x] 3.1 Pure `layoutDay` for overlapping blocks (lanes, widths, overlap flag, +N cap); verify `layout.test.ts` with disjoint, nested and chained overlaps (`npm test`)
- [x] 3.2 Day and Week views (`g d`, `g w`), 15-minute grid, unscheduled lane, dashed unestimated blocks, current-time line, capacity header; verify browser flow offline: week renders timed tasks as blocks, date-only tasks in lanes, over-capacity day marked
  - `calendar.test.ts` covers blocks, capacity, weeks and placement math; the browser smoke run checked blocks, the lane, the dashed unestimated block, the seven-column week and the capacity header. Deviations: the week was rendered online (offline rendering was exercised by the offline reload in 2.2 and the offline edits in 4.1), and over-capacity marking is covered by unit tests (`9h / 8h`) rather than the browser run.
- [x] 3.3 Pointer drag from lane, list and block to slot; drop on lane clears time; resize handle sets estimate; verify browser flow: drop at 14:30 updates the detail panel's due time, resize by two rows sets 60 minutes
  - Browser smoke run: lane chip dropped at 14:30 (detail panel shows 14:30), block dragged to 16:00, lower edge dragged two rows sets 60 minutes. The list source is a "Plan from a list" panel beside the grid (Inbox, no date, overdue, any project).
- [x] 3.4 Keyboard parity: arrows, `Shift+Up/Down`, Enter, `s` placement mode from lists, Escape cancels; update `?` help; verify browser flow with no pointer: schedule a Today task to 09:30 and extend it to 45 minutes
  - Browser smoke run with keys only: `s` on a Today task, arrows to 09:30, Enter, Shift+Down to 45 minutes; two Down presses move a block 10:00 → 10:30. Extra keys: `u` unschedules (keyboard twin of dropping on the lane), `p` re-enters placement for a selected block, `[` / `]` / `t` change the range.
- [x] 3.5 Grid preferences in Settings stored in `meta` (start hour, end hour, day length); verify browser flow: change day length to 6 h, capacity marker updates, second device unaffected
  - Browser smoke run: day length 6 h on device A shows `/ 6h`, device B still shows `/ 8h`.

## 4. Integration and docs

- [x] 4.1 Two-device flow: A sets estimate offline, B drags the task to another slot offline, reconnect; verify both show A's estimate and B's time with no console errors
  - Browser smoke run (two contexts, both offline): A sets 25 minutes, B moves the block 11:00 → 12:00 (with arrow keys rather than a pointer drag; both write the same `due` op); after reconnecting both show 12:00 for 25m, no console errors.
- [x] 4.2 README feature list and screenshot, `CHANGELOG.md` Unreleased; verify `make check` passes
