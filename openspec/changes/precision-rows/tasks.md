## 1. Rows, groups and the hidden note

- [x] 1.1 The row line (D1, D2): `RowLine` in `TaskRow.tsx` with the cells' and the rest's wrappers, the row as `@container/row`, the property column rules in `index.css`; the card keeps its line; verify `taskRow.test.tsx` and `budget.test.tsx`
- [x] 1.2 The head (D3): the repeat mark and the counts beside the title, the trailing group with the origin only; verify the counts, origin and screen reader tests
- [x] 1.3 Neutral selection and hover, the floating action cluster (D4, D5); verify the row action tests
- [x] 1.4 Group bars (D4): `ListGroupHeader` bar by default, plain on board columns; verify `groups.test.tsx`
- [x] 1.5 The hidden note (D6): `HiddenNote` in `ListChrome.tsx`, shown by `TaskListView.tsx`; the string in the five catalogs; verify `make i18n-check`

## 2. Docs, tests and baselines

- [x] 2.1 Update `docs/interface-guide.md` (the row and group bar) and add the CHANGELOG entry under Unreleased → Changed; verify `make docs-check`
- [x] 2.2 Regenerate the visual baselines in the pinned Playwright image; verify `make ui-check` in CI
- [x] 2.3 Render Today, a project and Settings from the real app at 1440×900 in dark next to the round-2 mock-ups and attach the side-by-side to the pull request
- [ ] 2.4 Run `make check` with TZ=UTC, open the pull request and get CI green
