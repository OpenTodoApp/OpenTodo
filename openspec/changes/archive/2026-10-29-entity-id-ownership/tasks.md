## 1. Resolver

- [x] 1.1 `idhome.go`: `homeScope`, `claimable`, `pairHome`; task, section and field lookups over every scope (`go test ./internal/sync -run TestSquat`)
- [x] 1.2 Comments, attachments and time entries use `pairHome`; projects and rules use `claimable` (`TestSquatRefusedForEveryEntity`)
- [x] 1.3 A batch that places a stored project child elsewhere is refused as a whole (`TestPredictedIDCannotCaptureAWrite`)
- [x] 1.4 Duplicates from before: `Get`, `List`, `locate` and writes pick the same copy; reminder cascade limited (`TestLegacySquatRoutesToTheOwner`, `TestLegacyDisjointCopiesKeepWorking`)
- [x] 1.5 Tests that used one id for two independent accounts run on separate servers; `TestShareRefusesProjectIDSquat` covers the new refusal and a legacy copy

## 2. Workspaces (L10)

- [x] 2.1 `workspace_id` write check and own-record reads (`TestProjectWorkspaceMustBeTheAuthors`)

## 3. CalDAV (L9)

- [x] 3.1 Migration `0048_caldav_resources_per_account.sql` (`go test ./internal/store -run TestMigrationCaldav`)
- [x] 3.2 Reads and writes by account; a UID naming a hidden task gets a fresh id (`go test ./internal/httpapi -run 'TestCaldavSquatGetsAFreshID|TestSyncRefusesSquattedID'`)

## 4. Release

- [x] 4.1 CHANGELOG `Security` and the upgrade note; `go test ./internal/...`; `make openspec-validate`
