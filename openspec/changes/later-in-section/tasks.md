## 1. Grouping

- [x] 1.1 `listGroups` puts each section's deferred and parked subtrees in a folded `later:<key>` group after it, with count and `openKey` (`laterOpenKey`), hidden with its section; one Later group at the end without sections, for other groupings and on the timeline (`web/src/lib/listGroups.test.ts`)
- [x] 1.2 `sectionOfRows` maps a section's Later rows to the section (`web/src/lib/listGroups.test.ts`)
- [x] 1.3 Patched and full tree parts draw the same groups with every Later open, and an edit to a deferred task in a section is patched (`web/src/lib/incrementalEquivalence.test.ts`)

## 2. Screen

- [x] 2.1 `GroupedList` draws a section's Later inside the section as a plain folded heading; opening it shows its rows (`web/src/app/somedayViews.test.tsx`); `useListModel` passes the project and the timeline

## 3. Specs, docs and checks

- [x] 3.1 Docs: `docs/deadlines-and-start-dates.md`, `docs/group-and-order.md`, `docs/built-in-views.md`; changelog fragment `changelog.d/Changed/later-in-section.md`
- [x] 3.2 `npm run typecheck`, `npm run lint`, the touched web tests, `make bundle-budget`, `make openspec-validate`, `make repo-check`, `make i18n-check`, `make docs-check`
