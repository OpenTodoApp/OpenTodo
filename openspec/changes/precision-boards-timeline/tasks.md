## 1. Board

- [x] 1.1 Full-height bands and the foot "Add a task" (D1, D2) in `BoardView.tsx`; verify `boardView.test.tsx`, `boardSurfaces.test.tsx`, `boardPhone.test.tsx`
- [x] 1.2 The card's property row (D3) in `TaskRow.tsx`; verify `taskRow.test.tsx`
- [x] 1.3 The "Add a section" column (D4) in `Sections.tsx` and `index.css`, with a test for opening it

## 2. Timeline

- [x] 2.1 `late` and `lateBy` in `lib/timeline.ts` (D7), with tests
- [x] 2.2 Rows, group bars, labels, diamond, today line and mark, week ranges (D5, D6, D8, D9) in `TimelineView.tsx`; verify `timelineView.test.tsx`
- [x] 2.3 New strings in the five catalogs; verify `make i18n-check`

## 3. Docs, tests and baselines

- [x] 3.1 Update `docs/interface-guide.md` (board and timeline) and add the CHANGELOG entry under Unreleased → Changed; verify `make docs-check`
- [ ] 3.2 Regenerate the visual baselines in the pinned Playwright image; verify `make ui-check` in CI
- [ ] 3.3 Run `make check` with TZ=UTC, open the pull request and get CI green
