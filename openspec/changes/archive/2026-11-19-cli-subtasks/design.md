# Design

## Context

The server already enforces the subtask tree on REST writes (`subtasks` "Cycle prevention for subtasks"): a parent must exist, must not be deleted, must share the task's project after the write, and must not be the task or one of its descendants. REST writes exactly the fields sent, and the cascades are left to clients (`docs/api.md` "Subtasks"). `ot` already reads `parent_id` on every task (it decides Inbox membership) but never writes it.

## Decisions

**D1. Flags on the existing commands, no new command group.**
`--parent` on `add`, `edit` and `list`, and `--subtasks` on `done`, `rm` and `edit`. This follows `--project` and `--blocked-by`, keeps the v1 surface small, and lets agents find subtasks in `ot schema` next to the other task fields.

Alternative considered: `ot subtask add|move|list`. Rejected because it duplicates every flag of `add` and `edit`.

**D2. The parent is a task ref, checked locally.**
`--parent` takes what every other task ref takes: a full id or a unique id prefix among live tasks. Locally, the client refuses:
- a parent that is completed (the app's picker doesn't offer one);
- for `add`, a `--project` that differs from the parent's.

Everything else (deleted parent, cycle, another project on `edit`) goes to the server, whose `400 invalid_input` message is printed as is. Without `--project`, `add` sends the parent's `project_id`, or for an Inbox parent its `workspace_id`, so the default never fails on the server's same-project rule. On `edit`, a parent in another project adds that `project_id` to the same patch, which is what the app's "Parent task" picker does.

**D3. Cascades are opt-in with `--subtasks`.**
The app cascades by default, but `ot done <parent>` completing only the parent is the documented behaviour of a 1.x command, and scripts may rely on it. `--subtasks` gives the app's result without changing what an existing script does:
- `done --subtasks` completes the open descendants and then the task, so a failure part-way never leaves a completed parent above open subtasks;
- `rm --subtasks` deletes the descendants and then the task, and the confirmation lists every task it will delete;
- `edit --subtasks`, when the patch changes the project, sends the task's patch first and then one `project_id` patch per live descendant.

Descendants are found from one `GET /tasks`, at every depth, skipping deleted tasks and guarding against a cycle that concurrent edits left behind (`subtasks` "Cycle prevention"). Each request is an ordinary per-task write, so `--dry-run` lists them all and an `agent` token is limited by the same gate as today. `reopen` has no `--subtasks`, because the app reopens only the parent.

**D4. Nesting in the table only, in the views the app nests.**
`ot list --project` and `ot list --inbox` (lists ordered by position) print each subtask right after its parent, its title indented by two spaces per level. A parent's title is followed by `done/total` over its live direct subtasks, the count the app shows. A subtask whose parent isn't in the listed set (completed, deleted, filtered out or missing) is printed at the top level, so nothing disappears. Today, Upcoming, Completed and the default list stay flat, as in the app (`subtasks` "Flat display in cross-project and date views").

`--json` keeps its current order and shape: consumers already have `parent_id`, and reordering a stable output would be a change for them.

**D5. `ot list --parent <ref>` is a filter.**
It keeps the tasks whose `parent_id` is the resolved task, after every other list filter, and orders them by position. It lists direct subtasks only. Open is still the default, and `--all` or `--completed` widen it as they do for every list.

**D6. `ot task show` gains the tree.**
The human output adds:
- a `Parent:` line with the path from the top (titles joined with ` › `);
- a `Subtasks: done/total` line followed by one line per live direct subtask (`[x]` when completed), in position order.

`--json` adds `subtasks`, the direct live subtasks as the API returns them, always present (empty when there are none). The `task` object is unchanged.

## Data model

No change: `parent_id` already exists on tasks and in the REST API. No op schema change, no migration.

## Size

A few hundred lines in `internal/cli`, no new dependency. Binary size changes by a few kilobytes and runtime memory doesn't change.

## Risks

- **A cascade interrupted part-way.** Each request is independent, so a network error after some of them leaves some tasks changed. The command stops at the first error and exits with its code. Running it again only sends what is still to do: unchanged tasks are reported as `unchanged`.
