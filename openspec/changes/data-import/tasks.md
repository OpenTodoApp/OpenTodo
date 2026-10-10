# Tasks

## 1. Importer core (Go)

- [x] 1.1 `internal/importer`: `Row` model, `Options`, `Profile` interface, format detection order (own export, JSON profiles, CSV) and user override; verify `TestDetectFormat` covers each profile and the `unsupported_format` case (`go test ./...`)
- [x] 1.2 `opentodo` profile: read export v1 including tombstones and ids, map projects then tasks; verify `TestRoundTripExportImportExport` produces an equivalent export (`go test ./...`)
- [x] 1.3 `csv` profile: streamed reader, header mapping for the documented columns, priority and date parsing, per-row errors with row numbers; verify `TestCSVMappingAndRowErrors` (`go test ./...`)
- [x] 1.4 Foreign JSON profiles with fixtures in `internal/importer/testdata/`, mapping projects, sections, subtasks, labels, priority, due, completion, and warnings for dropped attributes; verify one `TestProfile_<name>` per profile asserting the normalised rows (`go test ./...`)
- [x] 1.5 Normalisation: project matching by name, section→label option, parent resolution independent of row order, time-zone conversion of zoned date-times to floating values; verify `TestResolveParentsAnyOrder`, `TestZonedDueBecomesFloating` (`go test ./...`)

## 2. Duplicate detection, jobs and write-through

- [x] 2.1 Migration `0002_import.sql` with `import_jobs` and `import_items`; verify `store.Open` on an existing v1 database applies it and `TestMigrationsIdempotent` passes (`go test ./...`)
- [x] 2.2 Duplicate rules (id, remembered source id, title/project/due fingerprint) and preview outcomes `create|update|skip|possible_duplicate|error`; verify `TestDuplicateDetectionOrder`, `TestReimportSameFileSkipsAll` (`go test ./...`)
- [x] 2.3 Commit: ops with `device: "import"` and server timestamps applied through `sync.Apply` in batches of 1,000, `skip_rows` vs `abort`, persisted progress, one job per user; verify `TestCommitWritesOnlyOps` (no direct row writes), `TestAbortLeavesAccountUnchanged`, `TestSecondJobConflicts` (`go test ./...`)
- [x] 2.4 Overwrite mode writes only differing fields and never resurrects tombstones; verify `TestOverwriteKeepsNewerDeviceEdit` and `TestImportDoesNotResurrectDeleted` (`go test ./...`)
- [x] 2.5 Undo: tombstone ops for every `created` item, idempotent, job marked `undone`; verify `TestUndoTombstonesCreatedOnly` and that undone tasks disappear on a client's next sync in `TestUndoReachesDevices` (`go test ./...`)

## 3. HTTP API

- [x] 3.1 Routes `POST /api/v1/import/preview`, `POST /api/v1/import`, `GET /api/v1/import/jobs`, `GET /api/v1/import/jobs/{id}`, `POST /api/v1/import/jobs/{id}/undo` behind `requireAuth`, multipart upload, per-route body limit from `OPENTODO_IMPORT_MAX_MB`; verify `TestImportRoutesRequireAuth`, `TestImportTooLarge413`, `TestImportInvalidOptions400`, `TestUndoForeignJob404` (`go test ./...`)
- [x] 3.2 `internal/config`: optional `OPENTODO_IMPORT_MAX_MB` (default 20, 1–200) with validation; verify `TestConfigImportMaxMB` and that an invalid value stops startup naming the variable (`go test ./...`)
- [ ] 3.3 Document routes, payloads and the CSV contract in `docs/api.md` and new `docs/import.md` (columns, profiles, limits, undo, memory note); verify examples match handler routes by running them with curl against `./bin/opentodo`

## 4. Web app

- [ ] 4.1 `lib/api.ts` wrappers for preview, start, jobs, undo; verify typecheck (`npm run build`)
- [ ] 4.2 Settings → Import screen: file picker, detected format and override, options (target project, time zone defaulting to the browser zone, sections, duplicates, errors), preview table with per-row outcomes and warnings, confirm, progress polling, job history with undo; verify in the browser flow that a CSV import appears in views without reload and that every control is reachable with Tab/Enter
- [ ] 4.3 Offline behaviour: picker disabled with explanation when `useSyncStatus` reports offline; last job list remains visible; verify `importScreen.test.tsx` renders the offline state (`npm test`)
- [ ] 4.4 Keyboard: `g i` opens Import from anywhere, listed in the `?` help; verify in the browser flow

## 5. Integration and docs

- [ ] 5.1 End-to-end: export from instance A, import into empty instance B, export B, compare; then import a CSV, undo it, confirm a second device hides the undone tasks after sync; verify the run finishes with no console errors and `go test ./...` plus `npm test` green
- [ ] 5.2 README feature list, `ROADMAP.md` status for `data-import`, `CHANGELOG.md` Unreleased entry; verify links resolve and `make check` passes
