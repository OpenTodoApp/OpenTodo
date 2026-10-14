# Tasks

## 1. Split the restore procedure (CLI behavior unchanged)

- [x] 1.1 Refactor `backup.Restore` in `internal/backup/restore.go` into `Stage` (stream, decrypt, hash, integrity, schema into `<data>/tmp/restore/<id>/`), `Preview` (read-only counts) and `Apply` (lock, `checkNotInUse`, generation and marker, safety copy, swap, extras), with `Restore` calling all three; verify the existing `internal/backup/restore_test.go` passes unchanged with `go test ./internal/backup/...`
- [x] 1.2 Add `ErrPassphraseInvalid`, returned when the first encrypted chunk fails to open, and keep `ErrIntegrity` for later corruption; verify with new cases in `crypt_test.go`/`restore_test.go` (wrong passphrase vs truncated ciphertext) and `go test ./internal/backup/...`
- [x] 1.3 Implement `Preview` counts (accounts, live projects, live tasks, ops) from the extracted DB opened read-only without migrations; verify with a test against a schema-0001 fixture and a current-schema fixture
- [x] 1.4 Verify `opentodo restore` end to end still behaves exactly as documented: run `go test ./cmd/opentodo/...` and the existing CLI restore test, plus a manual `opentodo restore` of a fresh archive against a stopped server

## 2. Read archives back from destinations

- [x] 2.1 Add `Open(ctx, name) (io.ReadCloser, int64, error)` to the `Destination` interface, accepting only `archiveNameRE` names, with local, S3 (SigV4 GET) and WebDAV (GET) implementations; verify with `dest_test.go` cases per kind against the existing test servers, including a rejected `../opentodo.db` name
- [x] 2.2 Add a streaming fetch of a named archive into a staging dir that keeps memory constant; verify with a test that streams a 64 MiB archive and checks the file hash, and `go test ./internal/backup/...`

## 3. Staging lifecycle, pending marker and startup apply

- [x] 3.1 Implement staging: one prepared restore at a time (preparing replaces the previous one), `meta.json` with `formatVersion: 1`, a 30-minute expiry sweeper, startup cleanup that keeps only the pending id, and a free-space check (archive + 2 × DB + 64 MiB margin; `Statfs` with a no-cap fallback); verify with unit tests for expiry, replacement and cleanup
- [x] 3.2 Implement `restore-pending.json` (written atomically) and `applyPendingRestore(dataDir)`: exclusive lock, `Apply`, marker removal, outcome recorded in the restored DB on success or `restore-last.json` on failure, and staged files kept on `ErrLocked`; verify with tests for success, integrity failure at apply (old DB stays) and a held shared lock
- [x] 3.3 Call `applyPendingRestore` in `cmd/opentodo/main.go` before `store.LockShared`/`store.Open`, and add the exec-requested path: cancel the root context, let `run()` finish the graceful shutdown, then `syscall.Exec` the same binary, falling back to exit 0 with a log line when exec is unavailable or fails; verify with an integration test that starts the server binary, confirms a restore over HTTP and observes the restored data on the same PID after `/healthz` answers
- [x] 3.4 Add the audit events `backup.restore_requested`, `backup.restore_failed` and `backup.safety_copy_deleted` in `internal/audit/events.go`, and record the failure event on the next start from `restore-last.json`; verify with `audit_test.go` and the `internal/audit` tests

## 4. HTTP API

- [x] 4.1 Register `GET /api/v1/backups/archives` (requireAuth plus the owner check; 502 `destination_error` without credentials); verify with `internal/httpapi/backups_test.go` cases for owner, member (403), no session (401) and an unreachable destination
- [x] 4.2 Register `POST /api/v1/backups/restore/uploads` (octet-stream, `MaxBytesReader` at the free-space cap, 400 `integrity` for non-archives, 507 `insufficient_storage`); verify with tests for a valid upload (201), a JPEG (400, nothing left on disk), an over-cap body (507, partial removed) and a member (403)
- [x] 4.3 Register `POST /api/v1/backups/restore/prepare` with the stored-passphrase fallback, the per-IP rate limiter and error mapping (`passphrase_required`/`passphrase_invalid` 422, `newer_schema` 409, `integrity` 400); verify with one test per error, a successful preview with counts, and 401 without a session
- [x] 4.4 Register `POST /api/v1/backups/restore` with `requireFresh`, refusing bearer tokens (403 `session_required`), validating `confirm: "RESTORE"` (400 `invalid_input` field `confirm`), unknown or expired ids (404), and a running backup (409); verify with one test per case and a success case asserting 202 and the pending marker
- [x] 4.5 Register `GET /api/v1/backups/restore`, `DELETE /api/v1/backups/restore/{id}` and `DELETE /api/v1/backups/restore/safety-copies/{name}` (fresh, name validated against the safety-copy pattern); verify with tests for state shape, cancel removing files, delete by owner, delete by member (403), and an invalid name (400)
- [x] 4.6 Verify the demo deny list covers every new route with a `demo_test.go` case per route, and document the routes, request and response bodies and errors in `docs/api.md`

## 5. Web app

- [x] 5.1 Add API helpers and types for the new routes in `web/src/lib/api.ts`, including upload progress through `XMLHttpRequest.upload.onprogress` and clear copy for a proxy 413; verify with vitest unit tests for error mapping
- [x] 5.2 Build the restore section in `web/src/app/BackupsPanel.tsx`: a source switch (destination list or upload), the archive list, upload with progress, and offline-disabled state; replace the "Restore with `opentodo restore`" sentence with a link to the CLI docs as an alternative; verify with `backupsScreen.test.tsx` cases for list, destination error, upload and offline
- [x] 5.3 Build the preview and confirm dialog (overlay `Dialog`): metadata and counts, the "what will happen" list (restart, sessions after the backup end, devices push newer edits back), a passphrase field on 422, the typed `RESTORE`, and the reauth flow on 403 `reauth_required`; verify with tests for passphrase retry, a wrong confirmation word disabling the button, and the reauth prompt
- [x] 5.4 Build the restart screen: poll `/healthz` every 1 s for up to 60 s, then reload; set a sessionStorage flag so a 401 after the reload shows "This server was restored from a backup" on the sign-in screen; verify with tests using fake timers and a mocked fetch
- [x] 5.5 Show the last restore outcome, "Undo last restore" (only while its safety copy exists, same dialog with source `safetyCopy`), and the safety-copy list with sizes and delete; verify with tests for an outcome success/failure banner, undo hidden when no copy exists, and the delete confirmation
- [x] 5.6 Check keyboard reachability and accessibility: every control reachable with Tab, the dialog traps focus, and progress is announced through `aria-live`; verify with the axe check in the existing test setup, then `npm test` and `npm run build` in `web/`

## 6. Documentation and help

- [x] 6.1 Update `docs/backups.md`: web restore walkthrough, undo, safety copies and disk needs, the merge semantics for devices, reverse-proxy body limits, and that the CLI path is unchanged for stopped servers and Coolify; verify `cd web && npm run docs:check` passes
- [x] 6.2 Update the in-app help topic for `settings/backups` and regenerate the help bundle (`cd web && npm run docs:build`); verify the generated file changes are committed and `docs:check` passes

## 7. Integration check

- [x] 7.1 Manually smoke test with `make run` (production build on :8080): back up, create a task, restore last night's archive from the local destination, confirm the task is gone on the server, sync a second browser holding a post-backup task and see it return, then undo the restore; record the outcome in the PR description
- [x] 7.2 Run `make check` and `npx @fission-ai/openspec validate backup-restore-web --strict`; both pass

## Workflow follow-up

- Archive the change with `/opsx:archive` after review, confirm `openspec validate --all --strict` passes, and add a CHANGELOG.md entry under Unreleased.
