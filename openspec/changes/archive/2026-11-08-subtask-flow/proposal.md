# Subtasks one at a time

## Why

Projects and sections can already be sequential, but a task's subtasks could not (#1046). A plan like "Paint the doghouse: prepare, then buy supplies, then paint", where preparing is itself a few things done in any order, needed blockers set by hand, which go stale as the plan changes.

## What Changes

- A task gets a synced `flow_mode`: `sequential` offers its open subtasks one at a time in list order; empty (the default), `parallel` and anything unknown read as all together, as on a project.
- The available-task rule walks up from a task: the nearest parent whose subtasks go one at a time and that offers another subtask first holds the task and everything under it. Otherwise the existing project and section rules apply. Skipped tasks (recurring, habits, Someday) neither hold nor wait, as in projects. The rule works in any project and in the Inbox.
- The task page and the docked panel show **One at a time** above the subtasks when there are two or more: one switch, with Undo. A viewer sees it only while it is on, disabled.
- Waiting subtasks show the existing "After …" marker, fold into Today's Blocked group, and drop out of Next, `available` filters and `list_tasks available`, with no new UI.
- REST accepts `flow_mode` on task create and patch (`""`, `parallel`, `sequential`, null clears); the agent tools `create_tasks` and `update_tasks` accept it.

## Capabilities

### Modified Capabilities

- `project-flow`: "Available tasks" lets a parent's subtasks form a sequence; a new requirement, "Subtasks one at a time".

## Impact

- Op schema: one additive task field `flow_mode` (`internal/sync/ops.go`, generated `opSchema.ts`, the schema fixture). Not **BREAKING**: no op format change, no new environment variable.
- Shared rule: `internal/flow` and `web/src/lib/flow.ts`, four new cases in `internal/flow/testdata/flow_fixture.json`.
- Server: REST check in `internal/httpapi/sector.go` (`taskBodyOK`), agent-token field lists in `agent_rest.go`, the agent tools' planning fields.
- Web: `task-detail/Subtasks.tsx` (the switch), `lib/undoActions.ts` (`flowUndoable` for a task).
- Docs: `docs/project-flows.md`, `docs/api.md`, `docs/mcp.md`, a changelog fragment.
- Out of scope: a Flow item in the row menu (the switch sits where the subtasks are), the CLI and the vault (they read availability through the shared rule already), CalDAV.
- Roadmap: 1.x extension of project flows; no milestone item.
