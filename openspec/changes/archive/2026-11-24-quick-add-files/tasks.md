## 1. Web

- [x] 1.1 `files` on a new task: `createTask`, `addTaskUndoable` and `addTasksUndoable` write the files through `withFiles` in the task's batch; `checkFiles` shares the limit checks with `planFiles`; verified by `lib/quickAddFiles.test.ts`
- [x] 1.2 Quick add reads pasted files, lists them with `PendingFiles` (shared with the comment composer), refuses with the attachment messages and puts the line back when saving is refused; verified by `app/quickAddFiles.test.tsx` (paste then add, remove, text paste, over the limit)
- [x] 1.3 A line with files never reuses an item (`reuseMatchFor`); the capture screen keeps its own file list (`pasteFiles={false}`)
- [x] 1.4 Strings in every catalog (`make i18n-check`)

## 2. Docs

- [x] 2.1 The quick add guide names pasting files; changelog fragment `changelog.d/Added/quick-add-files.md`

## 3. Check

- [x] 3.1 `npm test`, `npm run build` and `npm run lint` in `web/`; `make docs`
