# Tasks

## 1. Selection model (design D1)

- [ ] 1.1 Create `web/src/app/selection.ts` (`toggle`, `extendTo`, `selectAll`, `retain`, `clear`, anchor and last-range bookkeeping, read-only skipping) and `useSelection`. Verify with unit tests for the spec scenarios: tick and extend to three, shrink the range back, select all skips read-only rows, `retain` drops a vanished id, individually ticked rows survive a shrink (`npm test` in web/).
- [ ] 1.2 Expose `ticked()` and `tick(ids)` on `ListState` in `listActions.ts` and register them from `TaskListView`, `FilterView` and `SavedViewView`. Verify with the existing `listActions.test.ts` extended with a ticked set.

## 2. Keys, rows and bar (design D2, D3)

- [ ] 2.1 Wire `x`, Space, `Shift+↓`/`↑`, `Shift+J`/`K` (Vim off), `Ctrl/⌘+A` and the Escape order into `TaskListView.tsx` and `useListKeys.ts`, with board columns for extension. Verify with component tests: `x` then `Shift+ArrowDown` twice ticks three rows; Escape closes the panel first, then clears ticks; Space with no cursor is not prevented; `Ctrl+A` with nothing ticked is not prevented.
- [ ] 2.2 Add a `vim/dispatch.test.ts` case that `Shift+ArrowDown` and Space return `false` from `handle()` and that `x` with a ticked set calls `toggleCompleteSelected`; make `vim/actions.ts` `toggleCompleteSelected` and `deleteSelected` act on `ticked()` when non-empty. Verify with `npm test`.
- [ ] 2.3 Add the checkbox to `TaskRow.tsx` (hover, cursor, any-ticked and Select mode; 44 px on touch; "Select <title>" label), Shift+click range and `Ctrl/⌘+click` toggle. Verify with a component test (Shift+click ticks a range and opens nothing) and an axe check.
- [ ] 2.4 Build `bulk/SelectionBar.tsx` (count in `role="status"`, Actions menu, Clear) and the touch Select / Done button, mounted in `TaskListView`, `FilterView` and `SavedViewView`. Verify with a component test that the bar appears at one tick, reads "3 selected" at three and disappears at zero.
- [ ] 2.5 Build the Actions menu on `app/overlay` `Menu` kind `menu` (items, shortcuts, mixed-state Complete / Reopen label, Assign disabled with reason) and bind `.` to open it for the ticked or cursor task. Verify with a component test: `.` with four ticked opens a menu titled "4 tasks" with focus on the first item; two projects ticked disables Assign with the reason text.
- [ ] 2.6 Add the shortcut rows (`x` / Space, `Shift+↓` / `Shift+↑`, `Ctrl/⌘+A`, `.`, `Ctrl/⌘+Z`) to `web/src/lib/shortcuts.ts` and regenerate `docs/keyboard.md` with `make docs`. Verify with `npm run docs:check` in web/.

## 3. Planners and one-batch writes (design D4)

- [ ] 3.1 Factor `planProjectChange` out of `updateTask` (`ops.ts:647-676`) and `planCompletePlain` out of `completePlain`, keeping the public helper signatures. Verify with the existing `ops.test.ts`, `recurring.test.ts` and `subtasks` tests unchanged and passing (`npm test`).
- [ ] 3.2 Create `web/src/lib/bulk.ts` with `planComplete`, `planReopen`, `planPriority`, `planDue`, `planLabels`, `planTrash`, `planMove`, `planAssign`, change merging by entity id, and `applyBulk` (device id, one transaction, one `applyBatch`). Verify with unit tests for the spec scenarios: five tasks with one weekly series complete in one batch and the series rolls; mixed completion state; parent and subtask both ticked yield one tombstone per task; "Tomorrow" keeps an existing time; labels read each task's current array; a move into a shared project produces copies plus tombstones; an offline `applyBulk` leaves every op in the outbox with one timestamp.
- [ ] 3.3 Route `c`, `1`–`4`, `L` (picker in multi mode: common labels checked, add to all / remove from all), `Shift+A` and Delete through the planners when tasks are ticked, in `TaskListView`, `useListKeys` and the Actions menu; Date presets use `weekStartOf` for "Next week" and the DateField for "Pick a date". Verify with component tests: `c` on three ticked rows writes one batch; `L` then "errand" adds it to the two tasks lacking it and the picker stays open; Date → Tomorrow reschedules three.
- [ ] 3.4 Run the two-device recurring convergence test (`recurring.test.ts`, "same occurrence on two devices") against `planComplete`. Verify with `npm test`.

## 4. Undo (design D5)

- [ ] 4.1 Extract `applyBatch` / `undoBatch` into `web/src/lib/undo.ts` with `source` and `label` on the `assistantUndo` row, make `assistant.ts` call them, and treat rows without `source` as `assistant`. Verify with the existing `assistant.test.ts` undo cases moved to `undo.test.ts` and passing, plus a case for a cross-scope move (copies trashed, originals restored).
- [ ] 4.2 Build `bulk/UndoToast.tsx` in the Shell's `ToastRegion` (label, Undo button, 10 s, replaced by the next action, `Ctrl/⌘+Z` outside text fields, skipped fields named). Verify with component tests: Undo after rescheduling eight restores eight; a hand-reopened task is skipped and named; Tab reaches Undo and Enter undoes; `Ctrl+Z` inside a textarea is not intercepted.
- [ ] 4.3 Add a line on undoing a bulk action to `docs/trash-and-history.md`. Verify with `npm run docs:check`.

## 5. Review for moves and assignments (design D6)

- [ ] 5.1 Build the review dialog on `ChangeSetReview` and `reviewChangeSet` (title "Move n tasks to X" / "Assign n tasks to Y", copies shown as "copied into", Enter applies checked items through `applyBatch`, Escape keeps the selection), with neutral test ids. Verify with component tests for the spec scenarios: untick one of six and apply → "5 of 6 changes applied"; Escape writes nothing; a shared destination is badged.
- [ ] 5.2 Wire Move to project…, Move to section… (Combobox step inside the menu overlay, project source from `pickerSources.ts`) and Assign… (member source of the common shared project) to the review. Verify with a component test that Assign is offered only when every ticked task is in one shared project.

## 6. Docs, layout and palette coordination

- [ ] 6.1 Write "Change several tasks at once" in `docs/tasks-and-projects.md` (ticking with keyboard, pointer and touch; the bar and `.`; what applies at once and what is reviewed; Undo) and regenerate the help bundle. Verify with `npm run docs:build` and `npm run docs:check` in web/.
- [ ] 6.2 Add `bulk-actions-menu`, `bulk-review` and `bulk-toast` overlays to `scripts/e2e-layout.mjs` on the Inbox screen. Verify with `make layout-check` at 360, 390 and 768 px in Chromium and WebKit, including the 44 px checkbox on touch viewports.
- [ ] 6.3 If `search-and-command-palette` has landed, make its selected-task commands act on `ticked()` when non-empty ("Complete 3 tasks") and add Move, Assign and Date commands for the selection; otherwise record in that change's tasks that it must do so. Verify with the palette's registry tests, or the note in its `tasks.md`.

## 7. Integration

- [ ] 7.1 Manual smoke on `make dev`: tick with `x`, Space, `Shift+↓`, Shift+click and the touch Select button at 390 px; `c`, `2`, `L`, Date → Tomorrow and Delete on a selection; Move to a shared project through the review; Undo by button and `Ctrl+Z`; the same flows in the Filter view and on a board; with Vim keybindings on, Space + `Shift+↓` then `x`, and `J` still moving the task. Confirm on a second device that the batch arrived as ordinary ops and the undo converged. Record the result in the change folder notes.
- [ ] 7.2 Run `make check` (go test, web test and build, docs check, ui lint) and `make layout-check`. Verify both pass.

## Workflow follow-up

- Move ROADMAP.md "Next: Parity and depth" row 4 to the Shipped table ("Multi-select and bulk actions | `bulk-edit`").
- Add a CHANGELOG.md entry under Unreleased → Added, linking the tasks guide section.
- Archive with `/opsx:archive`, then confirm `npx @fission-ai/openspec validate --all --strict` passes.
