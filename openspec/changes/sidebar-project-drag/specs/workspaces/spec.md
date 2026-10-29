## ADDED Requirements

### Requirement: Moving a project to the top level keeps its workspace
When a project gets a new parent (dragged in the sidebar, moved with Move, through the API or by an agent tool), the move SHALL write, in the same batch, the `workspace_id` of the workspace the project is in (null for the default workspace) when its own value differs, so a sub-project that becomes a top-level project stays in that workspace. An account with one workspace SHALL write nothing extra. It works offline and converges like the move itself.

#### Scenario: Drag a sub-project to the top level
- **WHEN** the user is in "Work" and drags the sub-project "Acme" out of "Clients" to the top level
- **THEN** Acme stays in Work's sidebar as a top-level project, on this device at once and on others after sync

#### Scenario: Default workspace
- **WHEN** a sub-project of the default workspace is moved to the top level
- **THEN** it stays in the default workspace and no `workspace_id` operation is written

#### Scenario: API and agents
- **WHEN** a script PATCHes `/api/v1/projects/{id}` with `{"parent_id": null}`, or an agent calls `update_project` with `parent_id: null`, for a sub-project of a Work project
- **THEN** the project's `workspace_id` becomes Work's id in the same change
