# Design

## Context

Custom fields today (`openspec/specs/custom-fields`):

- A definition is a `field` entity with an immutable `project_id`, written as ops in its project's scope: the owner's personal scope, or `project:<id>` for a shared project.
- Values are `fields.<defId>` op fields on the task.
- The fields that apply to a project are computed by one resolver per side (`applicableFields` in `web/src/lib/fieldTree.ts`, `ApplicableFields` in `internal/sync/fields.go`), pinned by `web/src/lib/fields.vectors.json`: the ancestors' live definitions, farthest first, then the project's own.

Sync scopes are only `user:<id>` and `project:<id>` (`internal/sync/scope.go`). Workspaces are server-side directory data, never ops; labels, views and project-less tasks are personal-scope entities that carry a `workspace_id`, null meaning the default workspace. A project's workspace is its root's (`Partition.Project`, Go and TS), an unknown id reading as the default.

## Goals / Non-Goals

**Goals:**
- Define a field once for every project of a workspace the person owns, with the same offline behaviour, convergence and everywhere-support as a project field.
- Change no existing definition, value or op; add one op field.

**Non-Goals:**
- Workspace fields visible to the other members of a shared workspace (see D6).
- Instance-wide fields, per-project opt-out, merging existing project fields into a workspace field.

## Decisions

### D1. A workspace field is a `field` without a project

- A definition whose `project_id` is empty is a workspace field. Its new `workspace_id` (kind nullable string, default null) names the workspace; null is the default workspace, the label convention, so the default workspace needs no id written.
- `project_id` keeps its kind (a non-empty id when written), so a workspace field never writes a `project_id` op: the row default `""` stands. `workspace_id` and `type` never change after creation; the REST API refuses a change, like `project_id`.
- `workspace_id` is ignored on a field with a project.
- **Scope**: with no `project_id`, `scopeOfProject` resolves the op to the author's personal scope, like a project-less task. No change to `scope.go`. A token limited to workspaces (`reach.go`) places the field by its `workspace_id`.
- **Who**: the REST API and the app offer creation only for a workspace whose role is `owner` (the default workspace always). The sync path checks kinds only, as for every field reference (custom-fields D3).

Rejected: a new `workspace:<id>` sync scope now. It is what shared workspaces need (D6), but it touches access loading, sync delivery, membership changes, trash and export; the owner approved the personal-scope slice first.

### D2. One resolver, with a placement

`applicableFields(projectId, projects, defs, place?)` / `ApplicableFields(projectID, projects, defs, place)`:

1. No project id (Inbox): nothing.
2. With a placement: the live workspace fields whose workspace is `place.project(projectId)`, in position order then id. A definition's workspace is its `workspace_id`, null reading as `place.own('')` (the default). Unlike a label's, an id the account does not know (a deleted workspace) is not read as the default, so such a field applies nowhere instead of appearing in the default workspace.
3. Then the inherited and own definitions, unchanged (inherited-custom-fields D1).

The placement is the existing `Partition` (`web/src/lib/workspaces.ts`, `internal/sync/partition.go`), so a project's workspace is decided by the same rule as the sidebar's. Without a placement (older call sites, tests) workspace fields are not read. Callers that pass one: the shared lookup `useApplicableFields` (panel, columns, badges, the dialog), filter contexts (through `useWorkspaceFilter`), field sorting (`FieldSortContext`, `listGroups`), the definition checks in `lib/fields.ts`, `internal/httpapi/fields.go` (`Service.Partition`) and `internal/agenttools` (`snapshot.partition()`).

The vectors gain eight cases: workspace fields first, a null workspace_id, another workspace's fields, an unknown workspace, a project in an unknown workspace, deleted workspace fields, the Inbox, and no placement.

### D3. Names and limits across a workspace

- Creating or renaming a workspace field: the name must be unique, ignoring case, among the workspace's live fields and the own live fields of every project in the workspace; the message names the project. The 30 limit: the workspace has at most 30 fields, and adding one is refused when any project of the workspace already has 30 applicable fields, naming that project.
- Creating or renaming a project field: the applicable set now includes workspace fields, so a workspace field's name is refused with "from *Workspace*", and the 30 limit counts them.
- Encrypted names are compared on the device only, as today.
- Clashes that arrive through a move or concurrent offline edits are shown, never repaired (inherited-custom-fields D3); the project dialog's clash note names the workspace.

### D4. The interface

- Settings → Workspaces → General: the owner sees one row, **Fields**, with a **Fields…** button that opens the existing dialog in workspace mode (its own fields, add, rename, options, reorder, delete). The dialog works offline: definitions are ops.
- In workspace mode, when the workspace has other members, one line says only the owner sees these fields.
- A project's dialog lists workspace fields first under "From *Workspace*", read-only, with one line saying they are edited in the workspace's settings.
- Interface budget (docs/interface-guide.md): one settings row; the dialog gains a read-only group; no chrome row, sidebar destination, scroll region or shortcut; default task properties are unchanged.

### D5. API, tools, export, import

- `POST /api/v1/fields` takes either `project_id` or `workspace_id` (a workspace the caller owns): both, neither, an unknown workspace or one the caller does not own is `400 invalid_input`. Task values accept workspace fields of the task's project's workspace.
- `list_projects` (agent tools and MCP) lists a project's workspace fields first, each with `workspace_id`; values and patches use the applicable set. No tool defines fields.
- The export carries `workspace_id` on definitions like every op field. The own-export import drops the empty `project_id` so a workspace field is restored, and an import into a chosen workspace stamps it like a label.

### D6. Limitation: the later shared-workspace scope

The definitions live in the owner's personal scope, so other members of a shared workspace or of a shared project in it never receive them; values they hold stay in the task's data, hidden for those members, as for a parent they cannot see (inherited-custom-fields D4).

Shared workspace fields need a `workspace:<id>` scope that members read and owners and admins write. A field written in the personal scope cannot move there later: the server refuses an op that places a stored entity in another scope (`scope_change`, entity-id-ownership). That later change therefore has to create new definitions in the workspace scope and rewrite each task's values to the new ids as ordinary ops, offered as a one-time upgrade in the dialog. This slice keeps that path open: values are keyed by definition id, and nothing here assumes the personal scope beyond where the ops land.

### Data model, size and budget

- **Data model:** one additive op field, `field.workspace_id`. No entity, migration or rename.
- **Size:** a few hundred lines of Go and TS, no dependency. The dialog stays lazily loaded; `make bundle-budget` confirms the first-load budget.

## Risks / Trade-offs

- **[A member expects to see the owner's workspace fields]** → The dialog says so when the workspace has other members; the docs say so; D6 is the follow-up.
- **[Existing duplicated project fields block a workspace field]** → The name check refuses the workspace field and names the project; the person renames or deletes the project fields first. A merge action is out of scope.
- **[Every list now reads every project row for the placement]** → One shared, memoized partition per snapshot of workspaces and projects (`useFieldPlacement`), reused by every row.
