# Tasks

## 1. The vault engine (Go)

- [ ] 1.1 In `internal/vault/merge.go` `mapFiles`, match front-matter ids in a first pass, then give each remaining file without `opentodo-id` whose path the state records for a live, unclaimed project that project. Verify: a new test in `internal/vault/sync_test.go` deletes `Home.md`'s front matter, keeps its lines, syncs, and finds one project Home, its tasks unchanged and the front matter written back (`go test ./internal/vault`).
- [ ] 1.2 In `projectEdits`, read no colour or icon from a file without front matter. Verify: the 1.1 test gives Home an icon and colour first and checks both are unchanged.
- [ ] 1.3 Make `TestFileEmptiedOnPurpose` (`internal/vault/race_test.go`) expect one project Home, no `Home 2.md`, the task trashed, and `Home.md` holding the front matter. Verify: `go test ./internal/vault -run 'Emptied|MidSave|HalfSaved'`.
- [ ] 1.4 Add the shared vector case `front-matter-lost` (design D4) in `internal/vault/syncvectors_cases_test.go`, generated with `go test ./internal/vault -run TestSyncVectors -update`. Verify: `go test ./internal/vault` passes without `-update`.

## 2. The Obsidian plugin's engine

- [ ] 2.1 Port 1.1 and 1.2 to `obsidian/src/vault/merge.ts`. Verify: `npm run check && npm test` in `obsidian/`, where `front-matter-lost` passes in `engine.test.ts` and fails before the port.

## 3. Docs and checks

- [ ] 3.1 Update the vault guide's file-matching section (`docs/` page for `ot vault`, found with `grep -rn "opentodo-id" docs/`) to say a file at a known path keeps its project. Then `make docs` and `make docs-check`.
- [ ] 3.2 Add the changelog fragment `changelog.d/Fixed/vault-file-keeps-project.md`, then run `make check`.
