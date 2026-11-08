# Tasks

## 1. The rule

- [x] 1.1 `web/src/app/task-list/dropDepth.ts`: `gapDepths`, `pointedDepth`, `gapTarget`, `gapAround`; `listDrop.ts`: `dropIndent`, `DropAt.depth` compared by `sameDrop` (verified by `listDrop.test.ts`)

## 2. The list

- [x] 2.1 `web/src/app/task-list/useListDrag.ts`: the gap around a before or after drop in its group, the depth from the sideways movement, the drop through `gapTarget` with the section of the row it lands beside; `TaskListView.tsx` passes the groups (verified by `dropDepth.test.tsx`)
- [x] 2.2 `TaskRow.tsx` and `ListGroups.tsx`: the line starts at the depth's indent (`data-drop-depth`), and a row redraws when only the depth changes (verified by `dropDepth.test.tsx`)

## 3. Docs and checks

- [x] 3.1 `docs/work-from-the-list.md`, `scripts/ux-audit/drag-alternatives.json`; changelog fragment `changelog.d/Changed/drop-depth.md`
- [x] 3.2 `npx vitest run src/app/listDrop.test.ts src/app/dropDepth.test.tsx src/app/sidebarDrop.test.tsx src/app/task-list`, `npm run build`, `make bundle-budget i18n-check ui-lint docs-check openspec-validate repo-check`
