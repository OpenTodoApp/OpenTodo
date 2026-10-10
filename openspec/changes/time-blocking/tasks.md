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

- [ ] 2.1 Detail panel estimate control with presets and shorthand, `e` shortcut from a selected row, duration badge in rows; verify browser flow: `e`, type `1h30`, Enter shows `1h 30m` on the row; `npm run build` passes
- [ ] 2.2 `durationPredicate` in `src/lib/filters.ts` and filter chips in Inbox, Today, Upcoming and project views persisted per device; verify `filters.test.ts` for all four kinds (`npm test`) and browser flow: filter survives an offline reload

## 3. Calendar grid

- [ ] 3.1 Pure `layoutDay` for overlapping blocks (lanes, widths, overlap flag, +N cap); verify `layout.test.ts` with disjoint, nested and chained overlaps (`npm test`)
- [ ] 3.2 Day and Week views (`g d`, `g w`), 15-minute grid, unscheduled lane, dashed unestimated blocks, current-time line, capacity header; verify browser flow offline: week renders timed tasks as blocks, date-only tasks in lanes, over-capacity day marked
- [ ] 3.3 Pointer drag from lane, list and block to slot; drop on lane clears time; resize handle sets estimate; verify browser flow: drop at 14:30 updates the detail panel's due time, resize by two rows sets 60 minutes
- [ ] 3.4 Keyboard parity: arrows, `Shift+Up/Down`, Enter, `s` placement mode from lists, Escape cancels; update `?` help; verify browser flow with no pointer: schedule a Today task to 09:30 and extend it to 45 minutes
- [ ] 3.5 Grid preferences in Settings stored in `meta` (start hour, end hour, day length); verify browser flow: change day length to 6 h, capacity marker updates, second device unaffected

## 4. Integration and docs

- [ ] 4.1 Two-device flow: A sets estimate offline, B drags the task to another slot offline, reconnect; verify both show A's estimate and B's time with no console errors
- [ ] 4.2 README feature list and screenshot, `CHANGELOG.md` Unreleased; verify `make check` passes
