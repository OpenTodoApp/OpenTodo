# Rolling updates

## Why

Coolify (and any orchestrator doing zero-downtime updates) starts the new container while the old one still runs on the same volume, and stops the old one only after the new one is healthy. Since `backups` the server takes an exclusive lock on the data directory at startup, so the new container exits with "data directory is in use by another opentodo process", never becomes healthy, and every update is rolled back. Operators have to stop the service before deploying.

## What Changes

- A running server holds a **shared** lock on the data directory, so several server processes may serve the same directory at once (SQLite in WAL mode handles concurrent access between processes on one host).
- Background jobs that must run once (reminder push scheduler, webhook delivery worker, backup scheduler, email poller, Trash retention, audit pruning, demo reset) run only in the process that holds a separate **jobs** lock; a new process waits for it and takes over when the old process stops.
- `opentodo restore`, `mfa-reset` and `reset-owner-password` keep requiring that no server runs: they take the data-directory lock exclusively, which conflicts with any server's shared lock.
- Docs: rolling updates work; a new version's migrations apply while the old process finishes, which is safe because schema changes are additive.

## Impact

- Code: `internal/store/lock*.go` (shared lock, jobs lock), `cmd/opentodo/main.go` (start jobs on leadership).
- No new dependency, environment variable or migration. Binary size impact: negligible.
- Spec: `self-hosting` gains "Rolling updates".
