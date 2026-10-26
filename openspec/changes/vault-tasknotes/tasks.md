# Tasks

## 1. Settings, state and the fence

- [x] 1.1 Pin TaskNotes' settings shape. Confirmed from the plugin's source (TaskNotes `src/settings/defaults.ts`, `@tasknotes/model` 0.3.0-rc.18) instead of a throwaway install; `default.json` is built from those defaults and `custom.json` with renamed fields, custom statuses and priorities. Keep both, anonymised, under `internal/vault/testdata/tasknotes/settings/`. Confirm the key names used in design D3 and D5 (`fieldMapping`, `customStatuses`, `customPriorities`, `complete_instances`, `timeEntries`, `projects`, the archive tag) and correct the design where they differ. Verify: the files are committed, and design.md's table matches them.
- [x] 1.2 Add the `TaskNotes` state section and state version 2 (design D1), including the refusal of a newer state by an older `ot`. Verify: `go test ./internal/vault -run State` covers loading a version-1 state as unlinked, a round trip of version 2, and the refusal error.
- [x] 1.3 `ot vault tasknotes <folder>` and `--off` in `internal/cli/cmd_vault.go`, with the path checks (a folder inside the vault folder only with `--inside`, design Risks), the scope check and the `init` hint; also `ot schema` and `ot help --json`. Verify: `go test ./internal/cli -run Vault` covers exit 2 for a missing path, the hint when `.obsidian/plugins/tasknotes` exists above the folder, and `insufficient_scope` for a read token.
- [x] 1.4 Fence the linked folder out of `vaultFile` and `scanFiles`, and add `scanNotes` with the hash skip and the limits (design D2). Verify: a test with 40 notes inside the vault folder produces no project and counts toward the 20,000-task limit, and a 1 MB note stops the sync before any write.
- [x] 1.5 Read the settings (design D3): walk up to `.obsidian`, read `data.json` leniently, fall back to the defaults with one warning, and stop with exit 2 when the file is not valid JSON. Verify: `go test ./internal/vault -run TaskNotesSettings` covers the recorded files from 1.1, the missing file and the broken file.

## 2. Frontmatter reader and editor

- [x] 2.1 Write the subset reader with per-key line ranges, and the line editor (design D4). Verify:
  - golden tests under `internal/vault/testdata/tasknotes/notes/` built from the anonymised shapes of the three issue samples (open with recurrence and contexts; open with a scheduled date and a link-only body; done with `completedDate`, an empty tag and `taskSourceType`) parse to the recorded values;
  - editing one key changes only that key's lines;
  - a no-op write is byte-identical.
- [x] 2.2 Add a fuzz test `FuzzTaskNoteFront`: random frontmatter plus one edited mapped key leaves every other line byte-identical, and an unsupported form makes only that field read-only. Verify: `go test ./internal/vault -run xxx -fuzz FuzzTaskNoteFront -fuzztime 30s` finds nothing, and the seed corpus is committed.

## 3. Mapping and merge

- [x] 3.1 Project a note to the field map that `proj` uses, and render a task back to note values, per the table in design D5: status, priority by weight, scheduled/due, labels across `tags` and `contexts`, the project link, estimate, recurrence with `DTSTART` kept, `completedDate`, the body and `dateModified`. Verify: `go test ./internal/vault -run TaskNotesMap` covers every row of the table, including renamed fields from the 1.1 settings, a custom completed status, and fewer priority levels than four.
- [x] 3.2 Merge in the note's value space (design D6) and add `tasknotes.conflict.md`. Verify: `go test ./internal/vault -run TaskNotesMerge` covers each of these, with the ops asserted:
  - a change only in the note (pushed);
  - a change only in the app (written, with only that key's lines changed);
  - a change on both sides (the app wins and the conflict file names the note and field);
  - an approximate priority and a deadline time that do not bounce over two syncs;
  - an offline edit that converges with a concurrent title change.
- [x] 3.3 Recurrence and completed instances: a new instance date completes the occurrence through `recurring`, and an app completion appends the date and moves `scheduled`. Verify: tests with the yearly sample rule, a rule the grammar cannot express (read-only plus a warning), and `recurrence_anchor: completion`.
- [x] 3.4 Time entries: identity `(task, startTime)`, per-field merge of `endTime` and `description`, other members' entries read-only, and a running entry. Verify: `go test ./internal/vault -run TaskNotesTime` with ops asserted against the `time_entry` schema, including the author rule.
- [x] 3.5 Encrypted accounts (design D8): notes decrypt with the stored key, pushes are ciphertext, and an undecryptable value becomes read-only. Verify: `TestTaskNotesEncrypted` (`internal/vault/tasknotes_crypt_test.go`), the encrypted-account case for a linked folder.

## 4. Creation, deletes and archive

- [x] 4.1 A task note without an id creates a task and gains `opentodo-id`; an unknown id is reported and the note left alone; a renamed note is found again by its id. Verify: tests asserting the created op, the one inserted line, and the updated stored path.
- [x] 4.2 Deletes, trash and archive (design D7). Verify: `go test ./internal/vault -run TaskNotesDelete` covers a deleted note with an unchanged task (trashed), a deleted note with an app change (written again), a trash in the app with an unchanged note (note deleted), a trash with an edited note (kept, unlinked, conflict reported in `ot vault status`), and archive on and off.
- [x] 4.3 `watch` also watches the linked folder's modification times, and `status` lists changed notes without the server. Verify: tests in the existing watch and status tests.

## 5. Docs and release

- [x] 5.1 `docs/vault.md`: a TaskNotes section with linking, the mapping table, what isn't synced, deletes and archive, and the encrypted-account note; plus one complete example note that is also a fixture. Verify: `npm run docs:check`, and the fixture test reads the example byte for byte.
- [x] 5.2 Add a CHANGELOG.md entry under Unreleased and update ROADMAP.md row 20 (Markdown vault) with TaskNotes. Verify: `npm run docs:check`.
- [x] 5.3 Run `go test ./...`, `make check` and `make openspec-validate`. Verify: all pass.
- [ ] 5.4 After the PR is merged, reply on issue #440 with a short, friendly note: how to link a TaskNotes folder, what maps and what doesn't yet, and the release it lands in. Thank the reporter for the sample files, then close the issue. Verify: `gh issue view 440 -R OpenTodoApp/OpenTodo` shows the comment and the state CLOSED.
