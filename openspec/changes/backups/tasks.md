# Tasks

## 1. Storage and settings

- [x] 1.1 Migration adding `settings(key, value, updated_at)` and `backup_runs(...)`, plus a `generation` value created on first start; verify `TestMigrationAddsSettingsAndGeneration` on a v1 database (`go test ./...`)
- [x] 1.2 `internal/settings`: typed get/set for JSON settings with owner-only semantics; secrets file `<data>/secrets/backup.json` created `0600`, read/write helpers, presence flags; verify `TestSecretsFileModeAndNeverSerialised` (`go test ./...`)
- [x] 1.3 `internal/config`: optional `OPENTODO_BACKUP_*` presets (destination, schedule, retention, credentials) applied once when no settings exist; verify `TestBackupPresetsSeedOnce` and that invalid values stop startup naming the variable (`go test ./...`)

## 2. Snapshot, archive and encryption

- [x] 2.1 `internal/backup`: snapshot via `VACUUM INTO` a temp file while writers are active, tar + optional gzip archive with `manifest.json` first, exclusion of `secrets/` and `backups/`; verify `TestSnapshotIsConsistentUnderConcurrentWrites` and `TestArchiveExcludesSecrets` (`go test ./...`)
- [x] 2.2 Streaming encryption (`OTBK1` header, argon2id, AES-256-GCM 1 MiB chunks, final-chunk flag) and decryption; verify `TestEncryptDecryptRoundTrip`, `TestTamperedChunkFails`, `TestTruncatedArchiveFails` (`go test ./...`)
- [x] 2.3 Document the archive and encryption formats byte-for-byte in `docs/backups.md`; verify a test fixture encrypted by the code is decrypted by a reference implementation in the test (`TestFormatMatchesDocumentedLayout`)

## 3. Destinations, schedule and retention

- [x] 3.1 Local directory destination (temp file + rename, list, delete); verify `TestLocalDestinationWriteListDelete` (`go test ./...`)
- [x] 3.2 S3-compatible destination with SigV4 (`PutObject`, `ListObjectsV2`, `DeleteObject`, path-style option) against an in-process fake; verify `TestS3SignatureVectors` (AWS published test vectors) and `TestS3PutListDelete` (`go test ./...`)
- [x] 3.3 WebDAV destination (`MKCOL`, `PUT`, `PROPFIND`, `DELETE`, Basic auth) against an in-process fake; verify `TestWebDAVPutListDelete` and `TestWebDAVUnreachableRecordsFailure` (`go test ./...`)
- [x] 3.4 Destination test probe (write + delete a small object); verify `TestProbeReportsDestinationError` (`go test ./...`)
- [x] 3.5 Scheduler (hourly/daily/weekly in server zone, missed-run-at-startup), run mutex, `backup_runs` recording and pruning, retention keep-last-N and older-than-D never deleting the newest; verify `TestNextRunComputation`, `TestMissedRunExecutesAtStartup`, `TestRetentionKeepsNewest`, `TestConcurrentRunConflicts` (`go test ./...`)

## 4. HTTP API and settings screen

- [x] 4.1 Owner-only routes `GET/PUT /api/v1/backups/settings`, `GET /api/v1/backups`, `POST /api/v1/backups/run`, `POST /api/v1/backups/test` behind `requireAuth` plus an owner check, secrets never echoed, validation errors; verify `TestBackupRoutesRequireAuth`, `TestBackupRoutesForbidMembers`, `TestBackupSettingsValidation400`, `TestBackupRunConflict409`, `TestSettingsResponseHasNoSecrets` (`go test ./...`)
- [x] 4.2 `docs/api.md` section for the routes; verify curl examples against `./bin/opentodo`
- [x] 4.3 Web: Settings → Backups (owner only): destination form per type, schedule, retention, passphrase with the irrecoverability warning, test and run actions, status and history, offline state with cached status and disabled actions; verify `backupsScreen.test.tsx` (render per destination type, offline state) with `npm test` and `npm run build`; verify in the browser flow that a manual run shows progress and outcome without reload and all controls are keyboard reachable

## 5. Restore and device convergence

- [x] 5.1 `opentodo restore <archive> [--passphrase-file]`: verify checksum, decrypt, schema version check, exclusive-lock check, safety copy, swap, new generation; verify `TestRestoreRoundTrip`, `TestRestoreRefusesNewerSchema`, `TestRestoreRefusesWhileLocked` (`go test ./...`)
- [ ] 5.2 Server: include `generation` in `/api/v1/sync` responses; verify `TestSyncResponseCarriesGeneration` (`go test ./...`)
- [ ] 5.3 Client: store `meta.generation`; on mismatch reset cursor, keep outbox, re-emit all local fields with stored `(ts, device)` in batches, show "re-syncing after restore" status; verify `sync.test.ts` cases `reseedsAfterGenerationChange`, `reseedKeepsOriginalClocks`, `reseedDoesNotDuplicateEntities` (`npm test`)
- [ ] 5.4 End-to-end: back up, create a task on device A, restore, sync A and B, confirm the task exists everywhere once and concurrent edits resolve by timestamp; verify the run finishes with no console errors
- [ ] 5.5 Docs: `docs/backups.md` restore procedure with `docker compose` stop/restore/start steps, `docs/sync.md` generation section, `docs/self-hosting/*` links, README, `ROADMAP.md` status, `CHANGELOG.md` Unreleased; verify links resolve and `make check` passes
