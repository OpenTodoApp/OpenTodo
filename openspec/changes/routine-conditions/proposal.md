# Proposal

## Why

Two reports from people who use routines every day:

- [#1132](https://github.com/OpenTodoApp/OpenTodo/issues/1132): a "default project" routine moved every new task, from every workspace, into a project of one workspace. Routines have no idea of workspaces. On top of that, the editor named that project "a removed project" ("ein gelöschtes Projekt"), because it only knew the current workspace's projects.
- [#1134](https://github.com/OpenTodoApp/OpenTodo/issues/1134): conditions cannot say "not". "When a task is added and it has no project, move it to X" needs "project is none", and other routines need "project, section or priority is not …".

The maintainer promised both, in one change.

## What Changes

- **A routine's workspace.** A personal routine gets an additive `rule.workspace_id`: the one workspace it works in, or null for every workspace. A routine of a workspace sees only that workspace's tasks, projects and sections. Its trigger fires only for them, Find tasks and a schedule's matching tasks find only them, and what it creates without a project lands in that workspace. A change that would reach another workspace is refused: a Change tasks step moving a task into another workspace's project fails with `other_workspace`, the rule form's move is skipped with "other workspace", and a device commit or encrypted proposal that touches a task outside the workspace fails the run with a reason. Existing routines read as every workspace, so nothing about them changes.
- **The editor.** A new routine starts in the workspace it is created in. The When card reads "When a task is created **in Work** if …", and the workspace word chooses one workspace or Every workspace. The word is shown only to accounts with more than one workspace. The Routines list names a routine's workspace when it is not the current one.
- **Names across workspaces.** The editor names a project or label of another workspace with its workspace ("Website (Work)"). "A removed project" is shown only for a project that really is gone. The pickers offer the routine's workspace's projects and labels, or every workspace's for a routine of every workspace.
- **"Is not" and "no project".** The project, section and priority tests get **Any | Is | Is not** (and **No project**, **No section**), stored as `{not_in: [...]}` beside the existing `{in: [...]}` and `"none"`. Labels already have "none of the labels". A task without a project or section is in none of the listed ones, so it matches "is not".
- **Agents and REST.** `workspace_id` on `POST`/`PATCH /api/v1/rules` and `POST /api/v1/rules/test`, checked against the user's workspaces. `create_routine` and `update_routine` take `workspace` (an id or exact name, or null for every workspace), and `list_routines`/`get_routine` return `workspace_id`. The condition check accepts `not_in` and refuses `in` and `not_in` together.
- Not **BREAKING**. One additive op field, no new mandatory environment variable, route or dependency. 1.0 clients either evaluate the new values the same or refuse them safely; none of them silently matches more tasks (design D4).

Out of scope:
- Moving a routine between workspaces in bulk, or a workspace filter on the Routines list.
- "Is not" for the date, assignee and origin tests (each already has its "none" word).
- OR between tests, and nested conditions.
- Shared project routines: their project already bounds them (`routines-shared`).

Roadmap: the 1.1 "Routines" table of ROADMAP.md, a follow-up row for #1132 and #1134.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `automation-rules`: the condition's `not_in` forms ("Conditions").
- `routines`: a routine's workspace, its editor word, names across workspaces and the agent tools' `workspace`.

## Impact

- Data: `rule.workspace_id` (nullable string, default null), declared in `internal/sync/ops.go` `Schema`; the generated `opSchema.ts` and schema fixture follow.
- Server: `internal/ruleval` (the `not_in` forms and the matcher), `internal/rules` (the world of one workspace, the guards, the planner's skip), `internal/httpapi/rules.go` and `routines.go` (the `workspace_id` check, the draft test, the `workspace_gone` error), `internal/agenttools/routines.go` (the `workspace` argument).
- Web: `web/src/lib/rules/match.ts`, `summary.ts`, `draft.ts`, `store.ts`, `run/` (the device world of one workspace), `web/src/app/rules/RuleFields.tsx`, `web/src/app/routines/` (the When card's word, names, pickers, the list's meta line).
- Shared contracts: new vectors in `web/src/lib/rules/match.vectors.json`, two cases in `web/src/lib/rules/plan.fixture.json`.
- Bundle: the routines screens are loaded lazily; the first load does not change.
