## Why

Issue 544, two bugs when dragging projects in the sidebar:

1. **Unclear drop position.** While a project is dragged over another project, the row shows both the drop line and a ring: the ring is the drop-target state `lib/dnd` sets on every element that takes dropped *tasks*, so a reorder looked like a nest. The line also spans the whole row whatever level the project lands on.
2. **A project disappears.** A sub-project carries no `workspace_id`: it follows its root ancestor's workspace. Dragged (or moved with Move, the API or an agent) to the top level in any workspace other than the default, it had no value of its own and landed in the default workspace, so it vanished from the sidebar. The same cause as issue 508 for tasks.

## What Changes

- While a project is dragged, the sidebar shows only the project drop indicator: the task list's line with a dot for before/after, starting at the indent of the level the project lands on, and a ring only for a drop inside. The task-drop ring stays for tasks dragged onto a project.
- A project getting a new parent writes, in the same batch, the `workspace_id` of the workspace it is in when its own value differs (null for the default workspace; nothing for an account with one workspace): in the sidebar drag, the project's Move menu, `PATCH /api/v1/projects/{id}` and the agent tool `update_project` (and with it MCP and `ot`).

## Out of scope

- Projects already moved to the wrong workspace stay there; moving them back with **Move to workspace** fixes them.
- Old clients that do not write the value: the next move from an updated device does.

## Capabilities

### Modified Capabilities
- `workspaces`: moving a project to the top level keeps its workspace.
- `task-list-presentation`: drag feedback in the sidebar's project tree.

## Impact

- Web: `web/src/lib/workspaces.ts` (`keepProjectWorkspace`), `lib/move.ts`, `lib/ops.ts` (`moveProject`), `app/Sidebar.tsx`.
- Server: `internal/httpapi/task_workspace.go` (shared `keepWorkspace`), `collections.go`, `internal/agenttools/workspaces.go`, `write_structure.go`.
- No schema change: `workspace_id` already exists on projects.
