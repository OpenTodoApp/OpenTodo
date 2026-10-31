# Tasks

## 1. Remove the group

- [x] 1.1 Remove the planned group from `listGroups` (`plannedGroup`, `plannedOrder`, `PLANNED_OPEN_KEY`, `GroupInput.planned`), `isPlannedWithoutProject` from `web/src/lib/inbox.ts`, the planned list in `useListModel`, the header action in `ListGroups.tsx` and the compact empty state of `EmptyState`; verified by `npm test` and `npm run build` in web/
- [x] 1.2 Rewrite the Inbox tests (`inboxRule.test.tsx`, `listGroups.test.ts`, `inbox.test.ts`, `budget.test.tsx`, `firstRun.test.tsx`): the Inbox lists only its own tasks, and an empty Inbox with planned tasks shows the full empty state with the illustration; verified by `npm test`
- [x] 1.3 Remove the strings from all six catalogues with `node scripts/i18n/extract.mjs --write`; verified by `make i18n-check`

## 2. Stories, docs, changelog

- [x] 2.1 Remove the InboxPlannedFolded and InboxPlannedOpen stories and their baselines; regenerate only affected baselines; verified by `make ui-check` in CI
- [x] 2.2 Update `docs/today-and-upcoming.md` (and the generated help) and add a CHANGELOG Unreleased "Changed" entry; verified by `make docs-check`
- [x] 2.3 `make openspec-validate` passes, then archive the change
