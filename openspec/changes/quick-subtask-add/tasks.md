# Tasks

## 1. Row marks

- [x] 1.1 Add `subtaskAdds` (the parents whose visible subtree ends after the row, each with its depth, innermost first) to `ListRow` in `web/src/lib/listGroups.ts`, compute it in one pass per group inside `listGroups`, and fold it into `sameRow` so `keepGroups` keeps a row only when its marks match; verify with a `listGroups` unit test that a flat list marks nothing, a project tree marks each parent's last visible descendant, a folded parent marks nothing, and several parents ending at one row mark it innermost first

## 2. The line

- [x] 2.1 Add `SubtaskAddLine` next to `SubtaskInput` in `web/src/app/task-list/TaskListRow.tsx`: a muted "+ Add a subtask" button at child indent that swaps to `SubtaskInput` on click and returns to the ghost on `onClose`
- [x] 2.2 Emit an `<li>` per marked parent in `rowRenderer`'s row fragment (`ListGroups.tsx`), only in tree lists (`tree`) and only for parents that are neither read-only nor completed; verify with happy-dom tests in `web/src/app/task-list/`: the line under a parent's last subtask in a project, none under a childless, folded, completed or read-only row, stacked lines at a tree edge, click opens the input focused, Enter adds the subtask above the line, Escape returns the ghost

## 3. Finish

- [x] 3.1 No new strings expected ("Add a subtask"/"Add subtask" exist): run `node scripts/i18n/extract.mjs --write` if any appear and `make i18n-check`
- [x] 3.2 `cd web && npm test && npm run build`, `make bundle-budget`, `make openspec-validate`; add `changelog.d/Added/quick-subtask-add.md`

## 4. Review follow-ups

- [x] 4.1 Show the line only for the selected parent and under the pointer, not under every expanded parent: the marks render in one hidden `<li>` per ending row, revealed by selection, hover or focus (`index.css`), and `subtaskAddEnds` (parent → ending row) keeps the row cache's `mayChange` to a lookup per row
- [x] 4.2 Lay the line out like a row ("+" in the child's checkbox slot, the label at the title column, time column aware), draw none on a departing row or while a drag runs, hand focus back to the line's button on Escape, clear `subtaskAddOpen` when the parent's marks leave the rows, and cover the viewer case with a test
