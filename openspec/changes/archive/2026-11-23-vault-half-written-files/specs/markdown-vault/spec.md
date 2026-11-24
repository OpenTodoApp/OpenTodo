## MODIFIED Requirements

### Requirement: Project files and folders
Each project SHALL be one Markdown file named after the project (`<name>.md`, with `/`, `\` and characters the file system refuses replaced by `-`; a name clash resolved by a numeric suffix), tasks without a project SHALL be in `Inbox.md`, and a project with live sub-projects SHALL be a folder named after it holding its own file `<name>/<name>.md` and one file or folder per child. A project file SHALL start with front matter holding `opentodo-id`, `opentodo-color` and `opentodo-icon` (when set); other front-matter keys SHALL be preserved. The vault SHALL match files to projects by `opentodo-id`: a renamed file renames the project, a file moved into another project's folder re-parents it, a `.md` file without `opentodo-id`, or whose `opentodo-id` is not an id at all (damaged), at a path the last sync wrote for a live project SHALL stay that project's file (its lines merge as the project's lines, missing front matter changes neither colour nor icon, and the front matter, with the project's own id, is written again on the next sync; a damaged id is reported as a warning; a well-formed id of no project of the account still makes a new project), and any other `.md` file without `opentodo-id` anywhere in the vault SHALL create a project named after the file (nested under the folder's project) and gain the front matter on the next sync. Archived and trashed projects SHALL have no file; archiving or trashing a project in the app SHALL remove its file on the next sync when the file is unchanged since the last sync, and SHALL rename it `<name>.conflict.md` when it is not. Deleting a file SHALL never archive or trash a project: the file is written again from the app on the next sync and the output says so. The vault syncs from its local files and state, so these rules apply on its next sync wherever it runs, offline devices included, and its ops converge with every device as any other edit does.

#### Scenario: Rename a file
- **WHEN** the user renames `Home.md` to `Household.md` and syncs
- **THEN** the project is named Household on every device, the file keeps its `opentodo-id`, and no task is created or trashed

#### Scenario: New file
- **WHEN** the user creates `Garden.md` with three `- [ ]` lines and syncs
- **THEN** a project Garden exists with three tasks in that order, and the file now starts with front matter carrying the project's id and each line carries `🆔`

#### Scenario: Front matter deleted from a known file
- **WHEN** the user deletes the front matter of `Home.md`, keeps its lines and syncs
- **THEN** no project is created, the lines stay Home's tasks, Home's colour and icon are unchanged, and the file starts with Home's front matter again

#### Scenario: Project id damaged in a known file
- **WHEN** the `opentodo-id` of `Home.md` is damaged so that it is no longer an id, its lines kept, and the user syncs
- **THEN** no project is created, the lines stay Home's tasks, the sync warns that the id is not in the account, and the file starts with Home's id again

#### Scenario: File emptied on purpose
- **WHEN** the user empties `Home.md` and leaves it empty past the half-saved hold, syncing each time
- **THEN** Home's tasks are trashed, the project Home is unchanged and no other project is created, no `Home 2.md` appears, and `Home.md` holds Home's front matter

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

### Requirement: Merge and conflict rules
The vault SHALL keep, per task and project it has written, the last-synced value of every field it maps, and SHALL merge on each sync field by field: a field changed only in the file since the last sync is pushed; a field changed only in the app is written to the file; a field changed on both sides keeps the app's value, and the file's version of that whole line is appended to `<file>.conflict.md` with the field named, listed in the output and by `ot vault status`. A task line removed from a file SHALL trash the task when no field of that task changed in the app since the last sync, and SHALL otherwise keep the task, write its line again and report it. A task trashed or purged in the app SHALL lose its line; a line edited in the file at the same time SHALL go to the conflict file. Files whose content hash matches the last write SHALL be skipped without parsing. A file read while it is being saved SHALL NOT trash its tasks: a file that held text when the last sync wrote it and is now empty, or cut short of what that sync wrote (shorter, with everything up to its last line end equal to a part of the written text that ends at a line end; for a file of more than 5000 lines, shorter and without its last line end), SHALL be held for up to five minutes from the first sync that sees it so: an empty file unless every task line it lost is in another file, a file cut short only when it lost a task line that is in no other file. A held file is neither read nor written, and a change made in the app meanwhile to a task in it SHALL count as the app's change once the file is read. A file still empty or cut short past the hold SHALL sync as it is, its removed lines trashing their tasks as above. The hold is the vault's own state; offline it holds the same way, and what it pushes afterwards are ordinary ops that converge as any edit does. The conflict file is never read by the vault.

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

#### Scenario: Save in progress
- **WHEN** a sync reads `Home.md` cut short in the middle of an editor's save, a phone completes one of its tasks, and the save finishes before the next sync
- **THEN** no task is trashed or created by the cut, the task stays completed and its line shows it, and the next sync reads the saved file

#### Scenario: End of a file deleted on purpose
- **WHEN** the user deletes the last task line of `Home.md` and syncs, and syncs again more than five minutes later
- **THEN** the first sync holds the file and trashes nothing, and the later sync trashes the task
