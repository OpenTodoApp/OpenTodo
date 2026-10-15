# Proposal

## Why

Every list action in OpenTodo works on exactly one task: the cursor row (`selectedId` in `web/src/app/TaskListView.tsx:252`, the `selected` key in `useListKeys.ts`). Completing a finished sprint, moving ten tasks to another project, relabelling a week's worth of Inbox or trashing a dozen stale items means repeating `j`, `c`, `j`, `c`. Todoist, Things and Linear all have multi-select with actions on the selection; the comparison pages concede it. The pieces are in place: `mutateMany()` records a batch of changes atomically (`web/src/lib/ops.ts:269-300`), the assistant already stores the inverse of a batch and undoes it in one step (`web/src/lib/assistant.ts:313-384`), and its review list shows "n changes" before they apply (`web/src/app/assistant/ChangeSetReview.tsx`).

## What Changes

- **Select several tasks.** `x` (or Space) ticks the cursor row, `Shift+↓`/`Shift+↑` (also `Shift+J`/`Shift+K` without Vim keybindings) extend a range from where ticking started, `Ctrl`/`⌘`+`A` selects every row of the list once something is ticked, Escape clears. With a pointer, a checkbox on each row (on hover or on the cursor row; always while a selection exists), Shift+click for a range and `Ctrl`/`⌘`+click to toggle. On touch screens a **Select** button turns the checkboxes on for every row until **Done**. Read-only tasks (viewer of a shared project) cannot be ticked. Works in every task list, on the board, in the Filter view and in saved views.
- **One bar, one menu.** While tasks are ticked, a bar above the list says "3 selected" and holds **Actions** and **Clear**. `.` opens the Actions menu for the ticked tasks, or for the cursor task when nothing is ticked: complete or reopen, priority 1–4, labels, date (today, tomorrow, next week, no date, pick a date), move to a project or section, assign, move to Trash. The existing keys `c`, `1`–`4`, `L`, `Shift+A` and Delete apply to the whole selection.
- **One batch of operations.** Each action is planned as one list of field changes and written with a single `mutateMany()`: it applies locally at once, works offline, syncs as ordinary ops and converges per field by last-writer-wins. Completing a recurring task in a batch rolls it forward by its rule as `c` does; completing or trashing a parent takes its open subtasks along; a task's label array is read in the same transaction it is written in, so the whole-array rule of `labels` holds.
- **Moves and assignments are reviewed first.** Moving to another project or section and assigning show the "n changes" review from the assistant (each task with its change, shared projects marked, `Enter` applies, `Esc` discards), because a move can change who sees a task and an assignment tells someone. Everything else applies at once.
- **Undo in one step.** Every bulk action shows a toast ("12 tasks completed · Undo") for ten seconds; its Undo button, or `Ctrl`/`⌘`+`Z` outside a text field while the toast shows, puts the previous values back as one new batch, offline-capable and convergent, skipping and naming fields changed again since. The assistant's undo store is generalised and shared; the last 20 batches on the device stay undoable.
- **Vim keybindings keep their meaning.** `x` still completes (now the selection when several tasks are ticked) and `J`/`K` still move the cursor task, so Vim users tick with Space and extend with `Shift+↓`/`Shift+↑`.
- **Docs and help.** New shortcuts in `?` and the keyboard guide; a "Change several tasks at once" section in the tasks guide.

Out of scope:
- Selection in the Day and Week calendars and on dashboards.
- Bulk estimate, recurrence, reminders, zone, "this occurrence only" and skip; `a`, `e`, `s`, `Shift+O`, `Shift+S`, Tab and `Alt+↑/↓` keep acting on the cursor row.
- Bulk actions on projects, labels or views.
- A general task-row context menu (`labels-and-menus` leaves it to "a later task-list change"); the Actions menu here is the selection's menu, shown for one task only when nothing is ticked.
- Drag-and-drop of a multi-selection (dragging moves the row under the pointer, as today).
- Server-side batch routes. The CLI and API already loop over `PATCH` calls.

ROADMAP: advances "Next: Parity and depth" row 4, "Multi-select and bulk actions", `bulk-edit`. Refinements of the row's notes: Space is a second toggle key and `Shift+↓`/`↑` a second extension key so that Vim mode, where `x` and `J`/`K` are taken, keeps working; the assistant's review is used for moves and assignments only, while reversible actions apply at once with Undo, which the assistant's auto-apply rule already treats as the safe set (`web/src/lib/assistant.ts:394`).

Nothing here is **BREAKING**: no op field, no API route, no environment variable, no Dexie version. Device-local undo rows reuse the existing `assistantUndo` table with a new `source` field.

Depends on: nothing. Coordination: `search-and-command-palette` lists selected-task commands through its registry; whichever change lands second makes those commands act on the ticked tasks (task 6.3 here).

## Capabilities

### New Capabilities
- `bulk-actions`: selecting several tasks with keyboard, pointer and touch; the selection bar and Actions menu; actions that apply to the selection as one batch of operations; the review before moves and assignments; and one-step undo of a batch.

### Modified Capabilities
- `web-app`: "Normal-mode motions and counts" states that with Vim keybindings `x` completes the ticked tasks and `J`/`K` keep moving the cursor task, so selection uses Space and `Shift+↓`/`↑` there.

## Impact

- **Web:**
  - `web/src/app/selection.ts` (new: the selection model, pure) used by `TaskListView.tsx` (keys at 437-640, rows at 680-720, board columns), `useListKeys.ts` (Filter and saved views) and `TaskRow.tsx` (checkbox)
  - `web/src/app/bulk/` (new: the bar, the Actions menu on `app/overlay` `Menu` kind `menu` with `ui/Menu` items, the date submenu with the `datetime` DateField, the review on `assistant/ChangeSetReview.tsx`, the toast)
  - `web/src/lib/bulk.ts` (new: planners that turn an action and the selected rows into one `Change[]`, reusing `planCompletion`, `copyTasks` and the project-change logic of `updateTask` in `ops.ts:641-676`, which is factored into a planner)
  - `web/src/lib/undo.ts` (new: `applyBatch` / `undoBatch` extracted from `assistant.ts:313-384`, which then calls it); `web/src/lib/db.ts` `AssistantUndo` gains `source`
  - `web/src/app/listActions.ts` (`ListState` exposes the selection), `web/src/app/vim/dispatch.ts` (no change to consumed keys; a test pins that `x` and `J`/`K` behave as before and `Shift+↓`/`↑` pass through)
  - `web/src/lib/shortcuts.ts`, `docs/keyboard.md` (regenerated), `scripts/e2e-layout.mjs` (three overlays)
- **Server:** none. Batches are ordinary ops; `internal/activity` derives events per op and the existing run grouping (`lib/activityRuns.ts`) folds a burst into one line.
- **Docs:** `docs/tasks-and-projects.md` (new section), `docs/keyboard.md`, `docs/trash-and-history.md` (one line on undoing a bulk action), help bundle, CHANGELOG.
- **Size:** no new dependency. The bar, menu, review and planners are an estimated 4–5 KB gzipped in the main bundle (the bar renders in every list). Memory: a `Set` of ids while a selection exists; undo rows are bounded at 20 per device as today. Go binary and image change only by the embedded bundle.
