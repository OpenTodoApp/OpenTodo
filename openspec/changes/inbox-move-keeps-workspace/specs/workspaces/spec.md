## ADDED Requirements

### Requirement: Moving a task out of its project keeps its workspace
When a task leaves its project for no project (moved to the Inbox by drag, by Move, through the API or by an agent tool), the move SHALL write, in the same batch, the `workspace_id` of the workspace the task was in (null for the default workspace) when its own value differs, so the task stays in that workspace's Inbox. It works offline and converges like the move itself; subtasks follow the task.

#### Scenario: Drag from a project to the Inbox
- **WHEN** the user is in "Work" and drags a task from the Work project "Unsorted" onto the Inbox
- **THEN** the task appears in Work's Inbox and in no view of the default workspace, on this device at once and on others after sync

#### Scenario: Default workspace
- **WHEN** a task of a project in the default workspace is moved to the Inbox
- **THEN** it appears in the default workspace's Inbox and no `workspace_id` operation is written

#### Scenario: Agent moves a task to the Inbox
- **WHEN** an agent calls `move_tasks` with `project_id: null` for a task of a Work project
- **THEN** the task's `workspace_id` becomes Work's id in the same change and it is listed in Work's Inbox

#### Scenario: API move to no project
- **WHEN** a script PATCHes `/api/v1/tasks/{id}` with `{"project_id": null}` for a task of a Work project
- **THEN** the task's `workspace_id` becomes Work's id in the same write
