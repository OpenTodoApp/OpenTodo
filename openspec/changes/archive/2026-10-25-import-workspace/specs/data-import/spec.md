## ADDED Requirements

### Requirement: Import into a chosen workspace
The import options SHALL accept `workspace`, the id of one of the importing account's workspaces, on the preview and on the job. Every project, label and saved view an import creates, and every task it creates without a project, SHALL carry that workspace as its `workspace_id` (no field for the default workspace); tasks in a project follow their project. Existing projects and labels SHALL be reused by name, and open tasks matched as possible duplicates, only within that workspace. Without the option an import SHALL target the default workspace, except an own export, which keeps the per-workspace mapping of "Own export completeness"; with the option an own export SHALL put every item into the chosen workspace and SHALL create no workspace. An id that is not one of the account's workspaces SHALL be refused with 400 `invalid_input` before anything is read or written, without revealing whether the workspace exists; a target project that is not in the chosen workspace SHALL be refused the same way. The imported items are ordinary operations: they reach other devices on their next sync, converge by last-writer-wins, and undo of the job removes them wherever they are. Import needs a connection; offline, the screen disables the choice with the rest of the form.

#### Scenario: Work tasks into Work
- **WHEN** a user with the workspaces "Personal" (default) and "Work" imports a Todoist backup with 12 projects and 40 Inbox tasks, choosing Work
- **THEN** the 12 projects, their labels and the 40 Inbox tasks are in Work on every device after sync, Personal is unchanged, and the preview said "12 new projects into Work"

#### Scenario: Name matching stays in the workspace
- **WHEN** Personal has a project "Errands" and a file with a project "Errands" is imported into Work
- **THEN** a new "Errands" project is created in Work and Personal's project receives no task

#### Scenario: Own export into one workspace
- **WHEN** an own export with the workspaces "Personal" and "Family" is imported into an account, choosing Work
- **THEN** every imported project, label, view and project-less task is in Work, no "Family" workspace is created, and the preview notes that everything goes into Work

#### Scenario: Own export as in the export
- **WHEN** the same export is imported without the workspace option
- **THEN** its workspaces are mapped and created as "Own export completeness" describes

#### Scenario: Unknown or foreign workspace
- **WHEN** the options name a workspace id that does not exist, or one of another account the user is not a member of
- **THEN** the response is 400 `invalid_input` naming `workspace`, no job is created, and the message is the same in both cases

#### Scenario: Target project in another workspace
- **WHEN** the options choose Work and name a target project that is in Personal
- **THEN** the response is 400 `invalid_input` naming `targetProject` and no job is created

#### Scenario: Undo an import into Work
- **WHEN** the user undoes a finished job that imported 5 projects into Work
- **THEN** the 5 projects and their tasks carry `deleted_at` and disappear from Work on every device after sync

#### Scenario: Unauthenticated preview with a workspace
- **WHEN** a preview naming a workspace is sent without a session or bearer token
- **THEN** the response is 401 `unauthorized` and the file is not read

### Requirement: Workspace choice on the Import screen
When the account has more than one workspace, the Import screen SHALL offer a Workspace choice next to the other options, listing every workspace and defaulting to the workspace currently open on the device; for an own export it SHALL also offer "As in the export", first and as the default. The target-project picker SHALL list the projects of the chosen workspace, and the preview SHALL name the chosen workspace ("3 new projects into Work", or "Everything goes into Work"). With one workspace the choice SHALL be hidden and no option sent. The choice is reachable with the keyboard like the other options and disabled offline.

#### Scenario: Default is the open workspace
- **WHEN** the device is in "Work" and the user opens Import and picks a CSV file
- **THEN** the Workspace choice shows Work and the preview reads "… into Work"

#### Scenario: One workspace
- **WHEN** the account has only its default workspace
- **THEN** the screen shows no Workspace choice and the request carries no workspace option

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** the Workspace choice is disabled with the rest of the form
