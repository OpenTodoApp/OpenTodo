## 1. Check before write

- [x] 1.1 `apply` re-reads each project file right before writing or removing it and leaves a file that changed since the sync read it, reporting it as skipped (`TestSaveDuringSyncIsNotOverwritten`, `TestSaveDuringSyncIsNotRemoved`)
- [x] 1.2 A raced file keeps its recorded hash and printed lines, and its rows go to the state's `held`; the next sync merges against them (`TestSaveDuringSyncIsNotOverwritten`: the app's title reaches the file, the save reaches the app, the third sync is idle)
- [x] 1.3 The ids of new lines are written into a raced file (`TestSaveDuringSyncKeepsNewLineIDs`: one task, not two)
- [x] 1.4 Task notes: the same check, and a new note keeps its `opentodo-id` (`TestNoteSavedDuringSyncIsNotOverwritten`)
- [x] 1.5 A conflict rename takes the file as it is when renamed; shared sync vectors unchanged (`go test ./internal/vault`)

## 2. Docs and checks

- [x] 2.1 `docs/vault.md` says what happens to a save made during a sync (`make docs-check`)
- [x] 2.2 `go test ./internal/vault ./internal/cli` (TestVaultWatch) and `make openspec-validate`
