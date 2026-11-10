## ADDED Requirements

### Requirement: A routine works in one workspace or every workspace
A personal routine SHALL carry an additive `workspace_id`: the one workspace it works in, or null for every workspace. Every routine made before this field SHALL read as every workspace and keep doing exactly what it did. The default workspace SHALL be written as its id, never as null. A routine of a workspace SHALL see only that workspace's tasks, projects and sections, placed as the devices place them (`workspaces` "What belongs to a workspace"):
- its event and time triggers SHALL fire only for that workspace's tasks;
- Run now and Test SHALL refuse a task of another workspace as not found;
- a schedule's matching tasks and Find tasks SHALL find only that workspace's tasks;
- Create tasks without a project or parent, Create a project without a parent and Create a project from a template SHALL create in that workspace.

A run whose planned changes reach another workspace SHALL fail with a reason naming the routine's workspace, and SHALL write nothing. That covers a task outside the workspace that the run did not create, a move into another workspace's project, a parent task outside it, or another workspace's `workspace_id`. The server SHALL make the same check on a device run's commit and on an encrypted proposal's apply. A routine whose workspace the user no longer belongs to SHALL not run: its triggers do not fire, and Run now and Test answer 409 `workspace_gone`. A shared project's routine SHALL ignore the field. `workspace_id` SHALL be written as a field-level operation, applied on the device at once (offline included), and SHALL converge by per-field last-writer-wins.

#### Scenario: A default project for one workspace
- **WHEN** the routine "When a task is created, if it has no project, move it to Triage" works in Work, Triage is in Work, and the user adds one task to Work's Inbox and one to Personal's
- **THEN** the Work task moves to Triage, the Personal task stays in Personal's Inbox, and the run log has one run

#### Scenario: Every workspace stays as it was
- **WHEN** a routine made before this change, with no workspace, sets priority 1 on every new task, and tasks are created in Work and Personal
- **THEN** both get priority 1

#### Scenario: Offline choice of workspace
- **WHEN** the user, offline, changes a routine from Work to Every workspace and saves, and another device renames it at the same time
- **THEN** after sync every device shows the new name and Every workspace, and the server runs it in every workspace

### Requirement: A routine of a workspace never moves a task out of it
A Change tasks step of a routine of a workspace that moves a task into a project of another workspace SHALL fail with `other_workspace` ("this routine works only in the workspace Work; that project is in another workspace"), and the run SHALL write nothing. A routine kept in the rule form (one Change tasks card in `actions`) SHALL skip that move with the reason "other workspace" and apply its other actions. A routine of every workspace SHALL keep moving tasks across workspaces as before.

#### Scenario: Move into another workspace
- **WHEN** a routine of Work runs "Change the task: move to Home" and Home is in Personal
- **THEN** the run fails at that step with `other_workspace`, and the task stays where it was

#### Scenario: The rule form skips the move
- **WHEN** a routine of Work in the rule form sets priority 2 and moves to Home, and a Work task is created
- **THEN** the task gets priority 2, stays out of Home, and the run reads "applied" with the reason "other workspace"

#### Scenario: An older device plans beyond the workspace
- **WHEN** a device of an earlier release runs a routine of Work for an encrypted account and commits a change to a Personal task
- **THEN** the server fails the run with "this routine works only in the workspace Work (a task outside it)", and nothing is written

### Requirement: The workspace in the editor
A new routine SHALL start in the workspace it is created in. The When card SHALL read "When **a task is created** in **Work** if **any task**", whose workspace word opens the anchored choice list of the trigger with each workspace and Every workspace. The word SHALL be shown only to an account with more than one workspace, and never on a shared project's routine. The Routines list SHALL name a routine's workspace in the row's meta line when it is not the current workspace. Choosing a workspace SHALL be an edit of the draft, saved with the routine.

#### Scenario: A new routine in Work
- **WHEN** the current workspace is Work and the user creates and saves a routine
- **THEN** the routine works in Work, and its When card reads "in Work"

#### Scenario: Every workspace
- **WHEN** the user opens a routine of Work, chooses Every workspace in the When card and saves
- **THEN** the routine's `workspace_id` is null on every device after sync

#### Scenario: One workspace
- **WHEN** an account with only its default workspace opens a routine
- **THEN** the When card shows no workspace word

### Requirement: Names across workspaces in the editor
The routine editor SHALL name a project or label of another workspace than the current one with its workspace ("Website (Work)"), in the When card, the step cards, the summaries and the run history. It SHALL say "a removed project" only for a project that is deleted or unknown on the device. The pickers SHALL offer the routine's workspace's projects and labels, or every workspace's for a routine of every workspace.

#### Scenario: A project of another workspace
- **WHEN** the current workspace is Personal and the user opens a routine that moves tasks to Website, a project of Work
- **THEN** the card reads "Website (Work)", never "a removed project"

#### Scenario: A project that is gone
- **WHEN** a routine points at a project that was deleted
- **THEN** the card reads "a removed project"

### Requirement: Routine workspace on REST and the agent tools
`POST` and `PATCH /api/v1/rules` SHALL accept `workspace_id` (one of the user's workspaces, or null), and `POST /api/v1/rules/test` SHALL accept `workspace_id` to plan a draft in that workspace. A value that is not one of the user's workspaces SHALL be refused with 400 `invalid_input`, and nothing is written. These routes keep their policy: a signed-in session or token, refused on a demo instance. `create_routine` and `update_routine` SHALL take `workspace`: a workspace's id or exact name, or null for every workspace. An unknown workspace SHALL be an argument error naming the user's workspaces. `list_routines` and `get_routine` SHALL return `workspace_id`.

#### Scenario: Not the user's workspace
- **WHEN** a client PATCHes a routine with `workspace_id` of a workspace it does not belong to
- **THEN** the route answers 400 `invalid_input`, and the routine is unchanged

#### Scenario: Without a session
- **WHEN** a request without a session or token PATCHes `/api/v1/rules/{id}` with a `workspace_id`
- **THEN** the route answers 401, and nothing is written

#### Scenario: An assistant limits a routine to Work
- **WHEN** an agent calls `create_routine` with `workspace: "Work"`
- **THEN** the routine works in Work, and `get_routine` returns Work's id as `workspace_id`

#### Scenario: Unknown workspace
- **WHEN** an agent calls `update_routine` with `workspace: "Acme"` and the user has Personal and Work
- **THEN** the call fails with an argument error naming Personal and Work, and nothing is written

### Requirement: Is not and no project in the editor
The condition panel SHALL give project, section and priority one test each, **Any**, **Is** and **Is not**, plus **No project** for the project and **No section** for the section, beside the chooser of what it names, in the panel's two-column grid. Switching between Is and Is not SHALL keep the chosen value. Until a value is chosen, the test SHALL write nothing. The When card's sentence and the summaries SHALL read the tests as "not in Errands", "not in section Waiting", "not priority 1" and "no project". The labels' "Have none of the labels" SHALL stay as the label test's "is not".

#### Scenario: Default project, built in the editor
- **WHEN** the user sets the trigger "A task is created", sets the project test to No project, and adds Change tasks "move to Triage"
- **THEN** the When card reads "When a task is created in Work if no project", and the saved condition is `project: "none"`

#### Scenario: Is becomes is not
- **WHEN** the condition is "in Errands" and the user switches the project test to Is not
- **THEN** the condition becomes `project: {not_in: ["<Errands>"], descendants: true}`, and the card reads "not in Errands"
