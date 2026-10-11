# Tasks

## 1. Locks

- [x] 1.1 `internal/store`: `LockShared` (data-directory lock, shared) and `LockJobs` (non-blocking exclusive jobs lock) next to the exclusive `Lock`; no-op on platforms without flock; verify `TestSharedLocksCoexist`, `TestExclusiveConflictsWithShared`, `TestJobsLockSingleHolder` (`go test ./...`)

## 2. Server

- [x] 2.1 `cmd/opentodo`: take the shared lock at startup; start background jobs once the jobs lock is held, retrying every two seconds; verify `TestJobsStartAfterLeaderExits` (`go test ./...`) and a manual run of two processes on one directory

## 3. Docs

- [x] 3.1 `docs/self-hosting/docker.md`, `coolify.md` and `docs/backups.md` (restore needs the server stopped), CHANGELOG (Fixed); verify `make check`
