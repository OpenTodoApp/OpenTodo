# Tasks

## 1. One menu

- [x] 1.1 `useProjectMenu` holds the header's menu, dialogs and swatches; `ProjectHeader` uses it. Verify: the project menu tests.
- [x] 1.2 The sidebar's `ProjectRowMenu` uses it, active only while open, plus Move up and Move down; the All projects page keeps its short menu. Verify: `sidebarAppearance.test.tsx`.
- [x] 1.3 Archive and Delete from the sidebar go to the Inbox only when that project is on screen. Verify: `sidebarAppearance.test.tsx`.

## 2. Right-click

- [x] 2.1 `contextForRowMenu` on the sidebar's scroller. Verify: `rowMenuHold.test.tsx`.

## 3. Release

- [x] 3.1 Docs (`docs/projects.md`) and a changelog fragment. Verify: `make docs-check`, `make repo-check`.
