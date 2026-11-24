## 1. Server

- [x] 1.1 `resolveExecutable`: `os.Executable`, then the start command, then a stat that it can be run (`go test ./cmd/opentodo -run TestResolveExecutable`)
- [x] 1.2 The restart hook reports whether the server comes back; `POST /api/v1/backups/restore` answers `restart_required` when it cannot, and the pending restore is kept (`go test ./internal/httpapi -run TestRestoreConfirm`)

## 2. Web

- [x] 2.1 `restart_required` shows "Restart OpenTodo to finish the restore." at once, without a spinner (vitest `src/app/restoreSection.test.tsx`)
- [x] 2.2 A server that has not come back within the wait gets the same screen; polling stops when the page goes away (vitest `src/app/restoreSection.test.tsx`, `src/lib/restore.test.ts`)

## 3. Docs and check

- [x] 3.1 `docs/backups.md` says what the page shows when the server cannot restart itself; changelog fragment
- [x] 3.2 `make check`, `npm test` and `npm run build` in web/, `make i18n-check`, `make openspec-validate`
