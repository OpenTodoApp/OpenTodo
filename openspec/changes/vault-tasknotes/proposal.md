# Proposal

## Why

Issue [#440](https://github.com/OpenTodoApp/OpenTodo/issues/440): people who use the Obsidian **TaskNotes** plugin keep their larger tasks as one note per task, with the task's fields in the note's frontmatter. `ot vault` syncs only inline Obsidian Tasks lines (one file per project, one line per task), so those tasks never reach OpenTodo's Today, calendar or reminders.

It's worse than a missing feature. If a TaskNotes folder sits inside a vault folder, today's scan reads every task note as a *project file* (`internal/vault/engine.go:207` `vaultFile` accepts any `.md` outside hidden folders), and `mapFiles` (`internal/vault/merge.go:108`) creates one project per note.

A TaskNotes file maps closely onto OpenTodo's fields. The reporter confirmed that TaskNotes ignores frontmatter keys it didn't create, so a stored id is safe.

## What Changes

- **Opt in per vault.** `ot vault tasknotes <folder>` links one TaskNotes folder to a vault: inside the vault folder or next to it, for example `../TaskNotes/Tasks`. `ot vault tasknotes --off` unlinks it. `ot vault init` prints a hint when the folder is inside an Obsidian vault that has TaskNotes installed. Nothing is linked automatically.
- **One note, one task.** Every note in the linked folder that TaskNotes counts as a task (by its task tag or task property, as configured) is one OpenTodo task, matched by an `opentodo-id` frontmatter key. That's the same key the project files use. A task note without the key creates a task and gains the key on the next write.
- **The user's field mapping, not the defaults.** The vault reads TaskNotes' own settings (`.obsidian/plugins/tasknotes/data.json`, found by walking up from the folder): renamed fields, custom statuses and their "completed" flag, custom priorities and their weights, the default status and priority, and how tasks are identified. Without that file, it uses TaskNotes' documented defaults and says so.
- **Mapped fields:**
  - title; status as open or done; priority as 1–4;
  - scheduled as the do-on date and time, and due as the deadline;
  - tags and contexts as labels;
  - projects (wiki links to the vault's project files) as the task's project;
  - time estimate; recurrence (an RRULE, converted with the CalDAV conversion) together with completed instances;
  - completed date; time entries; the note body as the description.
- **The same merge and conflict rules as the lines.** Each field gets the same three-way merge against the last-synced value. A field the note can only express approximately (a priority between two of the user's levels, a due time) counts as changed only when the note's value differs from what the vault would write for the base value, so a lossy mapping never makes the sync bounce a value back and forth.
- **Untouched by default.** Frontmatter keys the vault doesn't map, unknown values, comments and the order of keys are preserved byte for byte. The vault edits only the lines of the keys whose value changed.
- **Deletes.** Deleting a note trashes its task when the task is unchanged in the app since the last sync, as removing a line does. Trashing the task in the app removes the note when the note is unchanged since the last write, and otherwise leaves it and reports a conflict. An archived note (TaskNotes' archive tag) stops syncing and leaves its task as it is.
- **Fences.** Task notes are never read as project files. Tasks created in the app keep going to the inline project files; a task lives either in a line or in a note, never both.

No server, op schema or API change: the vault writes through the operation log as the device it already is. No new environment variable and no new dependency. Not **BREAKING**: vaults without a linked folder behave exactly as before.

**Out of scope**:
- creating notes for tasks made in the app, and moving a task between a line and a note;
- TaskNotes `blockedBy`, `reminders`, pomodoros and ICS links (preserved, not synced);
- subtasks inside notes;
- running inside Obsidian as a plugin.

ROADMAP.md: extends row 20 (Markdown vault).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `markdown-vault`: new requirements for linking a TaskNotes folder, matching notes to tasks, reading the user's TaskNotes settings, the field mapping, merging approximate fields, deletes and archives, and fencing notes from project files. Existing requirements are unchanged; the new ones say where note files differ from project files.

## Impact

- **Code (CLI only, the server binary is unchanged)**:
  - `internal/vault`: a new `tasknotes.go` (settings, frontmatter reader and line editor, mapping) and its tests;
  - the scan in `engine.go`: exclude the linked folder, read notes;
  - the merge in `merge.go` and `task.go`: project a note to the same field map `proj` produces;
  - the plan and apply in `plan.go`: write notes, deletes;
  - the state in `state.go`: the linked folder, the notes' paths and their file hashes.
- **CLI**: `internal/cli/cmd_vault.go` gets the `tasknotes` subcommand, plus `ot schema` and `ot help --json`.
- **Docs**: `docs/vault.md` gets a TaskNotes section and the mapping table; CHANGELOG.md.
- **Size**: a few hundred lines of Go in `ot`, with no new module. `go.yaml.in/yaml/v4` stays indirect, because the reader is a small subset parser that keeps the file's own text.
- **Issue**: Closes #440.
