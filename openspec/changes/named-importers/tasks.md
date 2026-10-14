# Tasks

## 1. Fixtures

- [ ] 1.1 Ask the maintainer for richer samples from throwaway accounts (Todoist: recurring, reminder, deadline, duration, label, comment, a p1 task with its UI flag noted; Things: area, repeating to-do, completed and canceled, someday, evening, reminder, nested tag; TickTick: folder, checklist, subtask, due date with time, reminder, repeat, completed and abandoned, priorities, a kanban list; Linear: due date, parent issue, canceled issue). Record any new quirks in `design.md`. Verify the design's "Real exports examined" lists each sample's structure.
- [ ] 1.2 Write `internal/importer/testdata/sanitize.go` (a `go run` tool) for CSV and ZIP (text columns, names, user ids, emails, file names) and SQLite (text columns in a copy, then `VACUUM`), keeping structure, dates, priorities, recurrence, statuses, the BOM and preambles (D5). Verify a unit test on small samples of each kind, and maintainer review of every sanitised file.
- [ ] 1.3 Commit the sanitised fixtures under `testdata/<format>/` (Todoist backup, Things database, TickTick backup, Linear CSV, plus the richer samples). Verify `git grep` finds none of the original names, emails, user ids or task titles.

## 2. Archive and safe database handling

- [ ] 2.1 Add ZIP handling before detection (D2): in-memory listing, 1,000-entry and 10×-uncompressed limits enforced while reading, skipping folders, `__MACOSX/` and dot-files, a single-format check, entry-prefixed line numbers, and the `.thingsdatabase` folder shape (`main.sqlite` plus optional `-wal`). Verify unit tests for a valid CSV archive, a zipped Things folder, too many entries, an oversized expansion, mixed formats and a path-traversal entry name. Run `go test ./...`.
- [ ] 2.2 Add the safe SQLite opener (D4): a private temp directory under the data directory, read-only (immutable without WAL), `query_only`, a timeout, the known-table check, the `databaseVersion` check, and cleanup on every path. Verify tests for a Things fixture, a non-Things SQLite file refused with `400`, a truncated file, and that the temp directory is gone after preview, import and errors. Run `go test ./...`.
- [ ] 2.3 Return archive and database refusals as `400` with clear messages from the preview route, and keep `401` for unauthenticated uploads. Verify `httpapi` tests for each refusal and the unauthenticated case. Run `go test ./...`.

## 3. Todoist

- [ ] 3.1 Extract month, weekday and keyword vocabularies for `en`, `de`, `es`, `fr`, `it` and `pt` from `web/src/lib/nlp/vocab/*.ts` into a shared JSON vector file, and add a TypeScript test that the web parser agrees with it. Verify `npm test`.
- [ ] 3.2 Implement the Todoist date parser (D7): day and month forms with optional year and time, relative words, recurring phrases translated to the recurrence grammar, year inference from the export date, and unknown phrases kept as warnings. Verify Go tests over the shared vectors in all six languages, including `21 Okt.` exported 2026-09-19 giving 2026-10-21. Run `go test ./...`.
- [ ] 3.3 Implement `todoist-csv` and `todoist-backup` (BOM, `meta` view style, blank rows, indent tree, sections, priority mapping confirmed by the p1 fixture, `@label` extraction, dates through 3.2 with `TIMEZONE`, reminders, deadline and duration handling, notes under "Comments", responsible people). Verify golden previews for the backup and richer fixtures. Run `go test ./...`.
- [ ] 3.4 Document `todoist-csv` and `todoist-backup` in `docs/import.md` and write `docs/switch/todoist.md`. Verify `make docs` and `make docs-check` pass.

## 4. TickTick

- [ ] 4.1 Implement `ticktick-csv` (the preamble read by record with export date and version, folders as parent projects, column name to section, `parentId` and checklist subtasks, tags, priority 5/3/1/0, floating and zoned due dates, reminders, RRULEs, completed and abandoned). Verify golden previews for the backup and richer fixtures. Run `go test ./...`.
- [ ] 4.2 Document `ticktick-csv` in `docs/import.md` and write `docs/switch/ticktick.md`. Verify `make docs-check`.

## 5. Linear

- [ ] 5.1 Implement `linear-csv` (project or team, status to section in first-seen order, completed and canceled with the `canceled` label, priority text, labels split, due date, parent by identifier, identifier-prefixed description, assignee kept when it's the importer's email, warnings for estimates, cycles, milestones, initiatives, SLA and relations). Verify golden previews for the Linear fixtures, including an issue assigned to the importer. Run `go test ./...`.
- [ ] 5.2 Document `linear-csv` in `docs/import.md` and write `docs/switch/linear.md`. Verify `make docs-check`.

## 6. Things

- [ ] 6.1 Implement `things-db` on the safe opener (D4): areas, projects, headings, to-dos with their containers, checklist items, tags with flattened parents, notes (XML unwrapped), packed dates, reminders, recurrence plists, completed and canceled, trashed skipped, deadline as a description line, someday and evening warnings. Verify golden previews for the Things fixtures, including the packed date 132819584 giving 2026-10-21. Run `go test ./...`.
- [ ] 6.2 Document `things-db` in `docs/import.md` and write `docs/switch/things.md` (Mac copy with Things closed, the iPhone/iPad diagnostics route, zipping the folder). Verify `make docs-check`.

## 7. Detection, hints and integration

- [ ] 7.1 Reorder `Profiles` (D1) and add a detection test that every fixture, including the existing generic ones, gets its own format and nothing else. Verify `go test ./...`.
- [ ] 7.2 Add `viewHints` to the job result (D8) and apply them in the web import screen after a commit by setting those projects to board on the device. Verify an `httpapi` test of the hints and a happy-dom test that an imported Todoist board project opens as a board. Run `npm test` and `npm run build`.
- [ ] 7.3 Show the new format names and descriptions in the import screen's format selector, and list them in the `unsupported_format` message. Verify an `httpapi` test of the error body and a happy-dom test of the selector. Run `npm test` and `npm run build`.
- [ ] 7.4 Add screenshots of an import preview for the switch guides via `scripts/screenshots.mjs` with a fixture. Verify the images exist with alt text and `make docs-check` passes.
- [ ] 7.5 Add a CHANGELOG entry under Unreleased and run `make check`. Verify it passes, including `openspec validate --all --strict`.
