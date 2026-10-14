# Tasks

## 1. Fixtures

- [ ] 1.1 Collect the maintainer's exports (Todoist project CSV and backup ZIP, TickTick CSV, Linear CSV), record each format's exact header and quirks in `design.md` D1/D3, and note which task in each file has which known UI priority. Verify by listing the confirmed columns per format in the design.
- [ ] 1.2 Write `internal/importer/testdata/sanitize.go` (a `go run` tool) that replaces names, titles, notes and labels with deterministic placeholders while keeping structure, dates, priorities, recurrence strings and metadata lines. Verify with a unit test on a small sample and by maintainer review of every sanitised file.
- [ ] 1.3 Commit the sanitised fixtures under `testdata/<format>/`. Verify `git grep` finds none of the original account names or task titles.

## 2. Archive support

- [ ] 2.1 Add ZIP handling before detection (D2): in-memory listing, 1,000-entry and 10×-uncompressed limits enforced while reading, skipping folders, `__MACOSX/` and dot-files, single-format check, entry-prefixed line numbers. Verify unit tests for a valid archive, too many entries, an oversized expansion, mixed formats and a path-traversal entry name. Run `go test ./...`.
- [ ] 2.2 Return the archive refusals as `400` with clear messages from the preview route, and keep `401` for unauthenticated uploads. Verify `httpapi` tests for each refusal and the unauthenticated case. Run `go test ./...`.

## 3. Todoist

- [ ] 3.1 Implement `todoist-csv` (detection, indent tree, sections, priority mapping, `@label` extraction, NLP dates with `DATE_LANG`, recurrence, notes appended under "Comments", responsible people dropped with a warning) and `todoist-backup` through the archive step. Verify golden previews for the project CSV and backup fixtures, including the known-p1 task and an `every monday` task. Run `go test ./...`.
- [ ] 3.2 Document `todoist-csv` and `todoist-backup` in `docs/import.md` (signature, mapping table, warnings) and write `docs/switch/todoist.md`. Verify `make docs` and `make docs-check` pass.

## 4. TickTick

- [ ] 4.1 Implement `ticktick-csv` (metadata skip, folders as parent projects, column name to section, checklists to subtasks, priority 5/3/1/0, RRULEs, time zone and floating handling, completion). Verify the golden preview of the TickTick fixture, including a three-item checklist with one item checked. Run `go test ./...`.
- [ ] 4.2 Document `ticktick-csv` in `docs/import.md` and write `docs/switch/ticktick.md`. Verify `make docs-check`.

## 5. Linear

- [ ] 5.1 Implement `linear-csv` (project or team, status to section in first-seen order, completed and canceled handling with the `canceled` label, priority mapping, parent issue, identifier-prefixed description, estimates, cycles and other assignees dropped with warnings). Verify the golden preview of the Linear fixture, and an interaction test that the imported project's board shows the status columns. Run `go test ./...` and `npm test`.
- [ ] 5.2 Document `linear-csv` in `docs/import.md` and write `docs/switch/linear.md`. Verify `make docs-check`.

## 6. Things

- [ ] 6.1 Publish the `things-export` v1 shape in `docs/import.md` and implement `things-json` (areas as parent projects, headings to sections, checklists to subtasks, `when` to due, deadline as a description line, someday and evening dropped with warnings, repeat to recurrence, logbook to completed). Verify golden previews for a hand-made fixture in the published shape. Run `go test ./...`.
- [ ] 6.2 Build the Apple Shortcut that writes the shape, write its steps in `docs/switch/things.md` with the tested Things version, and add the maintainer's real Shortcut export as a fixture. Verify the real export's golden preview and `make docs-check`.

## 7. Detection and integration

- [ ] 7.1 Reorder `Profiles` (D1) and add a detection test that every fixture, including the existing generic ones, is assigned its own format and nothing else. Verify `go test ./...`.
- [ ] 7.2 Show the new format names and descriptions in the import screen's format selector, and list them in the `unsupported_format` message. Verify an `httpapi` test of the error body and a happy-dom test of the selector. Run `npm test` and `npm run build`.
- [ ] 7.3 Add screenshots of an import preview for the switch guides via `scripts/screenshots.mjs` with a fixture. Verify the images exist with alt text and `make docs-check` passes.
- [ ] 7.4 Add a CHANGELOG entry under Unreleased and run `make check`. Verify it passes, including `openspec validate --all --strict`.
