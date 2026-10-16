# Tasks

## 1. Fixtures

- [x] 1.1 Ask the maintainer for richer samples from throwaway accounts (Todoist: recurring, reminder, deadline, duration, label, comment, a p1 task with its UI flag noted; Things: area, repeating to-do, completed and canceled, someday, evening, reminder, nested tag; TickTick: folder, checklist, subtask, due date with time, reminder, repeat, completed and abandoned, priorities, a kanban list; Linear: due date, parent issue, canceled issue). Record any new quirks in `design.md`. Verify the design's "Real exports examined" lists each sample's structure. Note: richer maintainer samples were not received; synthesised fixtures (`rich.*`, built from the documented real structures) stand in, and `design.md` records which fixtures are real and which are synthesised, plus the quirks found.
- [x] 1.2 Write `internal/importer/sanitize` (a `go run` tool) for CSV and ZIP (text columns, names, user ids, emails, file names) and SQLite (text columns in a copy, then `VACUUM`), keeping structure, dates, priorities, recurrence, statuses, the BOM and preambles (D5). Verify a unit test on small samples of each kind, and maintainer review of every sanitised file.
- [x] 1.3 Commit the sanitised fixtures under `testdata/<format>/` (Todoist backup, Things database, TickTick backup, Linear CSV, plus the richer samples once received, each with a golden preview). Verify `git grep` finds none of the original names, emails, user ids or task titles. Note: the sanitised real fixtures (`backup.zip`, `backup.csv`, `export.csv`, `main.sqlite`) and the synthesised `rich.*` stand-ins each have a golden preview; the only email addresses are `@example.test` placeholders.

## 2. Archive and safe database handling

- [x] 2.1 Add ZIP handling before detection (D2): in-memory listing, 1,000-entry and 10×-uncompressed limits enforced while reading, skipping folders, `__MACOSX/` and dot-files, a single-format check, entry-prefixed line numbers, and the `.thingsdatabase` folder shape (`main.sqlite` plus optional `-wal`). Verify unit tests for a valid CSV archive, a zipped Things folder, too many entries, an oversized expansion, mixed formats and a path-traversal entry name. Run `go test ./...`.
- [x] 2.2 Add the safe SQLite opener (D4): a private temp directory under the data directory, read-only (immutable without WAL), `query_only`, a timeout, the known-table check, the `databaseVersion` check, and cleanup on every path. Verify tests for a Things fixture, a non-Things SQLite file refused with `400`, a truncated file, and that the temp directory is gone after preview, import and errors. Run `go test ./...`.
- [x] 2.3 Return archive and database refusals as `400` with clear messages from the preview route, and keep `401` for unauthenticated uploads. Verify `httpapi` tests for each refusal and the unauthenticated case. Run `go test ./...`.

## 3. Todoist

- [x] 3.1 Extract month, weekday and keyword vocabularies for `en`, `de`, `es`, `fr`, `it` and `pt` from `web/src/lib/nlp/vocab/*.ts` into a shared JSON vector file, and add a TypeScript test that the web parser agrees with it. Verify `npm test`.
- [x] 3.2 Implement the Todoist date parser (D7): day and month forms with optional year and time, relative words, recurring phrases translated to the recurrence grammar, year inference from the export date, and unknown phrases kept as warnings. Verify Go tests over the shared vectors in all six languages, including `21 Okt.` exported 2026-09-19 giving 2026-10-21. Run `go test ./...`.
- [x] 3.3 Implement `todoist-csv` and `todoist-backup` (BOM, `meta` view style, blank rows, indent tree, sections, priority mapping confirmed by the p1 fixture, `@label` extraction, dates through 3.2 with `TIMEZONE`, reminders, deadline and duration handling, notes under "Comments", responsible people). Verify golden previews for the committed fixtures (richer samples arrive through 1.1 and 1.3). Run `go test ./...`.
- [x] 3.4 Document `todoist-csv` and `todoist-backup` in `docs/import.md` and write `docs/switch/todoist.md`. Verify `make docs` and `make docs-check` pass.

## 4. TickTick

- [x] 4.1 Implement `ticktick-csv` (the preamble read by record with export date and version, folders as parent projects, column name to section, `parentId` and checklist subtasks, tags, priority 5/3/1/0, floating and zoned due dates, reminders, RRULEs, completed and abandoned). Verify golden previews for the committed fixtures (richer samples arrive through 1.1 and 1.3). Run `go test ./...`.
- [x] 4.2 Document `ticktick-csv` in `docs/import.md` and write `docs/switch/ticktick.md`. Verify `make docs-check`.

## 5. Linear

- [x] 5.1 Implement `linear-csv` (project or team, status to section in first-seen order, completed and canceled with the `canceled` label, priority text, labels split, due date, parent by identifier, identifier-prefixed description, assignee kept when it's the importer's email, warnings for estimates, cycles, milestones, initiatives, SLA and relations). Verify golden previews for the Linear fixture, and an HTTP test that issues assigned to the importer stay assigned and the job returns a board hint for the project. Run `go test ./...`.
- [x] 5.2 Document `linear-csv` in `docs/import.md` and write `docs/switch/linear.md`. Verify `make docs-check`.

## 6. Things

- [x] 6.1 Implement `things-db` on the safe opener (D4): areas, projects, headings, to-dos with their containers, checklist items, tags with flattened parents, notes (XML unwrapped), packed dates, reminders, recurrence plists, completed and canceled, trashed skipped, deadline as a description line, someday and evening warnings. Verify golden previews for the committed Things fixture and unit tests for packed dates (132819584 gives 2026-10-21), reminder times and repeat plists. Run `go test ./...`.
- [x] 6.2 Document `things-db` in `docs/import.md` and write `docs/switch/things.md` (Mac copy with Things closed, the iPhone/iPad diagnostics route, zipping the folder). Verify `make docs-check`.

## 7. Detection, hints and integration

- [x] 7.1 Reorder `Profiles` (D1) and add a detection test that every fixture, including the existing generic ones, gets its own format and nothing else. Verify `go test ./...`.
- [x] 7.2 Add `viewHints` to the job result (D8) and apply them in the web import screen after a commit by setting those projects to board on the device. Verify an `httpapi` test of the hints and a happy-dom test that an imported Todoist board project opens as a board. Run `npm test` and `npm run build`.
- [x] 7.3 Show the new format names and descriptions in the import screen's format selector, and list them in the `unsupported_format` message. Verify an `httpapi` test of the error body and a happy-dom test of the selector. Run `npm test` and `npm run build`.
- [x] 7.4 Add screenshots of an import preview for the switch guides via `scripts/screenshots.mjs` with a fixture. Verify the images exist with alt text and `make docs-check` passes.
- [x] 7.5 Add a CHANGELOG entry under Unreleased and run `make check`. Verify it passes, including `openspec validate --all --strict`.
