## Context

Precision round 2 (`task.png`, `phone-task.png`, `light-task.png`) shows the task as a page: breadcrumb, "4 / 12" with ↓ ↑, the content column and a facts column with unset facts as actions. Until now a task opened in the shell's panel slot (`panel.ts`, `PanelHost`), with an Expand action to `/task/<id>` and a bottom sheet on phones (`TaskSheet`). Every list calls `openTaskPanel` / `setPanelTaskId`; about twenty views read `usePanelTaskId` for their Escape chain.

## Goals / Non-Goals

**Goals:** one way to open a task (its page) with a way back to the exact spot; facts that show every property; a composer frame the assistant can adopt; keep Process the Inbox working beside its card; no change to data, sync or the server.

**Non-Goals:** the Inbox split view (change 7, inbox-split); the phone's stacked-fact polish and tab bar (change 13, precision-phone); merging Activity and Comments into one stream as the mock-up shows (the tabs stay); moving the assistant composer onto the frame (change 10, assistant-surface).

## Decisions

**D1. Page layout.** `TaskPageView` renders a `PageHeader` (tool head) whose title is the breadcrumb on desktop and the list's name on phones (the phone bar gets Back and the stepper), then a grid: content, facts (`lg:` second column, sticky under the header, `--panel-header-h` measured from the header), the rest of the content. Below 1024 px the facts follow the notes, as in `phone-task.png`. The page never clamps notes.

**D2. The trail.** `taskTrail.ts` keeps module state like `panel.ts`: when a list opens a task it records the address (path and query), the page title, the list's tasks in order (the registered `listState().rows()`, else the `[data-task-id]` rows in the document, for the calendar, plan and review screens) and the scroll top of `#content`, then pushes `/task/<id>` and notes `history.length`. Stepping and opening a subtask replace the entry, so leaving is `history.back()` when the length still matches, else `navigate(from)`. Before leaving it sets `selectTask` (lists select that row on mount) and the shell's route effect calls `settleTrail`, which restores the scroll once rows exist (about a second at most) and keeps the row in view. Opened from outside a list, the opener names the task's list as `from`. Alternatives: React state in the shell (lost on route change), history state objects (the router pushes `null` everywhere, and a reload would restore stale ids).

**D3. Keep `openTaskPanel` as the one entry point.** Rather than rewriting the ~100 `openId` uses, `openTaskPanel(id)` now opens the page unless the mounted page called `setTaskSplit(true)` and the screen is at least 1024 px; then it docks as before. Process the Inbox sets it, so its Escape chain and its tests keep their meaning; change 7 will set it for the Inbox list. On every other page `usePanelTaskId()` is simply null. The phone sheet is unreachable and is deleted.

**D4. `?task=` addresses.** Notifications, push and links inside notes use `/?task=<id>`. On launch the shell strips the parameter and opens the page over the page in the address, so Esc lands there. Copy link now copies `/task/<id>`.

**D5. Shared model.** `useTaskDetail` holds what the panel and the page share (the task and relatives, the title draft, publish state, menu actions, the `panel` keys inside the element); `TaskHead`, `TaskRelations`, `TaskNotes`, `Subtasks` and `TaskActionsMenu` are the shared parts. `TaskDetail` is now the docked panel only.

**D6. ComposerFrame.** A `ui/patterns` component: bordered box, the field, `below` (files), a tool row (`tools` left, `end` right) and a round Send button with a tooltip naming the keys. It owns no text or keys. The comment composer uses it; the inner field loses its own border through `[data-composer-frame] .ui-input`.

**D7. Facts reuse the facet editors.** `TaskFacts` computes the facet parts with every optional part revealed (`useFacetParts`), reads values from the non-empty parts, and opens `PartEditor` through `usePartEditor` (both extracted from `Facets`). The list keys' focus signals (`d`, `Shift+N`, `b`, `e`, location) reach it unchanged through `usePropertyEditing`.

**Interface budget.** The task page adds no chrome row to lists (it replaces them). Scroll regions: the content only (the facts column is sticky, not a scroller), so at most three per screen holds. Properties: the facts column shows every fact, so the budget changes from "seven properties visible" to "at most seven with a value on an empty task, in at most four groups of at most six rows" (`budget.json` `MAX_FACT_GROUPS`, `MAX_FACTS_PER_GROUP`, tested). Shortcuts: `task.next` (`j`), `task.prev` (`k`) and `task.escape` (Esc) in the `view` scope for `task`, registered without conflict (`panel.escape`, `vim.leave-field` and `assistant.review` list `task.escape` as overridden).

## Risks / Trade-offs

- Opening a task now leaves the list, so ticked tasks are cleared by the route change. → Bulk actions stay on the list; Enter with ticks still opens the selected task.
- The list re-mounts on return; a long list's scroll is restored after its rows arrive, so a very slow device may show the top for a frame. → The restore retries for about a second and keeps the selected row in view.
- `listedIds()` from the document misses rows a virtualised list did not render. → Only lists register `listState` with all rows; the document fallback is for the small calendar and review screens.

## Migration Plan

Web only, no data change. A reload of an old `?task=` address or a notification link opens the page. Rollback is a revert.
