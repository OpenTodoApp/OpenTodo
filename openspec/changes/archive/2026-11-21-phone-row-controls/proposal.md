# Proposal

## Why

GitHub issue [#1359](https://github.com/OpenTodoApp/OpenTodo/issues/1359): the interface tour at 360 px (2026-11-14) reported 186 overlapping touch targets (rule M11), nearly all of them in task rows. Every row ended with a Show details arrow whose 44 px target shared 16 px with the grip's, the fold arrow of a task with subtasks shared 18 px with the checkbox, and the grip stood 10 px above the row's other controls, into the section header over the first row. A tap between two controls went to whichever was stacked higher.

On a phone the Show details arrow is also redundant: it expands the row in place, and a tap on the row already opens the task as a page that shows the same and more. Separately, the list's add field showed its whole hint ("Add a task to Home renovation with a rather long project name…"), which the field's one line cut.

## What Changes

- Below 768 px a row has no Show details arrow. A tap opens the task, as before. Expanding in place stays: the arrow from 768 px on touch, Show details in the revealed actions with a mouse, → at every width, and "Click a task to: Expand the row". A row that is expanded shows Hide details at every width, so it can always be closed.
- On touch, no two controls of a row share their target: the fold arrow's 44 px end where the checkbox's begin and reach back over the indent; the grip sits on the title's first line, inside the row; from 768 px the arrow stands 12 px further from the grip. The checkbox and the title do not move; the fold arrow moves 2 px and the grip 4 px.
- Below 768 px the add field's hint, and a section's add line's, is "Add a task…" (an existing string). From 768 px it names the list as before.
- The audit's M11 no longer compares the page's fixed chrome (the tab bar, the add button) with content that scrolls under it.

Out of scope: rows that reach the screen's edges (in a list of 50 rows or more the part of the fold arrow's target over the page gutter takes no tap in Chromium, see design D2), the row's other parts and their order, the add button and the tab bar over the last rows of a list, the calendar's compact rows, board cards, and what an expanded row shows.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`); the web app in a phone browser gets the same rows.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: "Expanded rows" and "Revealed row actions" place the disclosure button from 768 px on touch and on an expanded row; new requirements "Row controls on touch do not overlap" and "Add field hint on a phone".

## Impact

- `web/src/app/TaskRow.tsx` (where the disclosure shows, the fold arrow's target and pressed circle, the grip's margin), `web/src/index.css` (the grip on the phone row's first line; a row with a fold arrow is not skipped on touch), `web/src/app/task-list/ListChrome.tsx`, `TaskListView.tsx` and `Sections.tsx` (the hint).
- `scripts/ux-audit/audit-measures.mjs` (M11) and its test.
- Tests in `rowExpand.test.tsx`, `taskRow.test.tsx`, `listChrome.test.tsx`, `fullTitles.test.tsx`; `docs/expand-a-row.md`, `docs/interface-guide.md`, `docs/design-system.md`.
- No op field, no route, no new string, no dependency, no server change. The first load stays inside its budget.
- Visual baselines of every phone-width screen and story with task rows change (no arrow, the grip 10 px lower and 4 px to the left), and of touch rows from 768 px (the grip 4 px and the arrow 16 px to the left).
