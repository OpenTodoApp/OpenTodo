# Proposal

## Why

Subtasks are part of the data model and of every OpenTodo client except `ot`. The REST API accepts `parent_id` on `POST /tasks` and `PATCH /tasks/{id}`, the MCP `create_tasks` tool takes it, and the web app nests, counts and cascades. From the command line, though, a script or an agent can't put a task under another one, can't see which tasks are subtasks, and gets a different result from `ot done` on a parent than the app gives: the app completes the open subtasks too, `ot done` completes only the parent.

The workaround today is a raw `curl` with a hand-copied project id, which is exactly what `ot` exists to avoid.

## What Changes

- **Create a subtask.** `ot add <title> --parent <ref>` creates the task under an open task, where the ref is an id or a unique id prefix (like every other task ref). Without `--project`, the subtask takes its parent's project, or for a parent in the Inbox, the parent's workspace. A `--project` that differs from the parent's project, or a completed parent, is refused before anything is sent.
- **Move a task between parents.** `ot edit <ref> --parent <ref>` puts an existing task under another one, and `--parent none` brings it back to the top level. A parent in another project moves the task to that project too, as the app's picker does.
- **Opt-in cascades.** `--subtasks` on `ot done`, `ot rm` and `ot edit --project` (or a `--parent` that changes project) applies the same change to the task's subtasks, at every depth, with one request per task:
  - `done` completes the open ones;
  - `rm` deletes them;
  - a move gives them the new project.

  Without the flag, every command does exactly what it does today. `ot reopen` gets no cascade, because reopening a parent in the app reopens only the parent.
- **See the tree.**
  - `ot list --project` and `ot list --inbox` print subtasks under their parent, indented one step per level, with the parent's progress (`2/5`) after its title. Other views stay flat, as they are in the app.
  - `ot list --parent <ref>` lists the direct subtasks of a task and combines with the other list flags.
  - `ot task show` prints the parent path and the subtasks with their progress. `--json` gains a `subtasks` array.
- **Completion.** Tab after `--parent` offers open tasks, like `--blocked-by`.

Out of scope:
- a cascade on `ot reopen`;
- `ot list --parent` over the whole subtree;
- creating several subtasks in one command;
- changes to the REST API or the MCP tools, which already do what this change needs.

This advances the `cli-client` and `subtask-trees` items of `ROADMAP.md`.

Not **BREAKING**: no op schema change, no route change, no new environment variable. Only flags and one `--json` field are added. The table output changes only by its indentation and progress, and `docs/stability.md` doesn't cover it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cli-client`: subtask flags on `add`, `edit`, `done`, `rm` and `list`, the nested table, and the parent and subtasks in `task show`.
