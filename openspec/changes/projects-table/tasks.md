## 1. Health on the device

- [x] 1.1 Add `web/src/lib/projectHealth.ts`, a pure module: the summary per project, covering open (the sidebar's rule), progress (a series counts once), next due, updated (row clocks), the four health words in order, and the fold rule through `rollUp`. Verify: `npx vitest run src/lib/projectHealth.test.ts`, one fixture case per rule
- [x] 1.2 Exclusions and roll-up: trashed, skipped and sample tasks count nowhere; archived and trashed sub-projects add nothing; a cycle is not followed; a deadline today is not late; the quiet threshold falls at exactly 7 days. Verify: the same test file
- [x] 1.3 Sorting: `compareProjects` with direction, missing values last in both directions, ties by name; `firstDirection` (Updated descends). Verify: the "sorting" block of the same test file

## 2. The table

- [x] 2.1 Add `ProgressRing` to `web/src/ui` with a story (`UI/ProgressRing`), and export it from the barrel. Verify: `npm test` (barrel test) and `make storybook` renders it
- [x] 2.2 Add the icons `activity`, `trending-up` and `circle-alert` to `web/src/ui/icons/names.json` and regenerate with `scripts/icons-sync.mjs`. Verify: `npx vitest run src/ui/icons`
- [x] 2.3 Add `app/ProjectsTable.tsx`: the table with the tree, health with its detail, progress, open, next due (danger when late), people, updated and the menu; the whole row opens; sortable headers with `aria-sort`; the keys (arrows, `j`/`k`, Home/End, Left/Right fold, Enter). Verify: `npx vitest run src/app/projectsView.test.tsx`, "All projects table"
- [ ] 2.4 Narrow the table by its own width (`@container/projects`), keeping the name and the health word at 360 px with no sideways scroll. Verify: the layout check (`make layout-check`) at 360 px, and the visual baselines
- [x] 2.5 `app/ProjectsView.tsx`: Active and Archived tabs with counts replace the disclosure; the fragment follows the tab; the find field enters the table with Down; the note under the table; focus after the last Restore falls back to the selected tab. Verify: `npx vitest run src/app/projectsView.test.tsx`, "Archived projects list"
- [x] 2.6 Update the All projects stories with projects in every health state. Verify: `make storybook`, "Screens/All projects"

## 3. Words, docs and checks

- [x] 3.1 Extract the new strings and translate them into de, es, fr, it and pt. Verify: `node scripts/i18n/extract.mjs --write` then `make i18n-check`
- [x] 3.2 Update the docs that describe the All projects page and its archived projects, and add the CHANGELOG entry under Unreleased → Changed. Verify: `make docs-check`
- [ ] 3.3 Regenerate the visual baselines in the pinned Playwright image. Verify: `make ui-check` in CI
- [ ] 3.4 Run `npm test` and `npm run build` in `web/`, `make check` with TZ=UTC, open the pull request and get CI green
