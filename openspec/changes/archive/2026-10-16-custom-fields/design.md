# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **The op log is per field, and a "map" field is one register.** An op sets `(entity, entityId, field)` to a value (`internal/sync/ops.go:20-35`); the server materializes one row per field in `scope_fields` (`service.go:304-340`) and `Entity` is a flat `map[string]json.RawMessage` (`service.go:664-731`). `task.labels` is a `kStringList` and therefore a single last-writer-wins value: two devices adding different labels offline lose one. There are no dotted sub-fields; `Validate` looks the field name up in `Schema` exactly (`ops.go:290-296`).
- **The client applies ops field by field too.** `applyOps` sets `row[op.field] = op.value` and `clock[op.field]` (`web/src/lib/ops.ts:150-151`); `mutateMany` turns each patch key into one op (`ops.ts:273-277`). Unknown entities are skipped (`ops.ts:117`).
- **`section` is the precedent for a per-project child entity.** Scope resolution (`internal/sync/scope.go:280-284`, `:360`), `CanWrite` (editor and above, `:121-131`), purge with the project (`trash.go:483-484`), REST reference checks (`internal/httpapi/sections.go:54-101`), the `sections` Dexie table (`web/src/lib/db.ts:253-271`), scope lookup on the client (`e2eeSync.ts:73`), `assistant.ts:137`, the importer `KindSection`, and the export key. `section` touches five places in `internal/sync` and two in `internal/httpapi`.
- **REST bodies are ops.** `fieldOps` maps body keys to ops one to one (`server.go:1484-1490`); `checkReferences` and `checkSections` validate cross-entity references before that (`server.go:1366-1420`).
- **Occurrence records copy a fixed list of fields** on the client (`recurring.ts:43-54`) and on the server (`recurring.go:117-124`).
- **Encryption is per field name and string values only.** `IsContentField` is an exact-name lookup (`internal/e2ee/e2ee.go:48-55`, `web/src/lib/e2ee.ts:37-39`); the client encrypts string values of content fields and leaves other types alone (`e2eeSync.ts:84,132`).
- **Filters.** The grammar in `lib/filter/parse.ts:1-12` reserves `due`, `created`, `no`, `search:` and the keywords; `compile` produces warnings for unknown label and project names (`evaluate.ts:80-90`).
- **In-flight neighbours.** `task-detail-redesign` turns the panel into a properties card and moves Estimate and Repeat into rows; this change adds a "Fields" group that lands in that card. `labels-and-menus` rebuilds the project menu; "Fields…" is one more item. `named-importers` drops Linear estimates with a warning; it is not touched.

## Goals / Non-Goals

**Goals:**
- Per-field convergence of values with the smallest schema change: one prefix family on `task`, no new write path.
- Definitions that converge like sections and need no coordination to create concurrently.
- The server never interprets a value's meaning; validation against a definition happens where the definition is known (clients, REST, assistant tools).
- Everything that shows a task (panel, rows, board, columns, filters, history, export, tools) shows the values without a second data source.

**Non-Goals:**
- Formulas, rollups, sorting or grouping by a field, type changes, cross-project fields, CalDAV mapping, importing other apps' fields (proposal, Out of scope).
- A server-side search over values (filters run on the device, like every query).

## Decisions

### D1. Definitions are a `field` entity, a child of the project

New entity `field`:

| field | kind | notes |
| --- | --- | --- |
| `name` | kString | user content (encrypted on encrypted accounts) |
| `project_id` | kID | fixed at creation, like `section.project_id` |
| `type` | kString | `text`, `number`, `date`, `choice`, `link`, `checkbox`; carried as a string like `view.kind`, so a later type is additive; a client shows an unknown type read-only as text |
| `options` | kString | choice options, one per line, in display order; `""` otherwise. A single string so the whole list is one encryptable content value; at most 50 lines of 100 characters |
| `position` | kNumber | |
| `created_at` | kNumber | |
| `deleted_at` | kNullableNumber | tombstone |

`Plural` gains `fields: field`. The entity joins every `case "task", "section"` in `scope.go` and `trash.go`, `CanWrite` (editor and above), `e2eeSync.ts` scope lookup, `assistant.ts` `tableFor`, the importer kinds, the export, and `docs/sync.md`. Dexie gets a `fields: 'id, [project_id+position], project_id'` table at the next free version, every store redeclared.

- **Alternative: an additive `fields_schema` JSON value on `project`.** Rejected. It is one LWW register, so two members adding fields offline lose one; `CanWrite` lets only admins write project fields, which would make field management admin-only or require a special case; and a new JSON kind with its own validation is about as much code as the entity, without the convergence.
- **Alternative: definitions as plain strings in the value key (`fields.cost`), no entity.** Rejected. A rename would orphan every value, two projects could not both have "Cost" with different types, and there would be nowhere to store a type or options.
- **Why editor and above, not admin.** Sections set the precedent: whoever organizes tasks organizes their structure. Linear restricts field definitions to admins; a household project has no admins. The maintainer may tighten this to admins by one line in `CanWrite`; the spec says "editor and above".

Uniqueness of names (case-insensitive) and the 30-field limit are enforced by the dialog, the REST API and the assistant tools, not by `Validate` (which sees one op and no other entity). Two devices creating "Cost" offline end with two fields named Cost; the dialog shows both and the filter matches either, and the user deletes one. This is the same class of outcome as duplicate labels, which the Labels page already surfaces.

### D2. Values are `fields.<field-id>` operations on the task

The op field name is `fields.` followed by the definition id. In `Schema`, `task` gains no exact entry; instead `fieldKind(entity, field)` returns the exact entry when there is one and, for `task`, the kind `kFieldValue` when the name is `fields.` plus 1–64 characters of `[A-Za-z0-9_-]`. `Validate` and every reader that asks "is this a known field" use the helper (`DocFields`, `IsContentField`, the activity and history readers that iterate ops, `webhooks`). `kFieldValue` accepts `null`, a string (bounded by `MaxValueBytes` like every value), a finite JSON number or a boolean; objects and arrays are refused. Each key is its own row in `scope_fields`, so convergence per field costs nothing new.

The server does not look the definition up: `Validate` runs per op inside the batch transaction without entity lookups (only membership and references are resolved, `scope.go`), the definition may be in the same batch or a later one, and a value whose definition was deleted is still a valid op. Type conformance is the client's, the REST layer's and the tools' job (D5, D6), and readers tolerate a mismatch (spec "Value that no longer matches its definition").

On the client, `applyOps` folds: when `op.field` starts with `fields.`, it writes `row.fields[id] = op.value` and keeps the clock under `fields.<id>`; `mutateMany` unfolds a `fields` entry of a patch (a partial map) into one op per key, so a caller writes `mutate('task', id, { fields: { [costId]: 120 } })` and touches nothing else. `Task.fields: Record<string, string | number | boolean | null>` defaults to `{}`; rows synced before the change hold `undefined` and are read with `?? {}`. History (`HistoryPanel`) and activity show `fields.<id>` ops as "Cost: 100 → 120" by resolving the id against the local `fields` table, falling back to the id.

Occurrence records and detached copies copy every `fields.*` entry (`copyOf` and the server's list in `RecurringCompletion`), so a completed occurrence keeps its cost and both sides write the same record.

- **Alternative: one `fields` map as a single LWW value.** Rejected: the `labels` problem above, on a field that will hold several independent values.
- **Alternative: a `field_value` entity per (task, field).** Rejected: one entity per value multiplies rows and ops, needs its own scope and purge wiring, and would not move, complete or tombstone with the task for free.
- **Alternative: exact schema entries generated per definition.** Impossible: the schema is a compile-time map and definitions are user data.

**Data model impact:** one new entity and one additive family of task fields; no rename, no retype. `MaxValueBytes` applies unchanged. No migration: absent values mean "empty".

### D3. REST and export present a `fields` object

`handleList`, `handleGet`, the task-returning paths of `writeFieldsAt` and `handleExport` run `foldFields(entity)`: `fields.<id>` keys are moved into a `fields` object (always present on a task, `{}` when empty). On input, `checkFields` (a `fields.go` beside `sections.go`) runs after `checkSections` in `handleCreate` and `handlePatch`: it requires `fields` to be an object, loads the live definitions of the task's project after the write (`project_id` from the body or the existing row), refuses an unknown or foreign id and a type mismatch with `400 invalid_input` naming the id, and replaces the object with `fields.<id>` keys so `fieldOps` emits one op per key. A direct `fields.<id>` key in a body is refused like any non-schema key, so clients have one spelling. The `fields` collection goes through the generic handlers with a `checkField` for create (name, type, existing non-deleted `project_id`, options shape, the 30 limit, name uniqueness) and patch (`type` and `project_id` immutable). `annotateProjects` / `stripAnnotations` need no change.

The export carries `fields` (definitions, tombstones included) beside `sections`, and tasks carry the folded object. `profile_opentodo.go` reads `fields` into `KindField` rows (verbatim entities, like sections) and unfolds each task's `fields` object back into `fields.<id>` entity keys; `plan.go` keeps definition ids like section ids; the undo order gains `KindField` after tasks. Other profiles are untouched.

### D4. Encryption: names, options and string values

`e2ee.ContentFields` gains `field: {name, options}` and `IsContentField` returns true for `task` fields with the `fields.` prefix; `CONTENT_FIELDS` and `isContentField` mirror it. The client already encrypts only string values of content fields (`e2eeSync.ts:84,132`), so text, link, date and choice values become ciphertext and numbers and booleans stay plain, with no per-type logic. The server's `Display`/`IsCiphertext` path shows the placeholder for ciphertext strings in tool results, as for titles. A choice value is the option's text, so it encrypts like any string; the trade-off is that renaming an option rewrites values (D5) rather than following an id. Shared projects stay plaintext (unchanged rule). The migration that encrypts existing data on enablement (`MIGRATION_ORDER`, `e2eeSync.ts:254`) gains `field` before `task`.

### D5. Client: dialog, panel group, badges, columns, filters

- **`lib/fields.ts`** (pure): `FieldType`, `parseOptions`, `validateValue(def, raw) → {ok, value} | {ok: false, message}`, `formatValue(def, value, prefs)` (numbers with `Intl.NumberFormat`, dates through `formatDate`), `liveFields(projectId, defs)`, `fieldsByName(defs)`.
- **Fields dialog** (`app/FieldsDialog.tsx`, opened from the project menu "Fields…", `ProjectHeader.tsx:120`, and `Shift+F` while the project is open): a list with name, type, drag and `Alt+↑/↓` reorder, rename inline, options editor for choices, delete behind the app's `ConfirmDialog` stating "Values on n tasks are kept but hidden". Writes through `createField`, `renameField`, `setFieldOptions`, `reorderField`, `deleteField` in `lib/fields.ts`, modelled on `lib/sections.ts:17-67`. Renaming an option rewrites the tasks of the project that hold the old text, as one `mutateMany` batch on this device (ordinary `fields.<id>` ops; a concurrent edit of the same value resolves by LWW).
- **Panel group**: `FieldsGroup` under Estimate in `TaskDetail.tsx` today; `task-detail-redesign` places it in the properties card. Editors by type: `Field` text input; number input with `inputmode="decimal"` parsed with the browser locale's decimal separator; `DateField` from `app/datetime`; `Combobox` for choice (options plus "Clear"); link input with an `external-link` action (`target="_blank" rel="noopener noreferrer"`); `Switch` for checkbox. Values not matching the type render as text with a "(not a number)" note and `aria-describedby`.
- **Badges**: `TaskRow.tsx` after the estimate chip, from `formatValue`, three at most then "+n" with a `title`/`aria-label` listing the rest. On the board the card is the row (`renderCard`, `TaskListView.tsx:787-796`), so cards get them for free. Badges render in every list, not only the project, because a Today row with "Cost 120" is useful; they are hidden on rows narrower than 360 px of content by the existing chip overflow rule.
- **Columns**: a `columns` option in the per-project view mode (`lib/sections.ts:131-143`, `loadViewMode` returns `'list' | 'board' | 'columns'`), offered by the view toggle only when `liveFields` is non-empty and the viewport is ≥ 768 px. Rendering is `role="table"` on the same rows: the title cell keeps the row's controls, one `cell` per definition with the formatted value, a sticky header row. Keyboard stays the list's (`j`/`k`, Enter opens the panel); cells are not individually focusable (editing is in the panel), which keeps the layout a projection rather than a second editor. Section headings stay as group rows.
- **Filters**: `parse.ts` gains a `field` term: a bare word that is not a reserved word, or any quoted string, followed by `cmp` and a value (`number | string | true | false | date`), and `no <name>` for names outside `date|project|labels|time`. `FilterContext` gains `fields: readonly FieldDef[]`; `compile` resolves the name against live definitions (ignoring case, any project), emits the "No field named X" warning, and compiles per type: number comparisons, date comparisons through `resolveDate`, `=` for text/link/choice (case-insensitive), `= true|false` for checkbox; an operator the type does not support is a `FilterSyntaxError` at the operator. `printQuery` round-trips the term. The Filter view's autocomplete lists field names after a quote.

### D6. Assistant tools

`taskOut` gains `Fields map[string]any` (numbers and booleans) and `Untrusted.Fields map[string]string` (string values, which are user text); `projectOut` gains `Fields []fieldOut{ID, Type, Options []string, Untrusted{Name}}`, also in the project resource. `create_tasks` and `update_tasks` accept `fields` (an object), validated in `planCreateTasks`/`planUpdateTasks` against the snapshot's definitions of the target project (`-32602` naming the id and the expected type), and emit one `fields.<id>` patch entry each; the change-set review in the web app shows them as "Cost → 120" using the local definitions. No tool creates or deletes definitions (spec "Write tools").

### D7. Formulas and rollups are refused by design

A formula needs the same answer on every device and on the server from entities that arrive in any order and may be missing (a value whose definition is late, a task in a project the viewer cannot see), which the op log does not promise; it also needs an expression language, its errors and its migration. A rollup is a view concern: a sum over the tasks of a project is computed from rows already on the device, and if wanted it is a footer in the columns layout, with no data change. Both are deferred, not planned.

## Risks / Trade-offs

- **[A prefix family is a new concept in `Validate`]** → One helper (`fieldKind`) behind the exact lookup; every reader that iterates `Schema` is listed in the tasks and tested with a `fields.<id>` op in the sync, activity, history, webhook and e2ee test suites. The op format is unchanged: a field name is still a string.
- **[Values reference a definition the device may not have yet]** → The panel shows only live definitions of the task's project; a value without one is kept and invisible. The export carries both. No display rule writes.
- **[Choice values are text, so renaming an option rewrites tasks]** → One batch on the renaming device, ordinary LWW; a concurrent edit of the same value on another device wins or loses per field like any edit. Documented in the user guide; the dialog says "n tasks will be updated".
- **[Duplicate names after concurrent creation]** → Visible in the dialog and the filter matches either; same outcome class as duplicate labels, which the app already surfaces.
- **[Older server rejects `field` and `fields.*` ops as unknown]** → As every additive change: ship server before clients; the rejected-op path applies, the device keeps its values.
- **[Encrypted accounts: a date value is ciphertext on the server]** → Nothing on the server reads custom dates (reminders and CalDAV use `due`, not fields). Filters run on the device after decryption.
- **[Columns layout widens rows]** → Wide screens only, remembered per project per device, header sticky; the layout check in `scripts/e2e-*` covers 768 px with five fields.
- **[Bundle growth]** → The dialog and the columns layout are lazily loaded with the project view chunk; the filter and panel editors are small. Estimated 10–14 KB gzipped in total.

**Size:** no dependency. Web bundle as above; the Go binary gains a few KB (`fields.go`, folding, importer kind, tool schemas) plus the embedded bundle; server memory unchanged (values are rows of the existing state table; one definition list per request where validated).

## Migration Plan

No data migration. The new Dexie version adds an empty `fields` table; absent `fields` values read as `{}`. Rollback is shipping the previous binary: old clients ignore the `field` entity and the `fields.*` ops (`ops.ts:117` skips unknown entities; unknown task fields are stored as plain row keys and ignored), and the old server rejects the new ops while the rows already written stay in the log.
