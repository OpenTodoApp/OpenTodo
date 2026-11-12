## 1. Importer

- [x] 1.1 `icsProfile` in `internal/importer/profile_ics.go`: detection, lenient split, `caldav.Decode` per `UID`, rows with dates, alarms, labels, rules, parents, blockers, origin and the calendar's project; verified by `go test ./internal/importer -run ICS`
- [x] 1.2 Fixtures under `internal/importer/testdata/ics/` (a Nextcloud-like list with subtasks, a recurring task, a completed task, alarms, a malformed component) pinned by golden previews (`TestNamedFormatFixtures`) and detection (`TestNamedFormatDetection`)
- [x] 1.3 The provider `ics` reads as "iCalendar" (`internal/origin`, `web/src/lib/taskOrigin.ts`, a case in `internal/origin/testdata/origin_vectors.json`); verified by `go test ./internal/origin` and `npm test -- taskOrigin`

## 2. Clients

- [x] 2.1 `ot import --format ics` (`internal/cli/cmd_import.go`); verified by `go test ./internal/cli`
- [x] 2.2 Import screen: format label and `.ics` in the picker (`web/src/lib/types.ts`, `web/src/app/ImportScreen.tsx`); verified by `npm test -- importScreen`, `npm run typecheck`, `npm run build`

## 3. Docs and checks

- [x] 3.1 `docs/import.md` section and table row; `make docs`, `make docs-check`
- [x] 3.2 Changelog fragment `changelog.d/Added/ics-import.md`; `node --test scripts/repo-checks.test.mjs`
- [x] 3.3 `go test ./...` for the touched packages, `make openspec-validate`
