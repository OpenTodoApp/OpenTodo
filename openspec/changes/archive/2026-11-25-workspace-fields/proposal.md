# Proposal

## Why

Issue [#2029](https://github.com/OpenTodoApp/OpenTodo/issues/2029): someone who tracks the same fields (`Client`, `Effort`, `Stage`, `Billable`) across many top-level projects defines them again in every project. The copies drift apart (a choice option added in one project and not the others), which makes cross-project filters unreliable. Sub-project inheritance (`inherited-custom-fields`) does not help when the projects are not one tree.

## What Changes

- A field can belong to a workspace instead of a project. It applies to every project of that workspace, listed before the projects' inherited and own fields, and works everywhere a project field works: the panel, columns, badges, filters, sorting, the export, the REST API and the assistant and MCP tools.
- Only the workspace's owner defines its fields. The definition lives in the owner's personal sync scope, like a label, so it works offline and converges per field. Other members of a shared workspace or project do not see it (a later change can add a shared workspace scope, see the design).
- Settings → Workspaces → General gains a **Fields** row for the owner that opens the existing **Fields…** dialog for the workspace. A project's **Fields…** dialog lists the workspace's fields first, read-only, under "From *Workspace*".
- Names stay unique across everything that applies: a workspace field cannot take a name a project of the workspace uses, and a project field cannot take a workspace field's name. The clash message names the project or the workspace. The 30-field limit counts workspace fields on every project.
- Moving a project to another workspace changes which workspace fields apply, like moving a sub-project: values stay in the data, hidden, and reappear when it moves back.
- One additive op field, `field.workspace_id` (nullable string; null is the default workspace). A workspace field has an empty `project_id`, which is never written as an op.

No new environment variable, no migration, no rename or removal of an op field. Not **BREAKING**: existing definitions all have a project and behave exactly as before; a client from before this change ignores a definition without a project.

**Out of scope**: instance-wide (global) fields; workspace fields that the other members of a shared workspace see and edit (needs a workspace sync scope); per-project opt-out of a workspace field; a "merge same-named project fields into a workspace field" action (clashes are refused instead); workspace fields in the time-tracking CSV and in the `ot vault` Markdown export, which keep listing project fields only.

ROADMAP.md: extends the custom-fields rows with `workspace-fields` (0.20 "Everywhere", beside `workspace-feature-switches`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `custom-fields`: "Field definition entity" and "Values follow the task's project" cover workspace fields. New requirements: "Workspace fields", "Names and limits across a workspace", "Workspace fields in the Fields dialog", "Workspace fields in the API and tools".
- `workspaces`: "Workspaces settings page" gains the owner's Fields row.

## Impact

- **Op schema**: `field.workspace_id` in `internal/sync/ops.go` (`web/src/generated/opSchema.ts`, `internal/sync/testdata/schema_fixture.json` regenerated).
- **Shared logic**: `ApplicableFields` (Go) and `applicableFields` (TS) take a placement of projects in workspaces; the shared vectors `web/src/lib/fields.vectors.json` gain workspace cases.
- **Server**: `internal/httpapi/fields.go` (create and rename checks, task values), `internal/sync/reach.go` (a token limited to workspaces), `internal/agenttools/data.go` (`list_projects` lists workspace fields with `workspace_id`), `internal/importer` (own export round trip).
- **Web**: `lib/fieldTree.ts`, `lib/fields.ts`, `lib/localData.ts`, `lib/filter/evaluate.ts`, `lib/views.ts`, `lib/listGroups.ts`, `app/FieldsDialog.tsx`, `app/WorkspaceGeneral.tsx`, ten catalogs.
- **Docs**: `docs/custom-fields.md`, `docs/api.md`, `docs/mcp.md`, `docs/contracts.md`, the changelog.
- Issue: Refs #2029 (shared workspaces and instance-wide fields stay open).
