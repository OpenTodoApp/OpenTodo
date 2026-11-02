## MODIFIED Requirements

### Requirement: Project fields
A project SHALL have a name, a colour, a sort position, an archived flag, an optional parent project, creation time, optional deletion time, a note held as a Markdown `description` with its mergeable `notes_doc` document (see `project-notes`), an additive `workspace_id` naming the workspace it belongs to (absent or null means the account's default workspace), and the additive booleans `reusable` and `aisles` of the reusable-list mode (OpenSpec `reusable-lists`; absent means `false`, and `aisles` reads as `false` while `reusable` is `false`), written and synced as an ordinary operation that converges by last-writer-wins. A sub-project SHALL belong to the workspace of its parent; a parent in another workspace SHALL be treated as missing (the project shows at the top level of its own workspace).

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

#### Scenario: Project synced before reusable lists existed
- **WHEN** a device holds a project row received before the `reusable` and `aisles` fields existed
- **THEN** the project reads as an ordinary project, and no operation is written
