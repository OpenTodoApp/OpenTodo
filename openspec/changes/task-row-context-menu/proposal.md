# Proposal

## Why

The actions menu (complete, track, priority, labels, due, move to project or section, assign) is reachable from the keyboard (`.` / Shift+F10 / the context-menu key on the cursor row, `L`, `Shift+A`, the Selection bar) but never with the pointer's own context gesture: right-clicking a task opens the browser's menu, which offers nothing for the task. Pointer-only users — the majority on desktop — must either open the task panel and hunt through its facets, tick the row to raise the Selection bar, or reach for the keyboard. Every other object in the app that has a menu (labels, sections, views, project rows) already treats its menu as a first-class affordance; task rows, the most-listed objects, are the exception.

## What Changes

- **Right-click opens the task's actions menu at the pointer.** On a task row — list, board card, and the filter, saved-view and method lists — a right-click suppresses the browser menu and opens the same `Actions` menu the keyboard opens, anchored where the pointer was (a bottom sheet on phones, like every other menu). A link, a field or editable text in the row, and a selection of the row's text, keep the browser's own menu.
- **On touch, a hold reaches the same menu — on a fine pointer.** Holding a row still arms it (held feedback) and releasing without moving opens the menu at the finger; hold then move still drags. A coarse pointer (a phone) never opens the menu this way: the long press keeps its existing meaning from bulk-actions (it ticks the row), so one gesture stays one thing on every list of a device. Chrome on Android's own long-press `contextmenu` is suppressed without opening anything, since the hold owns that gesture.
- **The target follows the selection.** Right-clicking a ticked row opens the menu for the whole ticked selection (exactly what the Selection bar would act on, with the same review and Undo); right-clicking an unticked row targets just that task. The selection itself is not changed by the right-click.
- **A lifted drag wins.** While a row is being dragged (the long-press lift on touch especially), the context menu does not open; releasing over a target performs the drop as before.
- No new menu items, no new strings, no new shortcuts: the menu, its pickers, its review step and its Undo are the existing bulk-actions machinery acting on one or many ids.

Out of scope: right-click on rows outside task lists (calendar blocks, plan items, month cells, sidebar items), a different "quick" menu of its own, text-field and link context menus (they keep the native menu), timeline rows (`TimelineView` renders bars, not task rows), and a hold opening the menu on a coarse pointer. No shortcut, route, API, dependency or environment variable is added; no server or sync change at all.

Advances ROADMAP.md's UX direction and the row-menu work of `labels-and-menus` (the keyboard half exists; this is the pointer half).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `action-menus`: a new requirement "Open a task's action menu with a right-click" defines the pointer trigger, its selection rule, the anchor at the pointer, the suppressed browser menu, the native menus it must not take over and the drag guard, for task rows everywhere they render; a second new requirement covers the touch hold, fine-pointer only.
- `bulk-actions`: the long-press requirement now describes the press *arming* through the hold interval and the drag lifting only on movement after it (it used to lift at once); ticking, selection and the haptics are unchanged.
- `project-timeline`: same clarification for bars on narrow screens — a press and hold arms the drag and the movement after it drags, where movement before the hold scrolls.

## Impact

- Web app: `web/src/app/TaskRow.tsx` (an optional `onContextMenu` and `onRowMenu(x, y, row)` on the row `<li>`, and `holdForRow`, the hold for rows the drag does not own), `web/src/app/task-list/TaskListRow.tsx` (the `context` and `contextAt` entries of the stable `RowActions`), `web/src/app/task-list/useListBindings.ts` (the handlers: the native-menu guard, the touch suppression, the drag guard, the shared selection rule `rowMenuIds` in list order), `web/src/app/bulk/useRowMenu.tsx` (the one owner of the menu state, rule, element and focus restore), `web/src/app/TaskListView.tsx` and `web/src/app/bulk/useBulkList.tsx` (both render that hook's element instead of their own copy), `web/src/app/bulk/BulkActions.tsx` and `web/src/app/menus/ActionMenu.tsx` (thread `triggerProps` to the menu primitive, which already accepts trigger attributes), `web/src/lib/dnd.ts` (`trackHold`, the hold both gestures share, and the fine-pointer rule for the hold menu).
- Tests: a new `web/src/app/task-row-contextmenu.test.tsx` covering the row event, the guards, the selection rule, the anchor, the focus return and the touch hold; `web/src/lib/dnd.test.ts` for the armed hold; existing `bulk`, `taskRow` and `ActionMenu` tests otherwise unchanged.
- Docs: one sentence in `docs/keyboard.md`'s menu section (the pointer twin of `.`), one in `docs/work-from-the-list.md`; no help-screen changes.
- Design: a short `design.md` records the ownership rules (one owner per row; what a hold means per pointer; who may take the browser's menu).
- i18n: no new translatable strings (the menu label "Actions for N tasks" already exists in all six catalogs).
- Bundle and server: unchanged; the feature is client-only event wiring over existing state.
