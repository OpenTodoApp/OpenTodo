# Tasks

## 1. Preference in both layouts

- [ ] 1.1 The Project menu offers "Show completed tasks" in the board layout, reading and writing `useShowCompletedPref`; test in the project header tests and `npm test`.

## 2. Completed column

- [ ] 2.1 The board's column model ends with a Completed column (completed, not skipped, most recent first) while the preference is on; folded by default through the fold state; tests in `boardView.test.tsx`.
- [ ] 2.2 A drop or Shift+Right into the column completes through the checkbox's completion path (repeating tasks included); a drop or Shift+Left of a completed card on a section reopens and moves it in one batch with Undo; drops inside the column and viewer drops refused; interaction tests for the six scenarios.
- [ ] 2.3 Board stories with the Completed column folded and unfolded, light and dark, 375 and 1280 px; `make ui-check`.

## 3. Docs

- [ ] 3.1 docs (boards, project display options), a changelog fragment; `npm run build` in `web/`, `make docs-check`.
