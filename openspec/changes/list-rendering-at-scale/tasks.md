# Tasks

## 1. Layout

- [x] 1.1 `content-visibility: auto` and `contain-intrinsic-size` on list rows (not cards), `overflow-clip-margin` for the drop line; progressive mounting of long lists; sibling ARIA written by the list; verify `make ui-check`, the row stories, screenshots of every list surface at 360, 768 and 1280, and `make perf` open-project and cursor medians

## 2. Writes

- [x] 2.1 The tasks snapshot patches changed rows from `storagemutated` (D2) with a full-read fallback; verify unit tests comparing the patched snapshot with a full read after create, edit, complete, delete, purge, sync pages and a cleared database
- [x] 2.2 The row's tick paints in the frame of the click (D3); verify a unit test and `make perf` complete-task and remote-edit medians

## 3. Measure

- [ ] 3.1 `make perf` on the CI runner: every list budget of `performance-10k` within its limit; if not, propose windowing (D4)
