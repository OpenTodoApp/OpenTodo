# Tasks

## 1. The vault engine (Go)

- [x] 1.1 Record `size` and `prefixes` for each written file (`state.go` writtenState, prefixHash; `plan.go`). Verify: the regenerated vectors carry both.
- [x] 1.2 Hold a file cut short like an empty one (`engine.go` cutShort, halfSaved), unless every line it lost is in another file (allMoved). Verify: `TestDamagedFileReadLosesNothing` passes every damage, cuts included, with nothing trashed, moved or duplicated.
- [x] 1.3 Hold a half-saved file's base in `State.held`, not in the store (saveBase, holdRaced). Verify: `TestLineRemoval` keeps a task completed in the app while the file is held.
- [x] 1.4 A file at a known path whose id names no project keeps its project (`merge.go` mapFiles). Verify: vector `front-matter-damaged`.
- [x] 1.5 Vectors `cut-short`, `end-deleted`, `cut-in-front-matter` and `front-matter-damaged`, generated with `go test ./internal/vault -run TestSyncVectors -update`. Verify: `go test ./internal/vault` passes without `-update`.

## 2. The Obsidian plugin's engine

- [x] 2.1 Port 1.1–1.4 to `obsidian/src/vault`, and write `held` in the state. Verify: `npm run check && npm test` in `obsidian/`, every vector passing.

## 3. Docs and checks

- [x] 3.1 Say in the vault guide that a file read while it is being saved is held for up to five minutes, and that a file keeps its project when its id is damaged. Then `make docs` and `make docs-check`.
- [x] 3.2 Add a changelog fragment in `changelog.d/Fixed/`, then run `make check`.
