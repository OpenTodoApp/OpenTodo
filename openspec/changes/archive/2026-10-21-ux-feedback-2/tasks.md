# Tasks

## 1. Reopen the day

- [x] 1.1 Add the additive `carry_over` field (`kString`, JSON, `""` = none) to the `review` entity in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`; verify with `go test ./internal/sync/...` (unknown-field and LWW tests extended) and `npm test -- ops`
- [x] 1.2 Record the carry-over in the Apply batch (`lib/review.ts` `applyCarryOver`): date and each task's field `before`/`after`; verify with a `closeDay.test.tsx` case asserting the stored record for a mixed-decision apply
- [x] 1.3 Add `reopenDay()` in `lib/review.ts`: one batch writing `before` where the field still equals `after`, `closed_at = 0`, `carry_over = ""`, keeping `tomorrow_note`, with the bulk undo and the "changed since" naming; verify with unit tests for the spec scenarios "Reopen after the toast is gone", "A task changed since the close" and "Next morning"
- [x] 1.4 Show "Reopen the day" on `CloseDayRow` and in the Close the day screen while the logical day is closed; verify with a happy-dom test that the row offers Reopen after a reload of the local data and not after the day start
- [x] 1.5 Two-device convergence and the older-server case; verify with the e2e two-device script (`make e2e`, a new step closing on device A and reopening offline on device B) and a Go test rejecting `carry_over` on a server without the field
- [x] 1.6 Docs: `docs/method/rhythms.md` "Close the day" gains Reopen; translations for the new strings in every catalog; verify with `make docs-check` and `node scripts/i18n-check.mjs`

## 2. Dates and times while scheduling

- [x] 2.1 Process the Inbox and Focus show the due through `formatDueLong` (`localDueOf` + the date and time formats); verify with `triageView.test.tsx` and a Focus test rendering `15:00` as `3:00 PM` under `time_format: '12h'` and a zone-fixed due in the viewer's zone
- [x] 2.2 The DatePicker placeholder builds its example date with `formatDate(..., 'numeric', resolved)`; verify with a test under `month-day` asserting no `22/10` in the placeholder
- [x] 2.3 Add a source check to `make ui-lint` that fails on `due.time` concatenated into text outside `lib/dates.ts`; verify the lint fails on a fixture and passes on the tree

## 3. Drop a task on a project or a label

- [x] 3.1 Teach `task-list/useListDrag.ts` the `data-task-drop` targets (`project:<id>`, `inbox`, `label:<id>`): ring on the target, no list drop line, Escape cancels; verify with a happy-dom drag test
- [x] 3.2 Mark sidebar project rows, the Inbox entry, Favourites (projects and labels) and sidebar labels with `data-task-drop`, skipping projects the user may not add to; verify with a test that a viewer's project shows no ring
- [x] 3.3 Drop actions: `moveWithUndo` for projects and the Inbox, a new `addLabelWithUndo` for labels, both batched over the bulk selection; verify with tests for "Drop on a project", "Several selected tasks", "Add a label by dropping" and "Already labelled"
- [x] 3.4 Board cards use the same targets; verified with the board case in `sidebarDrop.test.tsx` (no layout-check drag step: the phone layout check opens the sidebar as a drawer over the list, so there is nothing to drop onto there)
- [x] 3.5 Docs and cheat sheet: `docs/bulk-actions.md` ("Drop on the sidebar", linked from `docs/work-from-the-list.md`; the tasks guide is at its 600-word limit) and the `Shift+L` description mention dragging (lists have no `m`; moving by keyboard is **Move to project** in the `.` menu); verify with `make docs-check` and the shortcut registry test

## 4. Calmer rows

- [x] 4.1 Row hover becomes a 3% neutral tint, the selected row a 2 px bar and a 4% accent tint, and hovering the selected row adds nothing (`index.css`, `TaskRow.tsx`); verify with the visual baselines for the row stories (`make ui-baselines`) and the layout check's axe contrast pass in light and dark
- [x] 4.2 Nothing in a row changes size or colour of its metadata on hover; verified in `taskRow.test.tsx` (a two-line row's metadata line carries no hover or group-hover class, the selected row no hover style; CSS `:hover` cannot be triggered in happy-dom)

## 5. Sidebar tree

- [x] 5.1 16 px indent per level, 2 px between rows, 6 px after an expanded root's subtree, and the parent-to-children guide line (CSS, `aria-hidden`), capped with the indentation; verify with `sidebar.test.tsx` for the structure and the sidebar story baselines
- [x] 5.2 Check 360 px with four levels; verify with the layout check at 360 px (no horizontal scroll, tooltip with the full path)

## 6. One page frame

- [x] 6.1 The page header and page body primitives render inside one frame (centred, at most 80 rem, same padding); content widths apply left-aligned inside it; verify with `pageTemplate.test.ts` asserting the frame on every view
- [x] 6.2 Lists, columns layout, board, timeline, Plan and calendars use the body primitive; wide content scrolls sideways inside the frame; verify with `budget.test.tsx` (no new vertical scroll region) and the timeline/Plan stories
- [x] 6.3 A frame check comparing the header's left and right edges and the content's left edge across Inbox, a project in list, board and timeline, Labels, Trash and Filter at 1280 and 1440 px (the layout check runs at phone widths, so the step lives in `scripts/e2e-views.mjs`); verify with `make e2e`
- [x] 6.4 Update `docs/interface-guide.md` (page frame) and regenerate the affected screenshots with `make docs-screenshots`; verify with `make docs-check` — the guide is updated and `make docs-check` passes; the screenshots are not regenerated yet (lists now start at the frame's left edge, so list screenshots are stale until `make docs-screenshots` runs) — Verified 2026-10-21: `make docs-screenshots` regenerated every guide image (the repeat and locations scenes now open their tasks from Today, since dated tasks are no longer in the Inbox); `make docs-check` passes.

## 7. Wrap-up

- [x] 7.1 `make ci-checks`, `make e2e`, `go test ./...`, `cd web && npm test && npm run build` and the layout check (Chromium, 360 px, inbox and project) pass; `npm test` locally has the known planView failure outside UTC (passes with TZ=UTC) and two timing tests that pass alone
- [x] 7.2 CHANGELOG.md entries under Unreleased for Reopen the day, dropping on projects and labels, the calmer rows, the sidebar tree and the page frame, and the format fix under Fixed; verify by reading the Unreleased section
