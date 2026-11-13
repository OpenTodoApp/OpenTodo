# Tasks

- [x] 1.1 `lib/priority.ts`: level 4 unnamed reads "No priority" / "None", `isNoPriority`; the panel's How part and facts column show the unset affordance; the filter chip, the bulk toast and the command bar use the new words. Verify: `npm test` in web/ (`task-detail/priority.test.tsx`, `priority.test.ts`, `facets.test.ts`, `listGroups.test.ts`).
- [x] 1.2 New strings in every maintained catalog. Verify: `make i18n-check`.
- [x] 1.3 `ot` leaves the priority column empty for level 4. Verify: `go test ./internal/cli` (`testdata/today.golden`).
- [x] 1.4 Docs (`docs/priorities.md`, the task panel and quick-add pages) and the visual baselines that changed. Verify: `make docs-check`, `make ui-check`.
