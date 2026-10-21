# Proposal

## Why

The actions menu (complete, track, priority, labels, due, move to project or section, assign) is reachable from the keyboard (`.` / Shift+F10 / the context-menu key on the cursor row, `L`, `Shift+A`, the Selection bar) but never with the pointer's own context gesture: right-clicking a task opens the browser's menu, which offers nothing for the task. Pointer-only users — the majority on desktop — must either open the task panel and hunt through its facets, tick the row to raise the Selection bar, or reach for the keyboard. Every other object in the app that has a menu (labels, sections, views, project rows) already treats its menu as a first-class affordance; task rows, the most-listed objects, are the exception.

## What Changes

- **Right-click opens the task's actions menu at the pointer.** On a task row — list, board card, timeline, and the filter, saved-view and method lists — a right-click suppresses the browser menu and opens the same `Actions` menu the keyboard opens, anchored where the pointer was (a bottom sheet on phones, like every other menu).
- **The target follows the selection.** Right-clicking a ticked row opens the menu for the whole ticked selection (exactly what the Selection bar would act on, with the same review and Undo); right-clicking an unticked row targets just that task. The selection itself is not changed by the right-click.
- **A lifted drag wins.** While a row is being dragged (the long-press lift on touch especially), the context menu does not open; releasing over a target performs the drop as before.
- No new menu items, no new strings, no new shortcuts: the menu, its pickers, its review step and its Undo are the existing bulk-actions machinery acting on one or many ids.

Out of scope: right-click on rows outside task lists (calendar blocks, plan items, month cells, sidebar items), a different "quick" menu of its own, text-field context menus (they keep the native menu), and long-press on touch opening the menu instead of dragging. No shortcut, route, API, dependency or environment variable is added; no server or sync change at all.

Advances ROADMAP.md's UX direction and the row-menu work of `labels-and-menus` (the keyboard half exists; this is the pointer half).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `action-menus`: a new requirement "Open a task's action menu with a right-click" defines the pointer trigger, its selection rule, the anchor at the pointer, the suppressed browser menu and the drag guard, for task rows everywhere they render.

## Impact

- Web app: `web/src/app/TaskRow.tsx` (an optional `onContextMenu` on the row `<li>`), `web/src/app/task-list/ListRow.tsx` (the `context` entry of the stable `RowActions`), `web/src/app/task-list/useListBindings.ts` (the handler: prevent default, drag guard, selection rule, pointer position), `web/src/app/TaskListView.tsx` (the menu state and the menu rendered anchored at the stored point), `web/src/app/bulk/useBulkList.tsx` (the same for the filter, saved-view and method lists), `web/src/app/bulk/BulkActions.tsx` and `web/src/app/menus/ActionMenu.tsx` (thread `triggerProps` to the menu primitive, which already accepts trigger attributes).
- Tests: a new `web/src/app/task-row-contextmenu.test.tsx` covering the row event, the selection rule and the anchor; existing `bulk`, `taskRow` and `ActionMenu` tests unchanged.
- Docs: one sentence in `docs/keyboard.md`'s menu section (the pointer twin of `.`), one in `docs/work-from-the-list.md`; no help-screen changes.
- i18n: no new translatable strings (the menu label "Actions for N tasks" already exists in all six catalogs).
- Bundle and server: unchanged; the feature is client-only event wiring over existing state.
