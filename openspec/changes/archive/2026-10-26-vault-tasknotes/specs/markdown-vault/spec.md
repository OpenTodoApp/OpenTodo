## ADDED Requirements

### Requirement: Linking a TaskNotes folder
`ot vault tasknotes <folder>` SHALL link one TaskNotes folder to a vault, outside the vault folder (inside only with `--inside`), and record it in the state file; `--off` SHALL unlink it and keep the notes as they are. Nothing SHALL be linked without the command. `ot vault init` SHALL print a hint naming the command when its folder lies inside an Obsidian vault with TaskNotes installed. The command SHALL appear in `ot schema` and `ot help --json` and need a `full` token.

#### Scenario: Link a folder next to the vault
- **WHEN** the user runs `ot vault tasknotes ../TaskNotes/Tasks` in a vault folder and then `ot vault sync`
- **THEN** every task note in that folder is matched or created as a task and the output counts them

#### Scenario: Not a folder
- **WHEN** `ot vault tasknotes` names a path that does not exist or is a file
- **THEN** the command exits with code 2 naming the path and the state file is unchanged

#### Scenario: Unlink
- **WHEN** the user runs `ot vault tasknotes --off` and then `ot vault sync`
- **THEN** no note is read or written, the notes keep their `opentodo-id`, and their tasks stay in the account

### Requirement: One note is one task
Every note in the linked folder that TaskNotes counts as a task, by the task tag or task property its settings name, SHALL be one task, matched by the frontmatter key `opentodo-id`. A task note without it SHALL create a task and gain the key on the next write; an id the account does not know SHALL be reported and the note left as it is. Notes SHALL never be read as project files, and a task SHALL live in a note or a line, never both. Tasks created elsewhere SHALL go to project files.

#### Scenario: New note becomes a task
- **WHEN** the user creates `Fix ebook cover.md` in the linked folder with the task tag and syncs
- **THEN** a task "Fix ebook cover" exists in the account and the note's frontmatter holds `opentodo-id` with its id, every other line unchanged

#### Scenario: Notes are not projects
- **WHEN** the linked folder lies inside the vault folder and holds 40 task notes
- **THEN** the sync creates 40 tasks and no project, and writes no project file for them

#### Scenario: Plain note in the folder
- **WHEN** the linked folder holds a note without the task tag or property
- **THEN** the vault does not read, change or report it

### Requirement: The user's TaskNotes settings
The vault SHALL read TaskNotes' settings from `.obsidian/plugins/tasknotes/data.json`, found by walking up from the linked folder, on every sync: field names, statuses and which count as completed, priorities and their weights, the default status and priority, and how task notes are identified. Without the file it SHALL use TaskNotes' documented defaults and print a warning once per sync. A settings file that does not parse SHALL stop the sync before any write or push, naming the file.

#### Scenario: Renamed field
- **WHEN** the TaskNotes settings name the due field `deadline` and a note holds `deadline: 2026-12-01`
- **THEN** the task's deadline is 1 December 2026, and a deadline set in the app is written to the `deadline` key

#### Scenario: Custom status counts as completed
- **WHEN** the settings define a status `shipped` marked completed and the user sets a note's status to `shipped`
- **THEN** the task is completed on the next sync

#### Scenario: Broken settings
- **WHEN** `data.json` is not valid JSON
- **THEN** the sync exits with code 2 naming the file, writes nothing and pushes nothing

### Requirement: Note fields
A note SHALL map title, status (completed or not), priority (by weight, the default priority as 4), scheduled as the do-on date and time, due as the deadline, tags and contexts other than the task tag as labels, the first project link naming a project file as the project, time estimate, recurrence with completed instances, completed date, time entries and the body as the description. Every other key, value and line SHALL be preserved byte for byte; only changed keys SHALL be rewritten.

#### Scenario: Sample note
- **WHEN** a note holds `status: open`, `priority: normal`, `due: 2026-12-01`, `recurrence: DTSTART:20260802;FREQ=YEARLY`, `tags: [financial/maintenance, task]` and `contexts: [home]` with default settings
- **THEN** the task is open, priority 4, deadline 1 December 2026, repeats every year, and has the labels "financial/maintenance" and "home"

#### Scenario: Completion from the app
- **WHEN** the task of a note is completed on the phone and the vault syncs
- **THEN** the note's status is the first completed status, its completed date is that day, `dateModified` is updated, and no other line changes

#### Scenario: Recurring occurrence completed in the note
- **WHEN** a note of a recurring task gains the current occurrence's date in its completed instances and the vault syncs
- **THEN** the occurrence is completed the way the app completes it and the note's scheduled date moves to the next occurrence

#### Scenario: Unsupported value
- **WHEN** a mapped key holds a value the vault cannot read, such as a multi-line block for the title or an RRULE the rule grammar cannot express
- **THEN** that field is reported for the note, the task's field is unchanged, and the note keeps its text

### Requirement: Merging note fields
Note fields SHALL merge like line fields: changed only in the note it is pushed, only in the app it is written, on both sides the app wins and the note's value goes to `tasknotes.conflict.md` in the vault folder. A field the note expresses approximately SHALL count as changed in the note only when its value differs from what the vault writes for the last-synced value. Edits made offline wait for the next sync and converge with every device under the field-level last-writer-wins rule.

#### Scenario: Approximate priority does not bounce
- **WHEN** the user's settings have only `high` above the default and the task is set to priority 2 in the app
- **THEN** the note is written with `high`, and the next sync pushes nothing for the priority

#### Scenario: Both sides changed
- **WHEN** the note's title and the app's title both changed since the last sync
- **THEN** the note gets the app's title, `tasknotes.conflict.md` records the note's title with the note's path, and the output lists the conflict

#### Scenario: Offline edit
- **WHEN** the user edits a note's scheduled date with the server unreachable and syncs later while a phone changed the title meanwhile
- **THEN** the task has the new date and the phone's title on every device, and the note shows both

### Requirement: Deleted, trashed and archived notes
Deleting a note SHALL trash its task when no field of it changed in the app since the last sync, and otherwise write the note again and report it. Trashing or purging the task in the app SHALL delete the note when it is unchanged since the last write, and otherwise keep it, stop syncing it and report a conflict. A note carrying TaskNotes' archive tag SHALL stop syncing and leave its task unchanged; removing the tag SHALL resume it.

#### Scenario: Note deleted in Obsidian
- **WHEN** the user deletes a synced note whose task did not change in the app and syncs
- **THEN** the task is in the account's trash and the output names it

#### Scenario: Trashed in the app while edited
- **WHEN** the task is trashed on the phone while its note's body was edited, and the vault syncs
- **THEN** the note stays on disk, is no longer synced, and the output and `ot vault status` report the conflict

#### Scenario: Archived note
- **WHEN** the user archives a note in TaskNotes and the task's title changes in the app afterwards
- **THEN** the note is not written and the task is not changed by the vault until the archive tag is removed
