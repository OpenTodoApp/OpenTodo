# Design

## Context

See proposal.md, "Why". How `ot vault` works today, which this design reuses:

- **Device and exchange.** The vault is a device `vault:<id>` that pulls and pushes ops through `/api/v1/sync` (`internal/vault/exchange.go`, `http.go`). Its state, `.opentodo/state.json` (`state.go:28`), holds the cursor, the clock, `Store` (the account as of the last sync, which is the merge base), the hash of every written file, and `Printed` (task id → file).
- **Scan.** The scan (`engine.go:220` `scanFiles`, `engine.go:249` `scan`) reads every `.md` file outside hidden folders, except conflict files, and skips a file whose hash matches the last write.
- **Files to projects.** `mapFiles` (`merge.go:108`) matches files to projects by the `opentodo-id` frontmatter key. Frontmatter is read line by line (`doc.go` `frontKeyRe`), and keys the vault doesn't own are kept verbatim.
- **Three-way merge.** Each task is projected to a flat field map (`task.go:53` `proj`: title, done, donedate, due, start, deadline, estimate, priority, recur, note, labels, project, …). `mergeTask` and `setField` (`task.go:228`, `:320`) compare the file's map with the base's and the app's, per field. Conflicts are appended to `<file>.conflict.md` (`merge.go:447`). Removed lines trash a task only if it's unchanged in the app (`merge.go:457`).
- **Recurrence.** Completing a recurring task goes through `recurring` (`task.go:442`), as the app does it. RRULE conversion already exists: `internal/recurrence/rrule.go` `Rule.RRULE()` and `FromRRULE(value, due)`, used by CalDAV.
- **Encryption.** In an encrypted account, content is decrypted on the machine through the `Crypter` (`layout.go:25`), and every content value pushed is encrypted.
- **Time entries.** `time_entry` (`internal/sync/ops.go:535`) has `task_id`, `user_id` (the author, never changed), `started_at`, `ended_at` and `note`, the last of which is a content field.

The TaskNotes format comes from the issue's three samples. Keys seen: `title`, `status` (`open`, `done`), `priority` (`normal`, `none`), `due`, `scheduled`, `recurrence` (`DTSTART:20260802;FREQ=YEARLY`), `tags` (a block list including the identification tag `task`, a nested tag `financial/maintenance` and an empty string `""`), `contexts`, `completedDate`, `dateCreated`, `dateModified` (ISO times with an offset), and `taskSourceType`. TaskNotes writes only the keys a note needs, so any key may be missing.

According to the TaskNotes documentation, these keys are also possible: `projects` (wiki links), `timeEstimate` (minutes), `timeEntries` (a list of maps `startTime`, `endTime`, `description`), `complete_instances` (dates), `recurrence_anchor`, `blockedBy`, `reminders`, and the archive tag.

**Confirmed in task 1.1** against the plugin's source (TaskNotes `src/settings/defaults.ts` and `@tasknotes/model` 0.3.0-rc.18 `defaults.ts`, `mapping.ts`, `types.ts`), read only; no Obsidian install was needed:

- `fieldMapping` holds `title`, `status`, `priority`, `due`, `scheduled`, `contexts`, `projects`, `timeEstimate`, `completedDate`, `dateCreated`, `dateModified`, `recurrence`, `recurrenceAnchor` (key `recurrence_anchor`), `archiveTag` (default tag `archived`), `timeEntries`, `completeInstances` (key `complete_instances`), `skippedInstances`, `blockedBy`, `reminders` and others the vault preserves.
- `customStatuses` entries have `value` and `isCompleted`; `customPriorities` entries have `value` and `weight`. The defaults are `none`/`open`/`in-progress`/`done` (only `done` completed) and `none` 0, `low` 1, `normal` 2, `high` 3.
- `defaultTaskStatus` (`open`), `defaultTaskPriority` (`normal`), `taskTag` (`task`), `taskIdentificationMethod` (`tag` or `property`), `taskPropertyName`, `taskPropertyValue` and `storeTitleInFilename` sit at the top level. `tags` is Obsidian's own property, never mapped.
- The title comes from the title key when it holds text, otherwise from the file name.
- A time entry is `{startTime, endTime?, description?}` with ISO times (`toISOString`).

The fixtures under `internal/vault/testdata/tasknotes/settings/` are built from those defaults (`default.json`) and from a renamed copy with custom statuses and five priorities above the default (`custom.json`), not recorded from a running Obsidian.

## Goals / Non-Goals

**Goals:**
- Task notes become ordinary OpenTodo tasks with the vault's merge guarantees.
- The user's renamed fields, statuses and priorities are honoured.
- A note's text changes only where a mapped value changed.

**Non-Goals:**
- Writing new notes for app tasks.
- Syncing TaskNotes features that OpenTodo models differently: blockers, reminders, pomodoros, ICS.
- A YAML library.

## Decisions

### D1. Linking: an explicit folder in the state file

The state gets a new section, `TaskNotes {Folder string; Notes map[taskID]path; Hashes map[path]hash; Archived map[taskID]bool}`. The folder is stored relative to the vault folder when it's below it, and absolute otherwise. The hashes of notes are a map of their own rather than `tn:` keys in `Files`: `Files` is read as "project → file" in several places, and a note there would look like a second Inbox. Unlinking resets `Initialized`, so the next sync prints every project file again and the tasks that lived in notes come back as lines.

The state version goes to 2. A version-1 file reads as "nothing linked", so older vaults are unaffected. `LoadState` (`state.go:74`) checks no version today, so task 1.2 adds the refusal of a newer state. Already-released `ot` binaries won't have it; see Risks.

Opt-in rather than auto-detection: linking makes the vault write into notes the user keeps for other reasons, so it should be a decision, not a side effect of `init`.

Alternative considered: a flag on every `sync`. Rejected, because `watch` and `status` would each need it, and forgetting it once would make the notes look deleted.

### D2. Fence

`vaultFile` and `scanFiles` skip the linked folder when it's below the vault folder. Notes are read by a separate `scanNotes` with the same hash skip, size limit and limits accounting (a note counts as one task towards the 20,000; the body is capped at 64 KB like a note).

### D3. Settings source

The vault walks up from the linked folder to the first directory holding `.obsidian/`, and reads `plugins/tasknotes/data.json` there with `encoding/json` into a struct of the fields it needs:

- `fieldMapping`
- `customStatuses` (`value`, `isCompleted`)
- `customPriorities` (`value`, `weight`)
- `defaultTaskStatus`, `defaultTaskPriority`
- `taskTag`, `taskIdentificationMethod`, `taskPropertyName`, `taskPropertyValue`
- the archive tag

Unknown fields are ignored. The file is re-read on every sync, which is cheap and picks up renames. Defaults, used when the file is missing, are TaskNotes' documented ones and live in one table in `tasknotes.go`.

### D4. Frontmatter: a subset reader and a line editor, no dependency

The reader understands:

- plain, single-quoted and double-quoted scalars;
- block sequences of scalars;
- flow sequences of scalars (`[a, b]`);
- block sequences of flat maps (time entries);
- comments and blank lines.

It records, for each top-level key, the line range it occupies.

The editor replaces only the line range of a key whose value changed. It appends a missing key at the end of the frontmatter, and removes a key the app cleared. Every other line stays byte for byte, so key order, comments and unknown keys survive. Values the vault writes are quoted only when YAML needs it.

A mapped key in a form the reader doesn't support (anchors, block scalars `|` or `>`, nested maps outside time entries) makes that one field read-only for the note, with a warning, rather than failing the note. A list item the old list held keeps the text it was written with (`""`, quotes), so rewriting `tags` to add one label changes one line. A note whose every line ends in CRLF keeps CRLF; a note with mixed line ends is kept as written. Dates and ISO times are written plain, as TaskNotes writes them.

Why not `go.yaml.in/yaml/v4` as a direct dependency? It's a release candidate, its round trip doesn't keep the user's formatting, and the vault's existing frontmatter handling is already line-based. Expected size: about 500 lines plus tests, no change to the server binary, and a negligible effect on `ot`'s size.

### D5. Field mapping

| TaskNotes (default key) | OpenTodo field (projection key) | Read | Write | Lossy |
| --- | --- | --- | --- | --- |
| `title` (or the file name when the key is missing or empty) | `title` | text | the `title` key, added when the note has none; the file is never renamed | no |
| `status` | `done` | completed when the value is a status with `isCompleted` | done → first completed status; reopened → default status; open stays as written (`in-progress` is kept) | open statuses collapse to "not done" |
| `priority` | `priority` 1–4 | rank priorities by weight; the default priority and every priority below it → 4; priorities above it, highest first → 1, 2, 3 (any further levels → 3) | the highest-weight value mapping to that number; when none does (fewer levels), the nearest level above it | yes, see D6 |
| `scheduled` | `due` (do-on `{date, time?}`) | `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` | the same form | no |
| `due` | `deadline` (`YYYY-MM-DD`) | the date part | the date; an existing time is kept when the date is unchanged | the time of day |
| `tags` without the task tag, and `contexts` | `labels` | each value is a label name (`/` kept); a missing label is created, like `#tags` | a label already in `contexts` stays there, the others go to `tags`; the task tag and empty strings are kept | which list a new label goes into |
| `projects` | `project` | the first wiki link whose target is a project file of the vault (by file stem) or a project name; otherwise Inbox | `[[<project file stem>]]` replaces the link that named the old project; other links are kept | extra links are not synced |
| `timeEstimate` | `estimate` | minutes | minutes | no |
| `recurrence` + `recurrence_anchor` | `recur` | `FromRRULE` with any `DTSTART:` prefix split off, the due date as the anchor; anchor `completion` → `after completion` | `Rule.RRULE()` with the original `DTSTART` part kept | a rule the grammar can't express is read-only (D4) |
| `complete_instances` | an occurrence completion | the current occurrence's date newly listed → complete it through `recurring` | the done occurrence's date appended; the next date goes to `scheduled` | no |
| `completedDate` | `donedate` | as `✅` (12:00 local) | the local date | no |
| `timeEntries` | `time_entry` rows of the vault's user | identity `(task, startTime)`; `endTime` and `description` merge per field | the user's entries in `started_at` order | other members' entries are written read-only; a running entry has no `endTime` |
| body | `note` (description) | Markdown | Markdown | no |
| `dateModified` | — | ignored | set to now (local offset) on every write that changes the note | — |
| `dateCreated`, `taskSourceType`, `blockedBy`, `reminders`, pomodoros, ICS, unknown keys | — | preserved | untouched | not synced |

The `opentodo-id` key is the same as in project files: one name across the vault, ignored by TaskNotes.

### D6. Merging in the note's value space

For each mapped field, the vault computes three values: `noteValue` (parsed from the note), `baseOut` (what it would write for the base) and `appOut` (what it would write for the app). A field counts as changed in the note only if `noteValue` differs from `baseOut`, compared in the note's own form. When it has changed, the note's value is converted and pushed.

This stops approximate mappings from bouncing. For example, priority 2 is written as `high`, which reads back as 1. Since `high` equals `baseOut`, nothing is pushed. The same rule keeps a due time or an `in-progress` status unchanged.

After this comparison, the note's field map goes through the existing `mergeTask` logic unchanged. Conflicts go to one file, `tasknotes.conflict.md`, at the vault root. A conflict file inside the TaskNotes folder would itself look like a note, and could look like a task to a property-based identification.

### D7. Deletes, trash, archive

- **A note disappears.** The vault applies the line-removal rule from `merge.go:457`: it trashes the task if it's unchanged in the app, and otherwise writes the note again at its last path.
- **A task is trashed or purged in the app.** If the note's hash still matches the last write, the vault deletes the note: all of its content is in the app's trash. Otherwise it keeps the note, drops it from `Notes`, and records a conflict.
- **A note carries the archive tag.** The vault records it in `Archived` and skips it in both directions until the tag is gone. When the tag is removed, the note's edits made while archived are not pushed: the app's values are written to it, because the base kept moving while the note did not. An archived note that leaves the folder (TaskNotes can move archived notes to another folder) stops syncing; its task is not trashed.
- **A note stops being a task note** (the task tag or property removed). The vault stops syncing it and leaves its task alone.

A renamed or moved note within the folder is found again by `opentodo-id`, and the vault updates the stored path.

### D8. Encrypted accounts

Nothing new. Titles, bodies, label names and time-entry notes are content: they're decrypted with the stored key and encrypted before they're pushed, as for lines. A value that doesn't decrypt is written as the encrypted placeholder, made read-only, and never pushed. `init`'s plaintext notice also covers notes.

### Offline and convergence

The vault stays a device. Note edits made while offline are found by hash on the next sync and pushed as ordinary ops, stamped with the vault's clock. They converge with every device under field-level last-writer-wins, in any order of delivery. `ot vault status` lists changed notes without the server.

### Data model impact

None on the server or the op schema. The state file gains the `TaskNotes` section, with a version bump (D1).

## Risks / Trade-offs

- **[TaskNotes renames or changes its settings format]** → Settings are read leniently. An unknown structure falls back to the defaults with a warning, never to a crash. The fixtures pin one real `data.json` shape.
- **[A user's note uses YAML the subset reader doesn't support]** → Only that field becomes read-only, with a warning. The fuzz test feeds random frontmatter and checks that unchanged keys round-trip byte for byte.
- **[Two-list labels surprise people]** → The rule is documented, and a label never moves between `tags` and `contexts` once it's there.
- **[Time entries in shared projects]** → Only the vault user's own entries are writable, which matches the server's authorship rule.
- **[An `ot` older than this change syncs a linked vault]** It ignores the `TaskNotes` section, and if the folder is inside the vault folder, it reads the notes as project files (the bug from the proposal). → `ot vault tasknotes` refuses a folder inside the vault folder unless `--inside` is given, and prints that every machine syncing this vault needs this version. docs/vault.md recommends a folder next to the vault, which old binaries never read.
- **[The vault deletes a note the user cared about]** → It deletes only when the note is byte-identical to what the vault last wrote, and the task, with its body, is still in the app's trash.

## Decisions taken when implementing

The plan's defaults were kept for the five questions raised with the proposal: linking is opt-in (`ot vault tasknotes <folder>`); an archived note pauses syncing; a task trashed in the app deletes its note only when the note is byte-identical to the last write; moving a task to another project rewrites only the link that named the old project; time entries sync both ways (only the vault user's own entries are writable).
