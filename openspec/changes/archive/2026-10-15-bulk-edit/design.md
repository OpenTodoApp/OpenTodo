# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **One cursor, no set.** `TaskListView.tsx:252` keeps `selectedId`; the keys at 437-640 act on `selectedId` or the cursor `row`; `useListKeys.ts` does the same for the Filter and saved views with a `selected` key. `TaskRow.tsx` renders the row with a `selected` boolean and has no checkbox. `ListState` (`listActions.ts:32-47`) exposes `selected()` / `select()` to the Vim layer.
- **Keys already taken.** Default mode: `x` is free (`g x` is the Trash, guarded by `isGPending()`), `Shift+J`/`K` are free, `.` is free on task rows (`labels-and-menus` gives it to label, view and section rows), Space is free, `Ctrl/⌘+A` and `Ctrl/⌘+Z` are browser defaults outside fields. Vim mode (`vim/dispatch.ts`): `x` completes, `J`/`K` move the task, `dd` deletes; arrows without a count and modified keys pass through (`dispatch.ts:107-111, 161-170`), so `Shift+↓`/`↑` and Space reach the list unchanged.
- **Batches exist.** `mutateMany(changes)` writes any number of entities' fields in one transaction with one timestamp (`ops.ts:269-300`); `completeTask` plans a recurring completion with `planCompletion` and writes it inside a transaction (`ops.ts:709-731`); `completePlain` and `deleteTask` already build subtree batches; `moveTaskAcrossScopes` uses `copyTasks` to produce copy-plus-tombstone changes (`ops.ts:589-637`); `rewriteTaskLabels` reads the array inside the transaction before writing it (`lib/labels.ts`).
- **Undo exists for the assistant.** `applyChanges` stores the inverse (previous values, `created` for new entities) and the clock each field received; `undoChanges` restores fields whose clock is still the batch's and names the rest; rows live in the device-local `assistantUndo` Dexie table, 20 kept (`assistant.ts:303-384`, `db.ts:39-49`). The auto-apply rule names completion, due, priority and labels as the small reversible set (`assistant.ts:394`).
- **Review exists.** `ChangeSetReview` takes a `Review` (`items` with `title`, `lines`, `shared`, `state`, `checked`; `dropped`), applies on Enter and discards on Escape (`assistant/ChangeSetReview.tsx`); `reviewChangeSet(changes)` builds it from `ProposedChange[]` (`assistant.ts:261`).
- **Overlays and menus.** `app/overlay` `Menu` with `kind="menu"` and `ui/Menu` `MenuItem` (`shortcut`, `description`, `disabled`, `danger`), `Dialog`, `ToastRegion`. The `datetime` DateField from `date-time-preferences` parses typed dates.
- **Touch.** Press-and-hold on a row starts a drag in manually ordered views (`lib/dnd`), so long-press cannot mean "select".

## Goals / Non-Goals

**Goals:**
- A selection model that is pure and shared by every list, so the keys behave the same in a project, on the board, in the Filter view and in a saved view.
- Every action is one `Change[]` and one `mutateMany()`, with the inverse stored first, so undo is one step and the op log sees ordinary ops.
- No new keys that break the Vim promise in `web-app` ("Existing shortcuts keep working", "Normal-mode motions and counts").

**Non-Goals:**
- A persistent or synced selection.
- Changing how a single-task action works; the planners reuse the single-task rules.
- A general task context menu (the Actions menu is the selection's menu).

## Decisions

### D1. Selection model: cursor plus ticked set plus anchor, in a pure module

`web/src/app/selection.ts`:

```
interface Selection { ticked: ReadonlySet<string>; anchor: string | null }
toggle(sel, id)                      // x, Space, checkbox, Ctrl/⌘+click: anchor = id
extendTo(sel, rows, id)              // Shift+↓/↑, Shift+click: ticked = (ticked − lastRange) ∪ range(anchor, id)
selectAll(sel, rows)                 // Ctrl/⌘+A
retain(sel, rows)                    // drop ids no longer in rows (after every render)
clear()
```

`rows` is the visible row order (on a board, the cards of the anchor's column for `extendTo`). The last extended range is remembered so moving back shrinks it without unticking rows ticked individually (spec "Shrink the range"). `retain` runs in an effect on `rows` so a completed or moved task leaves the selection, and the route effect that resets `selectedId` (`TaskListView.tsx:336-346`) also clears it. Read-only rows (`isReadOnly(task)`, viewers of shared projects) are skipped by `toggle`, `extendTo` and `selectAll`.

A `useSelection(rows, isReadOnly)` hook wraps it for `TaskListView` and the two `useListKeys` callers; `ListState` gains `ticked()` and `tick(ids)` so the Vim layer's `x`/`dd` (and later the palette) see the set.

- **Alternative: make the cursor part of the set (ticking is just multi-cursor).** Rejected. `Enter`, `a`, `e`, `s` and the detail panel need one task; keeping the cursor separate means nothing existing changes meaning.
- **Alternative: a separate selection mode (like Vim's Visual) in which `j`/`k` extend.** Rejected for the default keys: it would hide the existing `j`/`k` behind a mode. The touch Select button is a display mode only (checkboxes shown), not a key mode.

### D2. Keys: `x`/Space tick, `Shift+↓`/`↑` extend, with Vim-safe aliases

In `TaskListView`'s listener and `useListKeys`, before the existing switch: `x` and `' '` (Space) with a cursor row call `toggle` and `preventDefault` (Space would scroll); `Shift+ArrowDown`/`Up`, and `J`/`K` when the Vim layer is off (`useVimEnabled()`), move the cursor one row and `extendTo`; `Ctrl/⌘+A` with a non-empty set calls `selectAll` and `preventDefault`; Escape clears the set after the panel and pickers, before the cursor (the chain at `TaskListView.tsx:452-460` gets one more step). Space with no cursor row falls through to the browser.

Vim mode needs no change in `dispatch.ts`: it already lets `Shift+↓`/`↑` and Space through and consumes `x`, `J`, `K`, `dd`. `makeListActions.toggleCompleteSelected` and `deleteSelected` (`vim/actions.ts:45-56`) act on `s.ticked()` when it is non-empty, through the same planners (D4), so Vim's `x` and `dd` apply to the selection. A dispatch test pins that `Shift+ArrowDown` and `' '` return `false` from `handle()`.

`Ctrl/⌘+A` is claimed only while something is ticked: before that it keeps selecting the page's text, which keyboard users rely on in notes.

- **Alternative: Gmail's `x` that also moves the cursor down.** Rejected. Vim's `x` must stay "complete", and a toggle that moves makes `Shift` extension and the checkbox behave differently from the key.

### D3. Rows, bar, touch Select and the `.` menu

`TaskRow` gets `ticked`, `showCheckbox` and `onTick(e)` props: a `<input type="checkbox">` labelled "Select <title>" in the leading slot (next to the collapse slot), rendered when the row is hovered (`group-hover`), is the cursor, or when `showCheckbox` is true (any row ticked, or touch Select mode on). The pointer-coarse variant extends the hit area to 44 px as the completion circle does (`TaskRow.tsx:110`). Shift+click on the checkbox or the row calls `extendTo`; `Ctrl/⌘+click` on the row's open button calls `toggle` instead of opening.

`bulk/SelectionBar.tsx` renders above the list (below the quick-add line and the duration chips, `TaskListView.tsx:770-780`) while `ticked.size > 0`: "<n> selected" in a `role="status"`, an **Actions** `Menu` (kind `menu`, title "<n> tasks") and **Clear**. The list header gets a **Select** button on devices without hover (`pointer-coarse`, the same media query the row uses) that toggles `showCheckbox` until **Done**; the bar stays while ticks remain.

`.` outside text fields opens the Actions menu for the ticked tasks, or the cursor task alone when nothing is ticked, with focus on its first item (the overlay's `kind="menu"` does that). The menu items: Complete / Reopen (label follows the mixed-state rule, shortcut `c`), Priority 1–4 (`1`–`4`), Labels… (`L`), Date ▸ (Today, Tomorrow, Next week, No date, Pick a date… which opens a `Dialog` with the DateField), Move to project… and Move to section… (Combobox step inside the overlay, as `action-menus` specifies for "Move to"), Assign… (`Shift+A`, disabled with "Tasks must be in one shared project" unless they are), Move to Trash (Delete, danger, last). The existing keys route through the same handlers when `ticked.size > 0`.

- **Alternative: a persistent toolbar of buttons in the bar.** Rejected. Eight buttons do not fit 360 px; one menu is keyboard-reachable with `.` and matches `action-menus`.

### D4. Planners: one `Change[]`, one `mutateMany()`

`web/src/lib/bulk.ts` exports pure planners over rows read inside one transaction:

```
planComplete(tasks, all, now, today)   // open tasks: completePlain subtree or planCompletion per series; mixed rule
planReopen(tasks)                      // completed_at: null (only when every ticked task is completed)
planPriority(tasks, p)
planDue(tasks, pick)                   // 'today' | 'tomorrow' | 'next-week' | null | ISO date; keeps time and tz when a date exists
planLabels(tasks, labelId, add)        // reads each task's current array; whole array written
planTrash(tasks, all, now)             // subtree tombstones, deduplicated
planMove(tasks, all, target, memberships, me)   // same scope: project/section change with the parent-detach and section-clear rules of updateTask; other scope: copyTasks + tombstones
planAssign(tasks, userId)
```

Each returns `Change[]` merged by `(entity, entityId)` so a task reached twice (ticked and a descendant of a ticked parent) carries one patch. `applyBulk(action)` does `await getDeviceId()`, opens `db.transaction('rw', mutationTables(), …)`, reads the ticked rows and `liveTasks()`, plans, calls `applyBatch(changes, {source:'bulk', label})` (D5), and returns the count for the toast. This mirrors `completeTask`'s transaction-plus-`mutateMany` shape (`ops.ts:712-728`).

To avoid two copies of the project-change rules, the body of `updateTask` for `project_id` (`ops.ts:647-676`) is factored into `planProjectChange(task, all, patch)` that both `updateTask` and `planMove` call; `completePlain`'s subtree logic becomes `planCompletePlain`. `copyTasks` and `planCompletion` are reused as they are. The single-task helpers keep their signatures, so no caller changes.

Date presets: "Next week" is the first day of the following week per the user's week-start preference (`lib/dates.ts` `weekStartOf`), the same rule quick add uses for "next week".

- **Alternative: call the existing helpers in a loop inside one transaction.** Rejected. Each helper awaits `mutateMany`, which may await a dynamic import for note fields (`richTextFor`), killing a Dexie transaction; and N timestamps make the undo clock check per field fragile. One plan, one write.

### D5. Undo: the assistant's store, generalised

`web/src/lib/undo.ts` takes `applyChanges` and `undoChanges` out of `assistant.ts` as `applyBatch(changes, {source, label, origin?})` and `undoBatch(id)`, keeping the inverse-and-clocks algorithm and the `created` handling (which also covers the copies of a cross-scope move: they go to the Trash on undo while the tombstoned originals are restored through their `deleted_at` inverse). The row shape in `db.ts` gains `source: 'assistant' | 'bulk'` and `label`; the table keeps its name `assistantUndo`, so no Dexie version is needed (Dexie indexes only `id, created_at`). `assistant.ts` calls `applyBatch(..., {source:'assistant', origin:'assistant'})` and its tests move with the code. The 20-row cap stays per device across both sources.

`bulk/UndoToast.tsx` renders in the Shell's `ToastRegion`: "<label> · Undo" for 10 s or until the next bulk action; the Undo button is focusable (Tab reaches it: the region is after the main content in DOM order), `Ctrl/⌘+Z` outside text fields while a toast is shown calls `undoBatch` for it. The result line reuses `appliedSummary`-style wording ("Undone: 4 restored. Kept because they were changed again since: Buy milk.").

- **Alternative: a new `undo` table.** Rejected. A Dexie version bump and a second clear-at-sign-out path for the same data.
- **Alternative: undo through the history API ("restore this version").** Rejected. It needs a connection; the batch inverse is local and offline.

### D6. Review for moves and assignments

`planMove` and `planAssign` do not apply directly: `applyBulk` turns their `Change[]` into `ProposedChange[]` (`entity`, `entityId`, `patch`, `base` from the current row; copies as `create`) and hands them to `reviewChangeSet` (`assistant.ts:261`), rendered with `ChangeSetReview` in a `Dialog` titled "Move 6 tasks to Home" / "Assign 3 tasks to Bob". `describe()` already words `project_id`, `section_id` and `assignee_id` changes and marks shared destinations; a copy shows "copied into Home (shared)". Enter applies the checked items through `applyBatch` with the same undo entry; Escape discards and keeps the selection. The `ChangeSetReview` props are unchanged (`review`, `result`, `onApply`, `onDiscard`, `onUndo`); the `data-assistant-*` test ids get a neutral alias so the layout check can name the bulk review.

Why only these two: a move can change who sees a task (scope) and `assignee_id` notifies a member; the other actions are the assistant's own "small reversible" set and are undone in one key.

### D7. Where it lives in the bundle

The bar, menu, planners and toast are in the main bundle (every list shows the bar). The review dialog imports `ChangeSetReview` and `reviewChangeSet` from the assistant module; `AssistantRoot` is lazy but `lib/assistant.ts` and `assistant/ChangeSetReview.tsx` are plain modules already imported by tests, so pulling the two into the main bundle costs about 2 KB gzipped. Acceptable; if the maintainer prefers, the review dialog can be a lazy chunk with the same interface.

## Risks / Trade-offs

- **[`Ctrl/⌘+A` and `Ctrl/⌘+Z` collide with browser defaults]** → Claimed only outside text fields and, for `A`, only while something is ticked; the notes editor keeps its own undo because the key is handled on the editor element first.
- **[Space scrolls the page in some states]** → `preventDefault` only when a cursor row exists; the spec scenario "Space with no cursor" pins the fallback.
- **[A large selection (500 tasks) makes one big transaction]** → `mutateMany` already handles batches of that size (imports); the inverse row holds 500 small patches. The toast and bar show the count so the user knows what is about to happen; moves and assignments are reviewed.
- **[Undo after a sync from another device]** → Per-field clock check skips changed fields and names them, as the assistant does; a field the other device changed is never overwritten.
- **[Recurring tasks in a batch]** → `planCompletion` per series with the same `now`/`today`; the test from `recurring.test.ts` (two devices completing the same occurrence) is run against the bulk path.
- **[Rows re-render with a checkbox on hover]** → The checkbox is a fixed-width slot like the collapse slot, so rows do not shift; the layout check covers 360 px.
- **[`labels-and-menus` and this change both touch `TaskRow` neighbours and `.`]** → `.` on task rows is this change's; `labels-and-menus` defines it for label, view and section rows and leaves task rows out. No shared file beyond `shortcuts.ts`.
- **[The selection survives a live-query re-emission that reorders rows]** → `retain` keeps ids, not indexes.

**Data model impact:** none on synced entities; no op field added, renamed or retyped. Device-local `assistantUndo` rows gain `source` and `label` (additive, unindexed). **Size:** no dependency; an estimated 4–5 KB gzipped added to the main bundle, plus about 2 KB if the review is not split out. Runtime memory: a `Set` of ids and the folded rows already in memory. Server binary and image unchanged apart from the embedded bundle.

## Migration Plan

None. Rollback is the previous binary; existing `assistantUndo` rows without `source` are treated as `assistant`.
