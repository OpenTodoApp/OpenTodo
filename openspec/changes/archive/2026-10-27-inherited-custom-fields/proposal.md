# Proposal

## Why

Issue [#405](https://github.com/OpenTodoApp/OpenTodo/issues/405): a person keeps one area of their life as a project with about 20 sub-projects and scores every task with the same five Number fields. A field belongs to exactly one project, so they define the same fields in every sub-project (100 definitions), again for every new topic, and edit a rename 20 times. Filters already treat same-named fields across projects as one; only the definitions are duplicated.

## What Changes

- The fields that apply to a project are its own live definitions plus those of its ancestors, to any depth: a field defined on "Scoring" applies to every sub-project of "Scoring" and their sub-projects. The set is derived on every device from the project tree; nothing is copied or written.
- A task in a sub-project shows, edits, filters by and exports inherited fields like its own. Values stay keyed by the defining field's id, exactly as today: no op, schema, sync or export change.
- The sub-project's **Fields…** dialog lists inherited fields first, marked "From *Parent*", read-only there (they are edited in the project that defines them); its own fields follow.
- Names stay unique across everything that applies: a sub-project can't add a field named like an inherited one, and a project can't add or rename a field to a name a sub-project at any depth already uses (the message names that sub-project).
- The 30-field limit counts own plus inherited fields; adding to a project is refused when a sub-project would pass 30.
- Moving a sub-project changes which fields apply, like moving a task between projects: values stay in the data and reappear when it moves back. A name clash that arrives through a move or concurrent offline edits is shown, never repaired.
- Renaming a choice option rewrites the values of tasks in the sub-projects too; the delete confirmation counts them.
- Sharing: a person sees inherited fields only from projects they can see. A member of a shared sub-project who is not a member of its parent sees the sub-project's own fields only; values stay in the data.
- The REST API accepts values for inherited fields on a task, refuses the clashes above with `400 invalid_input`, and the assistant and MCP tools list a project's inherited fields with the project that defines them.

No new environment variable, no migration, no op-log format change. Not **BREAKING**.

**Out of scope**: the "Copy fields from…" alternative in the issue, overriding or hiding an inherited field in a sub-project, formulas and rollups (refused by the roadmap), and inheritance between workspaces or from tasks.

ROADMAP.md: extends the shipped custom-fields row (row 18, `custom-fields`) with `inherited-custom-fields`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `custom-fields`: "Values follow the task's project" now reads "the fields that apply to its project". New requirements: "Sub-projects inherit their ancestors' fields", "Names and limits across a project tree", "Inherited fields in the Fields dialog", "Inherited fields and sharing" and "Inherited fields in the API and tools".

## Impact

- **Shared logic**: one resolver, `applicableFields` in `web/src/lib/fieldTree.ts` (re-exported by `fields.ts`) and `ApplicableFields` in `internal/sync/fields.go`, pinned by new shared vectors `web/src/lib/fields.vectors.json` (listed in `docs/contracts.md`).
- **Web**: `FieldsDialog.tsx`, `task-detail/FieldsGroup.tsx`, `task-list/useListModel.ts` and `FieldColumns.tsx` (columns), `TaskRow.tsx` (badges), `lib/filter/evaluate.ts` (field terms), `lib/fields.ts` (checks, option rename, value counts), `lib/localData.ts`.
- **Server**: `internal/httpapi/fields.go` (task values, create and rename checks), `internal/agenttools/data.go` (list, values and patches), `internal/timetrack/csv.go` (columns of the time CSV).
- **Docs**: `docs/custom-fields.md` (or the page that documents fields), the in-app help, CHANGELOG, ROADMAP.
- Issue: Closes #405.
