# Design

## Language-independent lookups (UI-5)

Code that finds an element marks it with a data attribute: the panel's title input carries `data-task-title` (Vim `i`), sidebar project rows already carry `data-project-row` (the list's "leave the sidebar" on `j`/`k`), and the panel's Add menu sits in a `display: contents` wrapper with `data-add-property`. Accessible names stay translated; tests that query by label keep working.

## Viewer shortcuts (UI-10)

`list.schedule` and `list.estimate` use the `writable` flag every other editing key uses. `list.skip` and `list.detach` act on the selected or the open task, so they look up the open task when no row is selected and refuse when it is in a project where the user is a viewer.

## Midnight (UI-17)

`useToday()` (useViews.ts) already re-reads the date every minute and on a zone change; TaskListView and Sidebar use it instead of `todayISO()` at render, and the sidebar memos depend on it.

## Dialogs (UI-19)

Each container keeps the pending action in state and renders `ConfirmDialog` (title, consequence, confirm label); the request runs from `onConfirm`, and existing error handling still shows a failure. The share dialog nests its confirmation like the public links section does. The notes editor's `askLink` hook may now return a promise: the editor opens `LinkDialog`, and the link command applies the answer to the editor's selection when it arrives (ProseMirror maps the selection through remote merges made meanwhile) and focuses the editor again. The dialog validates with `safeHref` (https, http, mailto), the same rule that renders note links. The e2e layout check's automatic dismissal of native dialogs no longer has anything to dismiss; no flow there used one.

## Untranslated text (UI-20)

The two misses were a placeholder with only one-letter words ("e.g. 45m, 1h30") and a template literal assigned to an object key (`note:`). The check now treats a prop value with a letter and whitespace as text, and reports template literals with a three-letter word under keys that views show (`note`, `heading`, `label`, `title`, `description`, `placeholder`, `hint`, `empty`, `caption`, `subtitle`). Plain string literals under those keys are not reported: tried on the code base, the four hits were identifiers and samples, not text.

## Colours (UI-22)

Hour lines use `var(--ot-border)`, quarter-hour lines `color-mix()` of it with transparent, so every theme (including high contrast) draws them. The token lint matches colour functions whose first argument is a number; functions over tokens (`color-mix(…var(--ot-…)…)`, `rgb(var(--x))`) pass.

## Silent failures (UI-16, UI-18)

Wave 2's client-sync-robustness added `act()` and the title draft; both hold. The list's remaining `void` calls on user actions (bulk keys, park, duplicate, this occurrence only, add subtask, complete from the panel) now go through `act()`; `saveViewMode` (a device preference) stays `void`.

## Interface budget and size

No new chrome, properties, sidebar destinations, scroll regions or shortcuts; one small dialog opened by an existing shortcut (Mod-k). No dependency; bundle change is a few hundred bytes.

## Data model

None.
