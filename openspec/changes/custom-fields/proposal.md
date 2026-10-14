# Proposal

## Why

A task in OpenTodo is a title, notes, a date, a priority and labels. People who track a renovation, a client list or a reading pile need one or two more typed columns (a cost, a client, an effort, a link) and today they fold them into the title or the notes, where nothing can filter or sum them. Linear's estimates and Asana's custom fields are the reason the comparison pages concede this gap, and the Linear importer (`named-importers`) must drop estimates with a warning because there is nowhere to put them. The op log is per field already (`internal/sync/ops.go:20-35`), so typed values that converge key by key fit without a new storage model.

## What Changes

- **Field definitions per project.** A new `field` entity, a child of a project like `section`: a name, a type (`text`, `number`, `date`, `choice`, `link`, `checkbox`), the options of a choice field, a position, creation and deletion times. The type is fixed after creation. Definitions are created, renamed, reordered and deleted from a "Fields…" dialog in the project menu, as ordinary operations that work offline and converge. At most 30 live fields per project. Inbox has no fields.
- **Values on tasks, one operation per field.** Values live under an additive `fields` map on the task, but each entry is its own operation `fields.<field-id>`, so two people editing different fields of one task offline both keep their edit, and the same field edited twice resolves by last-writer-wins. This is the first dotted sub-field in the op schema; the server validates the shape of any `fields.<id>` value (null, string, finite number or boolean) and clients, the REST API and the assistant tools validate it against the definition's type. The REST API and the export present the values as a `fields` object.
- **Shown where a task is shown.** A "Fields" group in the detail panel with an editor per type; compact badges on board cards; and, in a project's list view when the project defines fields, an optional columns layout (one column per field, remembered per project per device, wide screens only). A task moved to another project keeps its values in the data but shows only the fields its new project defines.
- **Filterable.** `cost > 100`, `client = "Acme"`, `due_by <= friday`, `done = true`, `no cost`, resolved by field name across the projects the user sees, with a warning for an unknown name. Evaluated on the device like every query, so saved views and dashboards get them for free.
- **Exported and importable.** The JSON export gains a `fields` collection and `fields` on tasks; an own export restores both with their ids. Occurrence records and detached copies of a recurring task carry the series' values.
- **Encrypted accounts.** Field names, choice options and every string value (text, link, date, choice) are user content and are encrypted on the device like titles; numbers and checkboxes stay plaintext, like `priority`.
- **Assistants.** `list_projects` and the project resource list a project's fields; task results carry `fields`; `create_tasks` and `update_tasks` accept a `fields` map validated against the definitions. The REST API exposes `/api/v1/fields` with the usual collection conventions.
- **Refused: formulas and rollups.** A computed field would have to produce the same result on every device and on the server from entities that arrive in any order, which the op log does not promise; and a sum over a project is a view concern, not data. Both are where every task app grows a spreadsheet. If a sum is wanted later, it is a client-side footer on the columns layout, with no data change.

Out of scope:
- Sorting and grouping by a field in views, column resizing, and formulas or rollups (see above).
- Mapping other apps' fields on import (Linear estimates, Asana custom fields): `named-importers` is in flight and drops them with a warning today; a follow-up maps Linear's estimate to a number field once both changes are archived.
- CalDAV: values are not mapped to `X-` properties; CalDAV clients neither see nor change them.
- Fields on projects, labels or comments; per-user (personal) fields on shared projects; changing a field's type after creation; a field shared across projects.
- Quick-add syntax for values.

This advances ROADMAP.md "Next: Parity and depth" row 18, **Custom fields** (`custom-fields`).

Nothing here is **BREAKING**. One new entity and one additive family of task fields (`fields.<id>`); no field is renamed or removed, no environment variable is added. Older clients ignore the entity and the unknown task fields (`web/src/lib/ops.ts:117`); an older server rejects the new ops as unknown, as for every additive change.

## Capabilities

### New Capabilities
- `custom-fields`: field definitions on a project, typed values on tasks, their convergence and offline behaviour, where they are shown and edited, the filter terms, the API and export shape, and the encryption boundary.

### Modified Capabilities
- `task-management`: "Task fields" adds the `fields` map and its per-key convergence.
- `filter-queries`: "Query grammar" adds the field term (`name cmp value`) and `no <field>`.
- `sections-and-boards`: "Board view" shows field badges on cards.
- `end-to-end-encryption`: "Encrypted and plaintext fields" adds field names, options and string values to the encrypted set, numbers and checkboxes to the plaintext set.
- `data-import`: "Own export completeness" adds field definitions and values to the round trip.
- `http-api`: "Collection endpoints" adds the `fields` collection and the `fields` object on tasks.
- `mcp-server`: "Read-only tools" and "Write tools" carry and accept fields.

## Impact

- **Op schema:** entity `field` (`name` kString, `project_id` kID, `type` kString, `options` kString, `position` kNumber, `created_at` kNumber, `deleted_at` kNullableNumber) and the task prefix family `fields.<id>` (a new kind for null, string, finite number or boolean) in `internal/sync/ops.go` `Schema` and `Validate` (`:276-311`); `Plural` gains `fields`. Scope, role and purge wiring follow `section`: `internal/sync/scope.go:280-284` and `:360`, `CanWrite` (`:121-131`), `internal/sync/trash.go:412,483-484`. `internal/e2ee.ContentFields` gains `field.name`, `field.options` and the `task.fields.*` prefix; same in `web/src/lib/e2ee.ts` `CONTENT_FIELDS`. Occurrence records copy the values (`internal/sync/recurring.go:117-124`, `web/src/lib/recurring.ts:43-54`).
- **Server:** REST folding of `fields.<id>` into a `fields` object and validation against definitions in `internal/httpapi` (a `fields.go` beside `sections.go:54-101`), the `fields` collection through the generic collection handlers (`server.go:267-271`), the export (`server.go:1568-1611`), the importer (`internal/importer/profile_opentodo.go:28-96`, a `KindField`), the agent tools (`internal/agenttools/write.go:557,657`, `data.go:249-268`, `read.go:134-142`). No new route pattern beyond the collection, no demo deny-list entry (ordinary data writes).
- **Web:** `web/src/lib/types.ts`, `ops.ts` (fold and unfold of `fields.*` in `applyOps:150-151` and `mutateMany:273-277`, defaults, `tableFor`), `db.ts` (a `fields` table, the next free Dexie version), `e2eeSync.ts:73`, `assistant.ts:137`, `lib/filter/parse.ts` and `evaluate.ts`, a new `lib/fields.ts` (definitions, validation, formatting), the Fields dialog from `ProjectHeader.tsx:120`, the detail panel group (`TaskDetail.tsx`, placed in the properties card by `task-detail-redesign`), badges in `TaskRow.tsx`, the columns layout in `TaskListView.tsx`, history labels in `HistoryPanel.tsx`.
- **Docs:** `docs/tasks-and-projects.md` (new section), `docs/filters.md` (grammar and terms), `docs/sync.md` (entity, prefix family, encryption), `docs/api.md` (fields collection, `fields` on tasks), `docs/import.md`, `docs/e2ee.md`, `docs/mcp.md`, `docs/ai-and-agents.md`.
- **Size:** no dependency. An estimated 10–14 KB gzipped on the web bundle (dialog, editors, columns layout, filter terms); the Go binary grows by a few KB of handlers plus the embedded bundle; server memory unchanged (values are rows in the existing state table).
