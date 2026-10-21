## MODIFIED Requirements

### Requirement: Project fields
A project SHALL have a name, a colour, a sort position, an archived flag, an optional parent project, creation time, optional deletion time, a note held as a Markdown `description` with its mergeable `notes_doc` document (see `project-notes`), and an additive `workspace_id` naming the workspace it belongs to (absent or null means the account's default workspace), written and synced as an ordinary operation that converges by last-writer-wins. A sub-project SHALL belong to the workspace of its parent; a parent in another workspace SHALL be treated as missing (the project shows at the top level of its own workspace).

#### Scenario: Create a project
- **WHEN** the user creates a project with a name
- **THEN** it appears in the sidebar immediately as a top-level project of the current workspace with an assigned colour and an empty note, and opens as the current view

#### Scenario: Project synced before the note existed
- **WHEN** a device holds a project row received before the note fields existed
- **THEN** the project reads as having an empty note, and no operation is written until someone edits it

#### Scenario: Project synced before workspaces existed
- **WHEN** a device holds a project row received before the `workspace_id` field existed
- **THEN** the project reads as belonging to the default workspace, and no operation is written

#### Scenario: Parent in another workspace
- **WHEN** a project's `parent_id` names a project of another workspace
- **THEN** the project is shown at the top level of its own workspace until the parent is in the same workspace, and no data is changed

### Requirement: Inbox is the default container
A task without a project SHALL belong to the Inbox of its workspace: the workspace its `workspace_id` names, or the default workspace when the field is absent. Every workspace SHALL have an Inbox that always exists and SHALL not be deletable or renamable. The Inbox view, its counts and the process flow SHALL show the current workspace's Inbox only.

#### Scenario: Task without project
- **WHEN** a task is created outside any project view or its project is cleared
- **THEN** it is listed in the Inbox of the current workspace, carrying that workspace's id

#### Scenario: Project cleared keeps the workspace
- **WHEN** a task in "Website" of "Work" has its project cleared from a device in Work
- **THEN** it is listed in Work's Inbox, not in the default workspace's

#### Scenario: Two Inboxes stay apart
- **WHEN** "Personal" has 3 Inbox tasks and "Work" has 5
- **THEN** the sidebar in Personal reads "Inbox 3", the switcher lists "Work · Inbox 5", and neither view lists the other's tasks
