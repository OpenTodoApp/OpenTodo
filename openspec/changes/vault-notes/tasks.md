# Tasks

## 1. Files

- [ ] 1.1 `internal/vault`: note file parser and printer (front matter `opentodo-id`, `project`, `tags`, preserved keys, body), file names and clashes; fixture notes in `internal/vault/testdata/vault/Notes/` print back byte for byte; verify with `go test ./internal/vault -run Fixture`
- [ ] 1.2 Layout and plan: notes created, renamed, moved, relabelled, deleted and trashed per "Standalone notes in the vault"; viewers' notes read-only; verify with `go test ./internal/vault`
- [ ] 1.3 Body merge (diff3 over lines), conflict file, version-checked plain-text write; verify with `go test ./internal/vault -run NoteMerge` and the shared sync vectors
- [ ] 1.4 Link rewriting on write and read, round trip unchanged; verify with `go test ./internal/vault -run NoteLinks`

## 2. Commands

- [ ] 2.1 `state.json` `notes` member; `init` turns notes on; `ot vault notes on|off`; counts in `sync` output and `--json`; `ot schema`; verify with `go test ./internal/cli ./internal/vault`
- [ ] 2.2 Limits (64 KB body, 5,000 notes) before any write or push; encrypted accounts encrypt and decrypt note fields on the machine; verify with `go test ./internal/vault -run 'Limit|Crypt'`

## 3. Docs and checks

- [ ] 3.1 `docs/vault.md` (Notes section with the fixture example, limits), `docs/notes.md`, `docs/cli.md`; `changelog.d/Added/vault-notes.md`; the ROADMAP row; verify with `make docs` and `make docs-check`
- [ ] 3.2 Run `go test ./...`, `make openspec-validate` and `make check`
