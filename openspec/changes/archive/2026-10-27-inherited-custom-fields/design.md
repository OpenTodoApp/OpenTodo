# Design

## Context

Custom fields today (`custom-fields`, see `openspec/specs/custom-fields`):

- **Definitions** are `field` entities with an immutable `project_id`. They are written as ops and live in the project's scope: the owner's personal scope, or `project:<id>` for a shared project.
- **Values** are `fields.<defId>` op fields on the task, so they converge per field.
- **"Which fields apply to a task"** is decided in one place per side:
  - Client: `liveFields(projectId, defs)` in `web/src/lib/fields.ts`, used by the panel (`FieldsGroup`), the dialog (`FieldsDialog`), the columns layout (`useListModel`), the badges (`fieldBadges`) and the definition checks (`projectFields`).
  - Client filters: `lib/filter/evaluate.ts` compares `task.project_id === def.project_id`.
  - Server: `Server.fieldDefs` in `internal/httpapi/fields.go` (task values, create and rename checks), `snapshot.fieldDefs[pid]` in `internal/agenttools/data.go` (list, values, patches), and `byProject` in `internal/timetrack/csv.go` (time CSV columns).

Projects form a tree through `project.parent_id`. The tree is derived and never repaired: `web/src/lib/tree.ts` treats a missing parent as a root and breaks cycles by clock. A sub-project's workspace is its root's (`workspaces.ts` `Partition.project`), so a parent and its children are always in one workspace.

Sharing is per project, independent of the tree. A member of a shared sub-project whose parent stays private does not receive the parent row or its field definitions.

## Goals / Non-Goals

**Goals:**
- Replace every "fields of this project" decision with one resolver of the fields that apply. It must give the same answer on the device and on the server, offline, and be pinned by shared vectors.
- Keep the data model, the op log, sync and the export exactly as they are.

**Non-Goals:**
- Making a parent's definitions visible to people who cannot see the parent. This would cross a scope boundary and leak field names and options.
- Overriding, hiding or reordering an inherited field inside a sub-project.
- A server-side guard on the sync path. The reference rules stay client and REST checks, as today (custom-fields D3).

## Decisions

### D1. One resolver, defined on raw parent pointers

`applicableFields(projectId, projects, defs)` (TS, `web/src/lib/fieldTree.ts`, pure so the filter engine can use it) and `ApplicableFields(projectID, projects, defs)` (Go, `internal/sync/fields.go`):

1. No project id (Inbox): return nothing.
2. Collect the chain. Start at the project and follow `parent_id` while the parent is among the given projects, is not deleted, and has not been visited yet.
3. Return the live definitions of each project in the chain: farthest ancestor first, the project itself last. Within one project, order by position, then id (`compareByPosition`).

The project's own definitions apply even when its own row is absent, which is today's behaviour. That matters for a value written before the project row arrives.

Why raw pointers rather than the sidebar's clock-based cycle breaking:

- REST entities carry no clocks, so the server could not reproduce the clock rule.
- A cycle only exists between concurrent moves until they converge. In a cycle A→B→A, the raw walk gives A the fields of B and A, and gives B the fields of A and B: no project twice, the same on every side, nothing written.

Shared vectors in `web/src/lib/fields.vectors.json` cover: own fields only, a parent, a grandparent, deleted definitions, a deleted parent, a missing parent, a cycle, the Inbox, and position ties. They are read by `internal/sync/fields_vectors_test.go` and `web/src/lib/fields.test.ts`, and listed in `docs/contracts.md`.

An alternative considered: copying definitions into sub-projects (the issue's "Copy fields from…"). Rejected, because renames and option changes would drift apart, which is the issue's own complaint.

### D2. Where the resolver replaces today's checks

| Place | Before | After |
| --- | --- | --- |
| Panel, columns, badges | `liveFields(task.project_id, defs)` | `applicableFields(task.project_id, projects, defs)` |
| Filters (`name cmp value`, `no name`) | `task.project_id === def.project_id` | the definition is in the applicable set of the task's project, computed once per compile as a map from project to definition ids |
| `FieldsDialog` | own definitions | inherited definitions (grouped by defining project, read-only), then own |
| Definition checks (`createField`, `renameField`) | names among siblings; at most 30 siblings | names among the applicable set and among every descendant's own live definitions; the 30 limit counts the applicable set, and adding to P checks every descendant's applicable set plus one |
| Option rename (`setFieldOptions`) | tasks of the defining project | tasks of the defining project and every descendant |
| Delete confirmation (`countValues`) | tasks of the defining project | tasks of the defining project and every descendant |
| REST task values (`checkTaskFields`) | definitions of the task's project | applicable definitions of the task's project after the write |
| REST field create and rename (`checkField`) | siblings | the same rules as the client checks; errors name the conflicting project |
| Agent tools (`list_projects`, values, patches) | `fieldDefs[pid]` | the applicable set; each listed field carries `inherited_from` (the defining project id) when inherited |
| Time CSV columns | the task's project's fields | the applicable fields of the task's project |

Descendants are found with the existing `descendants()` (TS) and an equivalent walk in Go, over the projects the person can see.

### D3. Clashes are shown, not repaired

A move, or two offline edits, can make two applicable fields share a name. Both stay shown in the panel and the columns, because hiding one would hide values. The dialog marks the project's own field with a "Same name as a field from *Parent*" note, and its rename action works as usual. Filters by name already match both definitions. No op is written by any display rule.

### D4. Sharing

The resolver only sees projects and definitions the person has, so inheritance follows visibility with no extra code. A shared sub-project's dialog shows a quiet note under its inherited group, when it has one: members see these fields only if they can see the defining project. On the server, a member writing a value for a field they cannot see is refused as "not a field of the task's project", as today.

### D5. End-to-end encryption

Field names and options are content fields, so on an encrypted account the server holds ciphertext:

- The server's name comparisons skip ciphertext, as today. The project names in its error messages go through `e2ee.Display`.
- Clients compare decrypted names, so the dialog enforces the rules on encrypted accounts too.

### Data model, size and budget

- **Data model:** no new entity, field or migration. The op schema is unchanged and no generated file changes.
- **Size:** a few hundred lines of Go and TS and no dependency. The web change touches code already in the lazily loaded project screens and the task panel, so the first-load gzip budget is unaffected; `make bundle-budget` confirms it.
- **Interface budget (docs/interface-guide.md):**
  - Inherited fields add rows only to the Fields group and the columns the person asked for; default properties are unchanged.
  - The dialog gains one read-only group.
  - No new chrome row, sidebar destination, scroll region or shortcut.

## Risks / Trade-offs

- **[Long chains slow lists]** Every row resolves its project's applicable fields. → Compute a map from project to applicable fields once per render, from the shared snapshots, and reuse it for every row.
- **[Clashes confuse]** Two fields named "Size" on one task. → The dialog flags the clash and offers rename. It can only arise through moves or concurrent offline edits, which the checks otherwise prevent.
- **[Members of a shared sub-project miss inherited fields]** → D4's note in the dialog, and the docs say so. A real fix would mean sharing the parent.
- **[Importers create same-named fields in a parent and a sub-project]** → The importer's plan creates definitions per imported project without knowing the tree. Clashes are shown (D3), and this change leaves the importer as it is.
