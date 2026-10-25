# Tasks: import-workspace

## 1. Server
- [x] 1.1 `Options.Workspace`, validated in `Service.prepare` against the account's workspaces (400 `invalid_input`); the target project must be in it (`go test ./internal/importer`)
- [x] 1.2 Planner: created projects, labels, views and project-less tasks carry the target `workspace_id`; name matching and duplicate fingerprints scoped to the target (`go test ./internal/importer`)
- [x] 1.3 Own export: with the option, every row goes into the target and nothing is created; without it, the mapping is unchanged (`go test ./internal/importer`)
- [x] 1.4 HTTP: `workspace` form field and JSON option; 400 for unknown and non-member workspaces; undo of a job into Work (`go test ./internal/httpapi`)

## 2. Web
- [x] 2.1 Import screen: Workspace select shown with more than one workspace, defaulting to the current one (own export: "As in the export"), target projects of that workspace, preview line naming the target (`npm test` in web/)
- [x] 2.2 Translations in all six languages (`make i18n-check`)

## 3. CLI
- [x] 3.1 `ot import <file>` with `--dry-run`, `--format`, `--existing`, `--duplicates`, `--time-zone` and the global `--workspace`; in `ot schema`, help and completion (`go test ./internal/cli`)

## 4. Docs
- [x] 4.1 docs/import.md, docs/workspaces.md, docs/cli.md, CHANGELOG Unreleased (`make docs-check`)
- [x] 4.2 `make check`
