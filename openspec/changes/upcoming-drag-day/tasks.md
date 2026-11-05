# Tasks

## 1. One move-to-day rule

- [x] 1.1 `dayMovePatch` in `web/src/lib/dayMove.ts`: span whole from `from`, else the named field, due by default keeping time and zone; null for the same day and a completed task. Verified by `web/src/lib/dayMove.test.ts`.
- [x] 1.2 Month and Plan drops call it (Plan passes the day a span was dragged from). Verified by the existing `web/src/app/monthView.test.tsx` and `web/src/app/planView.test.tsx` via `npm test` in `web/`.
- [x] 1.3 `upcomingMovePatch` picks the field that lists the task (due, start of a deferred task without a project, deadline) and `upcomingStep` the keys' day. Verified by `web/src/lib/dayMove.test.ts`.

## 2. Upcoming

- [x] 2.1 Upcoming's day groups (and Today's group in Start with Today) carry `data-task-drop="day:<date>"` and ring under a drag; `dropUndoable` handles `day:` as one batch with Undo, skipping read-only tasks and writing nothing for the same day. Verified by `web/src/app/upcomingDrag.test.tsx`.
- [x] 2.2 Read-only rows are not draggable. Verified by `web/src/app/upcomingDrag.test.tsx`.
- [x] 2.3 Shift+← / Shift+→ (`upcoming.move-day`, view scope) move the selected task a day. Verified by `web/src/app/upcomingDrag.test.tsx` and the registry conflict test `web/src/lib/shortcuts.test.ts`.
- [x] 2.4 New strings in all six catalogues. Verified by `make i18n-check`.

## 3. Docs

- [x] 3.1 `docs/today-and-upcoming.md` says how to move a task to another day; the keyboard guide lists the keys. Verified by `make docs-check`.
- [x] 3.2 Screenshots of the drag at 360, 768 and 1280 px checked by eye.
