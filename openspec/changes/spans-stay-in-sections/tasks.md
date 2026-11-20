## 1. List

- [ ] 1.1 `splitLater` in `web/src/lib/listGroups.ts`: a top-level task drawn as a span (`spanOf`) is active before its first day; tests for "A span in a section", "A start without a span still defers" and the changed "Deferred span in Upcoming" (the project-view half), and a check that Today, Anytime and the counts are unchanged. Verify: `cd web && npx vitest run src/lib/listGroups.test.ts src/lib/views.test.ts`.

## 2. Docs and checks

- [ ] 2.1 One sentence in `docs/deadlines-and-start-dates.md` and `docs/tasks-that-span-days.md`, `changelog.d/Changed/spans-stay-in-sections.md`, the row in `ROADMAP.md`. Verify: `make docs`, `make docs-check`, `make openspec-validate`, `cd web && npm test`.
