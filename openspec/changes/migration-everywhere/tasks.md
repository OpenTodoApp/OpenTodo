# Tasks

Each of groups 2–6 can land as its own pull request; group 7 lands last.

## 1. Shared

- [x] 1.1 `Row.TimeEntries` (importer-internal) and the planner writing `time_entry` ops validated by `internal/timetrack`, with the 24-hour cap; verify `go test ./internal/importer -run TimeEntries`
- [x] 1.2 `internal/importer/sanitize`: modes for the five new formats (CSV, ZIP with JSON, ZIP with CSV and Markdown, JSON, SQLite); verify `go test ./internal/importer/sanitize/...`
- [x] 1.3 Detection regression: every existing fixture keeps its format after each new profile is added to `Profiles`, and a bare CSV with `Name`/`Status` is not `notion-csv`; verify `go test ./internal/importer -run Detect`

## 2. OmniFocus (`omnifocus-csv`)

- [x] 2.1 `profile_omnifocus.go`: detection (`Context` and `Tags` headers), dotted-id hierarchy, mapping and the dropped and repeat notes (design D2); verify `go test ./internal/importer -run OmniFocus`
- [x] 2.2 Real exports, sanitised, with goldens: the published real OmniFocus 2 export (MIT) and a file in the OmniFocus 4.7 layout; a sanitised OmniFocus 4 export from a Mac replaces the latter when the owner has one (QUESTIONS.md); verify the golden test
- [x] 2.3 `docs/switch/omnifocus.md` with an `#export` section and the `docs/import.md` row; verify `make docs-check`

## 3. Vikunja (`vikunja-export`)

- [x] 3.1 `profile_vikunja.go`: ZIP detection, projects and sub-projects, buckets of the first Kanban view as sections, priority, repeat, reminders, relations, attachments through the ZIP attachment path with the ownership checks; verify `go test ./internal/importer -run Vikunja`
- [x] 3.2 Real exports from a local Vikunja (current release and 0.22), sanitised, with goldens
- [x] 3.3 `docs/switch/vikunja.md` and the `docs/import.md` row; verify `make docs-check`

## 4. Notion (`notion-csv`)

- [x] 4.1 `profile_notion.go`: ZIP detection by page-id suffix, one project per database, the title column, Markdown bodies, the parent-item relation, and date parsing including ranges; verify `go test ./internal/importer -run Notion`
- [x] 4.2 Column guesses in six languages and the `columns` option on preview and commit (`internal/httpapi/import.go`), 400 `invalid_input` for an unknown column; verify `go test ./internal/httpapi -run ImportNotion` (guess, override, unknown column, 401 without credentials)
- [x] 4.3 Client: role selects in the preview card for `notion-csv`, re-preview on change, `columns` in `web/src/lib/api.ts`; verify `api.import.test.ts` and an ImportScreen interaction test (`npm test`)
- [x] 4.4 Fixtures (a task database and a database with sub-items in a Part-1 ZIP) built in the shape of five published real Notion exports (none is licensed for copying: BOM and CRLF CSVs, `_all.csv`, ids on files, url-encoded relation links, D/M/Y dates), with goldens and the sanitiser run over them; a sanitised export from a real Notion account replaces them when the owner has one (QUESTIONS.md)
- [x] 4.5 `docs/switch/notion.md` and the `docs/import.md` row; verify `make docs-check`

## 5. Super Productivity (`super-productivity-json`)

- [x] 5.1 `profile_superproductivity.go`: detection, projects, tags, the `TODAY` tag, tasks and archived tasks, dates, estimates, `timeSpentOnDay` as time entries, and repeat configurations; verify `go test ./internal/importer -run SuperProductivity`
- [x] 5.2 Real backups from the current release, sanitised, with goldens
- [x] 5.3 `docs/switch/super-productivity.md` and the `docs/import.md` row; verify `make docs-check`

## 6. Tududi (`tududi-db`)

- [x] 6.1 `profile_tududi.go`: SQLite detection and schema check, read-only private copy deleted afterwards, areas, projects, tasks, subtasks, tags, priority, status, notes and recurrence; verify `go test ./internal/importer -run Tududi` including the unknown-schema refusal
- [x] 6.2 A real database from a local Tududi (current 1.x), sanitised, with a golden
- [x] 6.3 `docs/switch/tududi.md` and the `docs/import.md` row; verify `make docs-check`

## 7. The picker and the matrix

- [x] 7.1 Add the five format ids to `web/src/lib/types.ts` and the format menu, and an "Export from …" section (`#export-from-<app>`) to the ten existing switch guides; verify `npm test` and `make docs-check`
- [x] 7.2 The Switching from… Combobox in `ImportScreen.tsx`: preset format, inline steps from `help.json`, Full guide link, offline disabled, encrypted-account note, collapsed steps under 640 px; verify an interaction test (`@vitest-environment happy-dom`), a story in both themes, `make ui-lint` and `npm run build`
- [x] 7.3 Strings in the six languages; verify `make i18n-check`
- [x] 7.4 `docs/switch/README.md` matrix with all fifteen apps and the repository check (row present, format id exists, guide with an export section, fixture with a golden), plus the 120-day freshness rule in `make release-prepare`; verify `make repo-check` passes and fails on a removed fixture
- [x] 7.5 The matrix records the last real-export check of each of the ten existing formats (their fixtures of 2026-10-14 and 2026-10-21); re-exporting them from the current app versions needs the owner's accounts (QUESTIONS.md), and `make release-prepare` for 1.0 refuses any row older than 120 days, so the re-check cannot be skipped before the release
- [x] 7.6 `ot import --format` help lists the new ids; verify `go test ./internal/cli -run Import`
- [x] 7.7 `docs/import.md` sections per new format, `docs/api.md` (`columns` option), the CHANGELOG entry under Unreleased; verify `make docs-check`
- [ ] 7.8 `go test ./...`, `cd web && npm test && npm run build`, and `make check` (TZ=UTC) pass
