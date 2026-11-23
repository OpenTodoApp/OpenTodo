# Tasks

## 1. The rule

- [x] 1.1 `showsProgress` in `web/src/lib/progress.ts`; `ProjectHeader.tsx` and `summarizeProjects` in `projectHealth.ts` use it. Verify: `npx vitest run src/app/projectHeader.test.tsx src/lib/projectHealth.test.ts` in web/ (no progress for a reusable list, back once it's ordinary; a folded parent still counts it).

## 2. Docs and checks

- [x] 2.1 `docs/all-projects.md`, `docs/reusable-lists.md`, `changelog.d/Changed/reusable-no-progress.md`; the statistics delta. Verify: `make docs-check`.
- [x] 2.2 Typecheck, `make web-lint`, `make openspec-validate`.
