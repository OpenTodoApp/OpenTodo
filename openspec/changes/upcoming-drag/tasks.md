# Tasks

## 1. The drop

- [x] 1.1 `web/src/lib/dayDrop.ts`: the calendar's rule for a task put on a day (time and zone kept, span moved whole, deadline untouched, start-listed tasks kept deferred, nothing for the same day). Verified by `web/src/lib/dayDrop.test.ts`.
- [x] 1.2 `dropUndoable` resolves `day:<date>` into one batch with Undo; a malformed date is refused. Verified by `web/src/lib/dayDrop.test.ts` (one outbox timestamp, Undo restores, the same day writes nothing).
- [x] 1.3 Upcoming's day groups, its event-only days and, with Start with Today, Today's day groups carry the day; Earlier does not. Verified by `web/src/lib/dayDrop.test.ts`.
- [x] 1.4 The group's section is a `data-task-drop` target with the drop ring. Verified by `web/src/app/upcomingDrag.test.tsx` (mouse drop with the ring and no drop line, touch after the hold, Escape).

## 2. Words

- [x] 2.1 The keyboard guide's sorted-views note in `web/src/lib/shortcuts.ts` and every catalogue; `docs/today-and-upcoming.md`, `docs/work-from-the-list.md`. Verified by `make i18n-check` and `make docs-check`.
- [x] 2.2 Changelog fragment `changelog.d/Added/upcoming-drag.md`. Verified by `make repo-check`.

## 3. Integration

- [x] 3.1 `npm run typecheck`, `npm run lint` and the focused tests in `web/`; `make openspec-validate`, `make bundle-budget`.
