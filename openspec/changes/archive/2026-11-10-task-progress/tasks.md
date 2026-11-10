# Tasks

## 1. Rule and figures

- [x] 1.1 `web/src/lib/progress.ts`: `progressPart` (the project rule), `shareOf`, `percentOf` and `projectProgressOf` (per snapshot, patched per write); `summarizeProjects` uses `progressPart`. Verify with `web/src/lib/progress.test.ts` (direct subtasks only, nested, deleted, completed parent, series, samples, the table's figure, the patch) and `npm test`.
- [x] 1.2 The patched project map equals a full count after every random write. Verify with `web/src/lib/incrementalEquivalence.test.ts`.

## 2. Screens

- [x] 2.1 Rows and cards: a 12 px ring before the subtask count, in the count's colour, decorative (`ProgressRing` `size`, `ToneText` `leading`). Verify with `web/src/app/taskRow.test.tsx`.
- [x] 2.2 The task panel's Subtasks heading ends with the percentage; the assistant's task block puts the ring before its count. Verify with `web/src/app/task-detail/subtasks.test.tsx`.
- [x] 2.3 The project page: ring and percentage beside the title, live, none for an area or an empty project; "40% done" on a phone. Verify with `web/src/app/projectHeader.test.tsx`.
- [x] 2.4 Stories (`UI/ProgressRing` "Among counts"; the row, card and panel stories show the ring) and the changed visual baselines. Verify with `make ui-check` and `make ui-baselines`.

## 3. Docs and checks

- [x] 3.1 `docs/notes-and-subtasks.md` and `docs/projects.md`; `changelog.d/Added/task-progress.md`; the roadmap row. Verify with `make docs` and `make docs-check`.
- [x] 3.2 Checks: `cd web && npm test && npm run typecheck && npm run lint && npm run build`, `make ui-lint`, `make i18n-check`, `make openspec-validate`, `make bundle-budget`, `node --test scripts/repo-checks.test.mjs`.
