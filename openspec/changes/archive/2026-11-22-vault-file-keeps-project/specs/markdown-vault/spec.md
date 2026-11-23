## MODIFIED Requirements

### Requirement: Project files and folders
Each project SHALL be one Markdown file named after the project (`<name>.md`, with `/`, `\` and characters the file system refuses replaced by `-`; a name clash resolved by a numeric suffix), tasks without a project SHALL be in `Inbox.md`, and a project with live sub-projects SHALL be a folder named after it holding its own file `<name>/<name>.md` and one file or folder per child. A project file SHALL start with front matter holding `opentodo-id`, `opentodo-color` and `opentodo-icon` (when set); other front-matter keys SHALL be preserved. The vault SHALL match files to projects by `opentodo-id`: a renamed file renames the project, a file moved into another project's folder re-parents it, a `.md` file without `opentodo-id` at a path the last sync wrote for a live project SHALL stay that project's file (its lines merge as the project's lines, missing front matter changes neither colour nor icon, and the front matter is written again on the next sync), and any other `.md` file without `opentodo-id` anywhere in the vault SHALL create a project named after the file (nested under the folder's project) and gain the front matter on the next sync. Archived and trashed projects SHALL have no file; archiving or trashing a project in the app SHALL remove its file on the next sync when the file is unchanged since the last sync, and SHALL rename it `<name>.conflict.md` when it is not. Deleting a file SHALL never archive or trash a project: the file is written again from the app on the next sync and the output says so. The vault syncs from its local files and state, so these rules apply on its next sync wherever it runs, offline devices included, and its ops converge with every device as any other edit does.

#### Scenario: Rename a file
- **WHEN** the user renames `Home.md` to `Household.md` and syncs
- **THEN** the project is named Household on every device, the file keeps its `opentodo-id`, and no task is created or trashed

#### Scenario: New file
- **WHEN** the user creates `Garden.md` with three `- [ ]` lines and syncs
- **THEN** a project Garden exists with three tasks in that order, and the file now starts with front matter carrying the project's id and each line carries `🆔`

#### Scenario: Front matter deleted from a known file
- **WHEN** the user deletes the front matter of `Home.md`, keeps its lines and syncs
- **THEN** no project is created, the lines stay Home's tasks, Home's colour and icon are unchanged, and the file starts with Home's front matter again

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
