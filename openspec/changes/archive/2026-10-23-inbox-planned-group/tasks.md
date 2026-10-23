## 1. The planned group

- [x] 1.1 In `web/src/lib/listGroups.ts`, give `ListGroup` an `openKey`, add `PLANNED_OPEN_KEY = 'inbox:planned:open'`, and append the folded "Planned, no project" group to the Inbox's groups from a new `planned` input (flat rows with breadcrumbs, ordered by do-on date, then start date, Someday last, then creation); verify with `listGroups` unit tests for folded, open and empty cases (`npm test -- listGroups`)
  - Done: `plannedGroup` and `plannedOrder`; Blocked carries its own `openKey`. Five new cases in `listGroups.test.ts` (folded, open and ordered, absent, tie-break, Blocked's key).
- [x] 1.2 In `useListModel`, compute the planned tasks for the Inbox (`isPlannedWithoutProject`, the same duration filter as the view) and expose the Inbox's own rows separately from the planned group's; verify with the unit and view tests below
  - Done: `planned` and `ownRows`.
- [x] 1.3 In `ListGroups.tsx`, toggle a folded group's own `openKey` and show the planned group's always-visible "Open as filter" action; verify with a happy-dom test that the header opens Filter with `no project`
  - Done: `PlannedActions` (`data-planned-filter`); covered in `inboxRule.test.tsx` "Where planned tasks went".

## 2. The Inbox reads its own rows

- [x] 2.1 In `TaskListView.tsx`, base the empty state, Process the Inbox, its count and the page actions on the Inbox's own rows, so the empty state shows with the folded group below it; verify with `inboxRule.test.tsx` "Inbox zero with planned tasks"
- [x] 2.2 Remove the planned line from the header meta, the phone bar's subtitle and the action row, and remove `usePlannedWithoutProject` and `PlannedWithoutProject`; verify that `inboxRule.test.tsx`, `budget.test.tsx` and `firstRun.test.tsx` assert the group instead of `[data-planned-line]`
- [x] 2.3 Remember the open group per device; verify with a test that reopens the Inbox and finds the group open
  - Done: `inboxRule.test.tsx` "The group remembers being opened on this device".

## 3. Copy, docs and visuals

- [x] 3.1 Strings "Planned, no project" and "Open as filter" in the five catalogs, the old plural removed; verify `node scripts/i18n-check.mjs`
- [x] 3.2 Update `docs/today-and-upcoming.md` ("Where planned tasks go") and the PageHeader story that showed the line; verify `make docs-check`
  - Done for the guide (kept under the 600-word limit) and `help.json`. The PageHeader story's "4 planned tasks without a project" is only sample meta text in a frame demo, not this feature, so it stays to avoid an unrelated baseline change.
- [x] 3.3 A story of the Inbox with the folded and the open group, and visual baselines regenerated in the pinned Playwright image; verify `make ui-check` in CI
  - Stories `Screens/Task list` → InboxPlannedFolded and InboxPlannedOpen.
- [x] 3.4 CHANGELOG entry under Unreleased

## 4. Integration

- [x] 4.1 Run `make check` (TZ=UTC); verify it passes
- [x] 4.2 Open the pull request and get CI green
