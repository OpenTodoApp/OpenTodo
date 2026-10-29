# Tasks

Depends on `obsidian-plugin` (connection, token, envelope module, TypeScript line grammar). Go tasks run `go test ./...`; plugin tasks `make obsidian`. `make check` runs before the last task is ticked.

## 1. Ownership in `ot vault`

- [ ] 1.1 `internal/vault/state.go`: optional `owner` and `lease_until`; an installation id for `ot` stored in the profile directory; refuse with `vault_owned` (exit 2) before any request when another installation owns the folder; take ownership of a state without an owner; renew the lease on every sync and every `watch` cycle. Verified by `go test ./internal/vault/...`: the four scenarios of "One syncing device per vault folder", and an old state file read and upgraded.
- [ ] 1.2 `--take-over` on `ot vault sync` and `watch`: new device id and owner, empty cursor and base, first sync with the server as base and differing lines to the conflict file. Verified by a sync test (no task created twice, a differing title lands in `Home.conflict.md`) and `ot schema` listing the flag (CLI golden test).
- [ ] 1.3 iCloud placeholders: a file absent with a `.<name>.icloud` placeholder is skipped with a report and its tasks are untouched, in the Go engine. Verified by a sync test.

## 2. Shared sync vectors

- [ ] 2.1 `TestSyncVectors` in `internal/vault` writes `internal/vault/testdata/sync/<case>.json` (`-update`) from the engine for every scenario of "Merge and conflict rules", "Task lines", "Completion and recurrence in files", "Labels, sections, subtasks and notes", "What the file does not round-trip", "Vault limits", "Encrypted accounts in the vault" (fixed test key), ownership and the placeholder case; without `-update` it checks the committed files. Verified by `go test ./internal/vault/...`.

## 3. TypeScript engine

- [ ] 3.1 Port layout, front matter, render, plan, merge, store, state and exchange from `internal/vault` to `obsidian/src/vault/` over two interfaces, a file adapter and a transport, with no Obsidian import in the engine. Verified by `obsidian/src/vault/engine.test.ts` passing every vector of 2.1 and the fixture vault's byte-for-byte round trip.
- [ ] 3.2 Obsidian adapter on `vault.adapter` (dot-folder access) and `vault.process` for files open in an editor; atomic state writes (`state.json.tmp` then rename). Verified by unit tests with a mocked `DataAdapter` and a test that an open editor's buffer is not overwritten.
- [ ] 3.3 Transport over `requestUrl` to `POST /api/v1/sync` with the vault's device id, cursor paging until `hasMore` is false, `clock_skew` and `backfill_ack` features, server-time offset as in Go. Verified by unit tests against a scripted transport, and by `make obsidian-e2e` against a real server (create a task on the server, see the line; tick the line, see it completed over REST; same for an encrypted account).

## 4. Plugin integration

- [ ] 4.1 Settings: "Sync a folder with OpenTodo" with a folder picker, the adopt confirmation, the plaintext notice for encrypted accounts, owner status ("Synced by …", lease) and "Take over syncing here"; status in the settings tab and the desktop status bar; the "not in the background" sentence. Verified by happy-dom tests of the settings tab.
- [ ] 4.2 Triggers: load, file events debounced (stable for one second), 30-second interval while visible, the command, back-off on failure. Verified by unit tests with fake timers.
- [ ] 4.3 "Send line to OpenTodo" refuses lines inside the synced folder. Verified by a unit test.
- [ ] 4.4 Raise the `main.js` budget in `make obsidian` to 400 KB and record the measured size in this change's design. Verified by `make obsidian`.

## 5. Docs, strings, release

- [ ] 5.1 Plugin strings for this feature in the six locales. Verified by `make i18n-check`.
- [ ] 5.2 `docs/obsidian.md` gains "Sync a folder" (phone setup, when it syncs, one device per folder and taking over, iCloud notes, encrypted accounts); `docs/vault.md` gains the ownership rule and `--take-over`. Verified by `npm run docs:check` (the guide's `ot vault` flags exist in `ot schema`).
- [ ] 5.3 Manual runs recorded in `obsidian/README.md`: iPhone with iCloud, Android with Obsidian Sync, a folder moved from `ot vault` to the plugin and back. Verified by the table in the README.
- [ ] 5.4 CHANGELOG entry under Unreleased (at archive). Verified by `make check`.
