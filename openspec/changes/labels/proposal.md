# Proposal

## Why

Projects answer "what is this part of"; labels answer "what kind of thing is this" across projects: `@errand`, `@waiting`, `@15min`, `@call`. The task entity already stores and syncs a `labels` string array, but there is no way to create a label, attach one, or see all tasks carrying it. Labels are also the vocabulary the planned filter language (`filter-query-language`) and saved views (`custom-views`) build on, so their identity and rename semantics need to be settled now.

## What Changes

- A new `label` entity (name, colour, position, soft delete) synced through the operation log. The existing `task.labels` array holds label ids, not names, so renaming a label is a single operation and never rewrites tasks.
- Assign and unassign labels from the task detail panel and from a keyboard-reachable picker on a selected task; label chips appear on task rows.
- A "Labels" group in the sidebar with per-label open counts and one view per label listing its open tasks across projects.
- Label lifecycle: create (names unique per user, case-insensitively, on the creating device), rename, recolour, reorder, delete (removes the id from every task), and merge two labels into one.
- REST: `/api/v1/labels` collection; the export gains a `labels` array.
- Documented convergence caveat: `task.labels` is replaced as a whole under last-writer-wins, so two devices adding different labels to the same task offline keep only the newer array. The client minimises exposure by reading the current array immediately before writing, and the design records the path to per-element semantics.

Out of scope: `@label` tokens in quick add (`nlp-quick-add`), label-based filtering expressions (`filter-query-language`), pinned label views and dashboards (`custom-views`), shared or per-project labels (`project-sharing`), a set-based CRDT for `task.labels` (recorded as a follow-up design option), label hierarchies.

This change advances ROADMAP.md section 3, "Labels UI (schema shipped)".

No new environment variables. No breaking change to the op log: `label` is a new entity and `task.labels` keeps its type (array of strings); giving the strings the meaning "label id" is a convention, not a format change, and the array is empty everywhere today.

## Capabilities

### New Capabilities
- `labels`: the label entity, assignment to tasks, label views and counts, lifecycle including rename and merge, the convergence behavior of the task label array, the labels API and export.

### Modified Capabilities
- none. `task-management` already defines the `labels` field as stored and synced.

## Impact

- Server: `label` entity in the op schema and `Plural`; `labels` collection handlers; REST validation that task `labels` reference existing labels; export includes labels. No SQL migration.
- Client: `labels` table and defaults, label picker, chips, sidebar group, label views, merge helper.
- Docs: `docs/sync.md` (schema table and the whole-array caveat), `docs/api.md`, README.
- No new dependencies; bundle growth expected around 5 KB gzipped.
