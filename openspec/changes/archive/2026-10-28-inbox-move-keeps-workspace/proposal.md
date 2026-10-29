## Why

Moving a task out of a project into the Inbox put it in the Inbox of the default workspace instead of the one it was in (issue #508). A task with a project belongs to its project's workspace and usually carries no `workspace_id` of its own, so once its project was cleared nothing kept it in that workspace and it fell back to the default.

## What Changes

- A task that leaves its project for no project (dragged on the Inbox, Move to Inbox, bulk move, `PATCH /api/v1/tasks/{id}` with `project_id: null` as `ot` uses it, the agent tool `move_tasks` with `project_id: null`) gets the `workspace_id` of the workspace it was in, in the same batch as the move. Its subtasks follow it as before.
- Nothing changes for accounts with one workspace, for moves between projects, or for tasks that already carry the right value.

Not **BREAKING**: no new field, no new environment variable; the existing `task.workspace_id` is written where it was missing.

## Out of scope

- Moving a task to another workspace's Inbox (not offered by the app today).
- Repairing tasks already moved to the wrong Inbox: the person moves them back with the workspace switcher's Move action or by moving them into a project of the right workspace.

## Roadmap

Fixes #508 for `workspaces` (ROADMAP section 3, workspaces row).

## Capabilities

### New Capabilities

### Modified Capabilities
- `workspaces`: moving a task out of its project keeps it in its workspace.

## Impact

- `web/src/lib/workspaces.ts` (a resolver of the workspace a task is in), `web/src/lib/ops.ts` `planProjectChange` and its callers (`updateTask`, `lib/bulk.ts` moves, `lib/undoActions.ts`).
- `internal/agenttools/write_tasks.go` `move_tasks`; `internal/httpapi/task_workspace.go` for the task PATCH.
- No dependency, no bundle change worth noting.
