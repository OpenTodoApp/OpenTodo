## Purpose

Keeps one folder of Markdown files in two-way sync with an account, so that people who live in Obsidian or in plain text can read and edit their projects and tasks as files, with every change converging through the operation log like a change from any other device.

## ADDED Requirements

### Requirement: A vault folder is a sync device
`ot vault init <dir>` SHALL make an empty or new folder a vault of the profile's account: it SHALL create `<dir>/.opentodo/` with a state file holding a new device id of the form `vault:<random id>`, the profile name and server, an empty cursor and no last-synced values, and SHALL then run a first sync that writes every project file. The vault SHALL exchange operations with the server as an ordinary device, pulling with its cursor and pushing operations stamped with its device id through the operation log, so a change made in a file converges with the app, the REST API and every other device under the field-level last-writer-wins rule, in any order of delivery, and a change made anywhere else reaches the file on the next sync. A folder that already holds `.opentodo/` SHALL be refused by `init`; a folder that already holds `.md` files SHALL be refused unless `--adopt` is given, in which case those files become projects on the first sync as "Project files and folders" says. The vault's clock SHALL follow the server's clock as devices do, so a wrong local clock cannot make a field unchangeable.

#### Scenario: Initialise and first write
- **WHEN** the user runs `ot vault init ~/Notes/Tasks` with an account holding the projects Home and Work (Work with the sub-project Launch) and three Inbox tasks
- **THEN** the folder holds `.opentodo/state.json`, `Inbox.md`, `Home.md`, `Work/Work.md` and `Work/Launch.md`, the state file holds the cursor the sync ended on, and the command prints the number of projects and tasks written

#### Scenario: Already a vault
- **WHEN** `ot vault init` names a folder that already holds `.opentodo/`
- **THEN** the command exits with code 2, names the folder, and changes nothing

#### Scenario: Folder with notes
- **WHEN** `ot vault init` names a folder holding `Reading.md` without `--adopt`
- **THEN** the command exits with code 2 saying the folder holds Markdown files and naming `--adopt`, and creates nothing; with `--adopt` the first sync creates a project Reading from the file's task lines

#### Scenario: Edit in a file reaches every device
- **WHEN** the user ticks a task's line (`- [x]`) in `Home.md`, runs `ot vault sync`, and a phone syncs afterwards
- **THEN** the phone shows the task completed, the task's history names the vault device, and the completion is one ordinary operation in the account's log

#### Scenario: Concurrent edits converge
- **WHEN** the user changes a task's priority in the file while a phone changes its title offline, both sync in either order, and the vault syncs again
- **THEN** the file line carries the new title and the new priority, and every device shows both

#### Scenario: Vault clock ahead
- **WHEN** the vault's machine clock is one hour fast and the user edits a title in a file and syncs
- **THEN** the edit is stored with a corrected timestamp and a title edit made a minute later on a correctly set phone wins on every device, as for any device

### Requirement: Vault commands, output and scope
`ot vault sync` SHALL read the vault, exchange with the server and write the files, printing one line per project file written, task created, changed, completed or trashed, and conflict, and with `--json` an object `{written, created, updated, trashed, conflicts, warnings, cursor}` following the CLI's output conventions. `ot vault status` SHALL list, without contacting the server, the files changed since the last sync and the pending conflicts. `--dry-run` on `sync` SHALL print the operations it would push and the files it would write and change nothing. The vault commands SHALL require a `full` token: with a `read` or `agent` token they SHALL exit 5 with `insufficient_scope` before any request, and `--read-only` SHALL let `sync` pull and write files but push nothing. `ot vault` SHALL appear in `ot schema` and `ot help --json` with every flag.

#### Scenario: Sync output
- **WHEN** the user runs `ot vault sync` after adding two lines to `Home.md` and completing one task on the phone
- **THEN** the output names the two created tasks, the one file written for the completion, and `--json` reports `created: 2` and `written: 1`

#### Scenario: Dry run
- **WHEN** the user runs `ot vault sync --dry-run --json` after editing a title in a file
- **THEN** stdout lists one planned operation for that task's `title`, no file write happens, no operation is pushed and the exit code is 0

#### Scenario: Agent token
- **WHEN** a profile's token has scope `agent` and the user runs `ot vault sync`
- **THEN** no request is sent, the exit code is 5 and the error code is `insufficient_scope`

#### Scenario: Read-only flag
- **WHEN** the user runs `ot vault sync --read-only` after editing a file and completing a task in the app
- **THEN** the completion is written to the file, the file edit stays pending (shown by `ot vault status`), and nothing was pushed

#### Scenario: Status without a server
- **WHEN** the network is down and the user runs `ot vault status` after editing two files
- **THEN** the two files are listed as changed since the last sync and the command exits 0 without contacting the server

#### Scenario: Unreachable on sync
- **WHEN** the server does not answer within the timeout during `ot vault sync`
- **THEN** no file is changed, the command exits with code 4 and names the server URL

### Requirement: Project files and folders
Each project SHALL be one Markdown file named after the project (`<name>.md`, with `/`, `\` and characters the file system refuses replaced by `-`; a name clash resolved by a numeric suffix), tasks without a project SHALL be in `Inbox.md`, and a project with live sub-projects SHALL be a folder named after it holding its own file `<name>/<name>.md` and one file or folder per child. A project file SHALL start with front matter holding `opentodo-id`, `opentodo-color` and `opentodo-icon` (when set); other front-matter keys SHALL be preserved. The vault SHALL match files to projects by `opentodo-id`: a renamed file renames the project, a file moved into another project's folder re-parents it, and a `.md` file without `opentodo-id` anywhere in the vault SHALL create a project named after the file (nested under the folder's project) and gain the front matter on the next sync. Archived and trashed projects SHALL have no file; archiving or trashing a project in the app SHALL remove its file on the next sync when the file is unchanged since the last sync, and SHALL rename it `<name>.conflict.md` when it is not. Deleting a file SHALL never archive or trash a project: the file is written again from the app on the next sync and the output says so.

#### Scenario: Rename a file
- **WHEN** the user renames `Home.md` to `Household.md` and syncs
- **THEN** the project is named Household on every device, the file keeps its `opentodo-id`, and no task is created or trashed

#### Scenario: New file
- **WHEN** the user creates `Garden.md` with three `- [ ]` lines and syncs
- **THEN** a project Garden exists with three tasks in that order, and the file now starts with front matter carrying the project's id and each line carries `🆔`

#### Scenario: Move a file into a folder
- **WHEN** the user moves `Garden.md` into `Home/` and syncs
- **THEN** Garden is a sub-project of Home on every device

#### Scenario: Deleted file comes back
- **WHEN** the user deletes `Work/Launch.md` and syncs
- **THEN** the file is written again from the app with every task, the project is unchanged, and the output names the file as restored

#### Scenario: Project archived in the app
- **WHEN** a project is archived in the app and its file is unchanged since the last sync
- **THEN** the next sync removes the file; when the file was edited since the last sync, it is renamed `<name>.conflict.md` instead and the sync reports it

#### Scenario: Name that the file system refuses
- **WHEN** a project is named `Q4/Q1: plans?` on Windows
- **THEN** its file is `Q4-Q1- plans-.md` and the project's name on every device is unchanged

### Requirement: Task lines
A task SHALL be one list line `- [ ] <title> <fields>` (or `- [x]` when completed) whose fields, in any order after the title, are: `📅 YYYY-MM-DD` the do-on date (`due.date`), `🛫 YYYY-MM-DD` the start date, `✅ YYYY-MM-DD` the completion date, `➕ YYYY-MM-DD` the creation date, `🔁 <rule>` the recurrence rule, one of `🔺` (priority 1), `⏫` (2), `🔼` (3), nothing (4) with `🔽` and `⏬` read as 4, `🆔 <task id>`, `⛔ <id>[,<id>…]` the blockers, `#<tag>` labels, and the inline fields `[time:: HH:MM]`, `[tz:: Area/City]`, `[deadline:: YYYY-MM-DD]`, `[estimate:: <duration>]` (`45m`, `1h30m`, `2h`), `[someday:: true]` and `[evening:: true]`. The vault SHALL write fields in that order with one space between them and SHALL read them in any order. A line without `🆔` SHALL create a task and receive its id on the next write; a `🆔` the account does not know SHALL be reported and the line left as it is. `⏳ YYYY-MM-DD` and any other text on the line after the title that the vault does not understand SHALL be kept in the title's trailing text and round-trip unchanged. A date that does not exist, a time outside `00:00`–`23:59`, a duration outside 1 minute to 7 days or an `⛔` id outside the task's project sharing SHALL be reported for that line and leave the task's field unchanged.

#### Scenario: Full line written
- **WHEN** a task "Book the plumber" in project Home has do-on 2026-10-25 at 09:00, deadline 2026-10-30, priority 2, estimate 45 minutes, label Errands, and waits for task `8c2a…`
- **THEN** its line is `- [ ] Book the plumber 📅 2026-10-25 [time:: 09:00] [deadline:: 2026-10-30] [estimate:: 45m] ⏫ #errands ⛔ 8c2a… 🆔 <id>`

#### Scenario: Fields in any order
- **WHEN** a file line reads `- [ ] ⏫ Call mum #family 📅 2026-10-26 🆔 <id>` and the user syncs
- **THEN** the task has priority 2, the label Family and do-on 2026-10-26, and the line is rewritten in the vault's order with the title first

#### Scenario: New line without an id
- **WHEN** the user adds `- [ ] Order compost 📅 2026-11-02` to `Garden.md` and syncs
- **THEN** a task Order compost due 2026-11-02 exists in Garden, and the line now ends with `🆔` and the task's id

#### Scenario: Unknown text preserved
- **WHEN** a line reads `- [ ] Water the plants ⏳ 2026-10-24 [[Garden notes]] 🆔 <id>`
- **THEN** the task's title is `Water the plants`, the text `⏳ 2026-10-24 [[Garden notes]]` is kept on the line after every sync, and no do-on date is set from it

#### Scenario: Low priority read as default
- **WHEN** a line carries `🔽`
- **THEN** the task has priority 4 and the marker is dropped on the next write

#### Scenario: Bad date reported
- **WHEN** a line carries `📅 2026-02-30`
- **THEN** the sync reports the file, line and reason, the task's do-on date is unchanged, and the rest of the file is synced

#### Scenario: Blocker in another sharing
- **WHEN** a line's `⛔` names a task of a shared project the task's own project is not shared with
- **THEN** the sync reports it and the task's blockers are unchanged

### Requirement: Completion and recurrence in files
Ticking a line (`- [x]`) SHALL complete the task with the `✅` date when present (at 12:00 local on that day) and the sync time otherwise; unticking SHALL reopen it. For a recurring task the vault SHALL write the current occurrence only; completing it in the file SHALL complete the series the way the app does (the next occurrence appears on the line after the sync, and the done occurrence is not written). The rule after `🔁` SHALL be OpenTodo's rule grammar with `after completion` written as the Obsidian Tasks phrase `when done` and read back from either phrase; a rule that does not parse SHALL be reported for that line and leave the task's rule unchanged.

#### Scenario: Tick with a done date
- **WHEN** the user changes a line to `- [x] Pay rent ✅ 2026-10-20 🆔 <id>` and syncs
- **THEN** the task is completed at 12:00 local on 2026-10-20 and every device shows it in Completed on that day

#### Scenario: Complete a recurring task from the file
- **WHEN** a line with `🔁 every week` and `📅 2026-10-26` is ticked and synced
- **THEN** the line reads `- [ ]` with `📅 2026-11-02`, the done occurrence exists in the app's Completed, and the file does not list it

#### Scenario: Rule phrasing
- **WHEN** a task's rule is `every 3 days after completion`
- **THEN** its line carries `🔁 every 3 days when done`, and a line with either phrase reads back as that rule

#### Scenario: Rule that does not parse
- **WHEN** a line carries `🔁 every blursday`
- **THEN** the sync reports the line with the grammar's message, the task's rule is unchanged and the text stays on the line

### Requirement: Labels, sections, subtasks and notes
Labels SHALL be `#tags` whose text is the label name with each space replaced by `-`; a tag matching no label this way SHALL create a label named after the tag. Sections SHALL be `## <section name>` headings: lines under a heading that names a section belong to it, lines before the first section heading belong to no section, a heading naming no section SHALL create one, and a heading with no task lines is kept. Subtasks SHALL be task lines indented under their parent's line (two spaces or one tab per level). A task's note SHALL be the lines indented under the task line that are not task lines, written as Markdown into `description`, so that the app's rich-text note shows it on the next open; the note the app holds SHALL be written back as that block. The order of lines within a section SHALL set the tasks' order; a line moved SHALL get a new position between its new neighbours and no other line's position changes.

#### Scenario: Label from a tag
- **WHEN** a line carries `#deep-work` and the account has a label "Deep work"
- **THEN** the task gets that label and no label is created

#### Scenario: New tag
- **WHEN** a line carries `#errands` and no label matches
- **THEN** a label `errands` is created and set on the task

#### Scenario: Heading creates a section
- **WHEN** the user adds `## Next week` above three lines in `Work/Work.md` and syncs
- **THEN** a section Next week exists in Work with those three tasks in that order

#### Scenario: Nested line is a subtask
- **WHEN** `- [ ] Pack` has `  - [ ] Passport` indented under it
- **THEN** Passport is a subtask of Pack on every device, and the panel shows one of one subtasks open

#### Scenario: Note round trip
- **WHEN** a task's note in the app is a heading and a check list, and the file is written
- **THEN** the lines under the task line hold the equivalent Markdown, and editing them in the file updates the note that the app shows on its next open

#### Scenario: Reorder
- **WHEN** the user moves one line from the bottom of a section to its top and syncs
- **THEN** only that task's position changes, and every device lists it first in that section

### Requirement: What the file does not round-trip
Comments, attachments and time entries SHALL NOT be written to the file. A task's origin, location, tracked minutes and custom field values SHALL be written as read-only inline fields (`[origin:: <url or id>]`, `[location:: <name>]`, `[tracked:: <duration>]`, `[field:<name>:: <value>]`) after the fields of "Task lines"; an edit to one of them in the file SHALL be reported and the field written back from the app, never pushed. Prose, headings that name no section, non-task list items and front-matter keys the vault does not own SHALL be preserved on every write and never synced.

#### Scenario: Read-only field edited
- **WHEN** the user changes `[tracked:: 1h20m]` to `[tracked:: 3h]` and syncs
- **THEN** the sync reports the line as read-only, the file reads `[tracked:: 1h20m]` again, and no time entry changes

#### Scenario: Prose kept
- **WHEN** `Home.md` holds a paragraph and a `## Ideas` heading with plain bullet points above the task lines, and tasks change in the app
- **THEN** the next write keeps the paragraph, the heading and the bullets exactly, and no section Ideas is created when the heading has no task lines

### Requirement: Merge and conflict rules
The vault SHALL keep, per task and project it has written, the last-synced value of every field it maps, and SHALL merge on each sync field by field: a field changed only in the file since the last sync is pushed; a field changed only in the app is written to the file; a field changed on both sides keeps the app's value, and the file's version of that whole line is appended to `<file>.conflict.md` with the field named, listed in the output and by `ot vault status`. A task line removed from a file SHALL trash the task when no field of that task changed in the app since the last sync, and SHALL otherwise keep the task, write its line again and report it. A task trashed or purged in the app SHALL lose its line; a line edited in the file at the same time SHALL go to the conflict file. Files whose content hash matches the last write SHALL be skipped without parsing. The conflict file is never read by the vault.

#### Scenario: Different fields on both sides
- **WHEN** the file changes a task's priority and the app changes its do-on date since the last sync
- **THEN** after the sync the task has both, the file line shows both and no conflict is reported

#### Scenario: Same field on both sides
- **WHEN** the file changes a task's title to "Call the plumber" and the app changed it to "Call the electrician" since the last sync
- **THEN** the task keeps "Call the electrician", the file line reads that, `Home.conflict.md` gains the file's line with the note `title`, and the sync reports one conflict

#### Scenario: Line removed
- **WHEN** the user deletes a task's line and nothing changed on that task in the app since the last sync
- **THEN** the task is trashed (restorable from the app's Trash) and reported as trashed

#### Scenario: Line removed while the app changed it
- **WHEN** the user deletes a task's line while a phone completed the task since the last sync
- **THEN** the task stays, its line is written again as completed, and the output says the line was restored

#### Scenario: Trashed in the app and edited in the file
- **WHEN** a task is trashed in the app and its line was edited in the file since the last sync
- **THEN** the line is removed from the file, the edited line goes to the conflict file, and the task stays in the Trash

#### Scenario: Unchanged file skipped
- **WHEN** ten project files are unchanged since the last write and one app change touches one project
- **THEN** only that project's file is parsed and written

### Requirement: Watch mode
`ot vault watch` SHALL run `sync` once, then keep the folder in sync until stopped: it SHALL open the server's live update stream for its device and sync within two seconds of a wake-up, and SHALL check the files' modification times every two seconds and sync when one changed, waiting until a changed file has been stable for one second. It SHALL fall back to a 30-second poll while the stream is down, SHALL not exit on a failed sync but print the error and retry with backoff, and SHALL exit cleanly on an interrupt with the state file consistent.

#### Scenario: App change reaches the file
- **WHEN** `ot vault watch` runs and a phone creates a task in Home
- **THEN** `Home.md` holds the new line within a few seconds

#### Scenario: File save reaches the app
- **WHEN** `ot vault watch` runs and the user saves `Home.md` in Obsidian with a new line
- **THEN** the task exists in the app within a few seconds and the line has its `🆔`

#### Scenario: Server away
- **WHEN** the server becomes unreachable while `watch` runs
- **THEN** the command keeps running, prints one line per failed attempt with growing intervals, and syncs again once the server answers

### Requirement: Encrypted accounts in the vault
For an account with end-to-end encryption the vault SHALL read every content value as ciphertext from the operation log and decrypt it on the user's machine with the key stored by `ot encryption unlock`, SHALL encrypt every content value it pushes so the server receives only ciphertext, and SHALL write plaintext only into the vault folder. Without a stored key, or with a key whose version differs from the account's, `ot vault sync` and `watch` SHALL refuse before any request with error code `encryption_enabled`, exit 5 and name `ot encryption unlock`. A value that does not decrypt for its entity and field SHALL be written as the encrypted placeholder and never pushed back. `ot vault init` SHALL print once that the folder holds the account's content in plaintext.

#### Scenario: Encrypted title round trip
- **WHEN** an unlocked encrypted account's task is titled "Renew passport" and the user edits the line to "Renew passports" and syncs
- **THEN** the server received only a ciphertext envelope for the new title, and every unlocked device shows "Renew passports"

#### Scenario: Locked
- **WHEN** the profile has no stored key and the user runs `ot vault sync` for an encrypted account
- **THEN** no request is sent, the exit code is 5, the error code is `encryption_enabled` and the message names `ot encryption unlock`

#### Scenario: Undecryptable value
- **WHEN** a task's title envelope does not authenticate for that task
- **THEN** the line shows the encrypted placeholder as its title, and editing other fields of the line pushes those fields only

### Requirement: Vault limits
A sync SHALL stop before any write or push, naming the file, when a project file exceeds 1 MB or 5,000 task lines, when the vault would hold more than 20,000 tasks, or when a task's note exceeds 64 KB; the state file SHALL be unchanged. An account that already exceeds a limit SHALL be refused by `init` with the same message.

#### Scenario: File too large
- **WHEN** `Home.md` grows past 1 MB and the user syncs
- **THEN** the command exits with code 2 naming `Home.md` and the limit, nothing is pushed, and no file is written

#### Scenario: Large account refused at init
- **WHEN** an account holds 25,000 open tasks and the user runs `ot vault init`
- **THEN** the command exits with code 2 naming the task limit and creates nothing

### Requirement: Vault guide and shared vectors
The documentation SHALL include a guide that shows the file format with one complete example file, the Obsidian setup (the folder inside an Obsidian vault, the Tasks plugin reading the lines, a Dataview query over `🆔` and the inline fields), the merge and conflict rules, the limits and the encrypted-account notice. A fixture vault SHALL pin the parser and the printer: every file in it SHALL parse to the recorded entities and print back byte for byte, and the example file in the guide SHALL be one of them.

#### Scenario: Fixture round trip
- **WHEN** the vault tests run
- **THEN** every fixture file parses to its recorded tasks and projects and prints back identical bytes, and the guide's example is among the fixtures

#### Scenario: Guide names the commands
- **WHEN** the documentation check runs
- **THEN** every `ot vault` command and flag the guide names exists in `ot schema`
