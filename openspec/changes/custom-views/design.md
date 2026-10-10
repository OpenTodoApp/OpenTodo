# Design

## Context

Saved views are the first synced entity that holds user preference rather than task content. They reuse the filter grammar from `filter-query-language` (dependency) and the generic entity pattern (schema entry, client table, REST collection, export key). Decisions here are about what is synced versus per device, how to store a dashboard, and how to validate enumerated options without breaking convergence.

## Goals / Non-Goals

**Goals:**
- Saved queries and their presentation options available on every device.
- Pinning and ordering in the sidebar.
- Dashboards as a composition of saved views, no new rendering primitives.
- A per-device start view.

**Non-Goals:**
- Sharing views, charts, server-side evaluation, hiding built-in views.
- Grammar changes (owned by `filter-query-language`).

## Decisions

### D1. Data model: `view` entity
Fields (all additive, validated by existing kinds): `name` string, `query` string, `kind` string (`list`|`dashboard`), `group_by` string (`project`|`due`|`priority`|`label`|`none`), `sort_by` string (`due`|`priority`|`position`|`created`|`title`), `sort_dir` string (`asc`|`desc`), `pinned` bool, `position` number, `color` string, `panels` array of strings (view ids; empty for lists), `created_at` number, `deleted_at` number|null. Enumerations are strings on the wire so a future option value is additive; the client maps unknown values to defaults at render time (no rewrite), and REST rejects them because REST is sequential and safe to reject.

### D2. Store the query string, not the AST
The string is what the user typed and what the documentation describes; it re-parses under future grammar versions and is readable in the export and API. A view whose query fails to parse shows the parse error from `filter-queries`, so an old client meeting a newer term degrades to a visible message rather than wrong results.

### D3. Dashboards as `panels` on a view
A dashboard is a view with `kind=dashboard` and `panels` = ordered view ids. Reusing the entity avoids a second collection and lets dashboards be pinned, ordered and exported like any view. `panels` is a whole-array register (same caveat as `task.labels`); concurrent panel edits on two devices resolve to the newer list, which is acceptable for a six-item preference. Deleted or missing panel views render a placeholder. Nesting dashboards inside dashboards is refused by the client.
- Alternative: a `dashboard_panel` entity per panel. Rejected: more schema for a small list whose ordering would then need positions and cycle checks.

### D4. Start view is per device
Stored in the local `meta` table (`startView`), not synced: a phone starting on "Errands" and a desktop on "Work tomorrow" is the common case, and a synced setting would need per-device overrides anyway. Fallback to Inbox with a notice when the saved view is gone.

### D5. Counts and evaluation
Sidebar counts for pinned views run the compiled predicates from `filter-queries` over the same live task query the sidebar already observes, so one pass yields all counts. Dashboards evaluate each panel's predicate on the same pass. With at most a handful of pinned views and six panels this stays linear in task count.

### D6. REST validation
`POST/PATCH /api/v1/views` validate: `name` non-empty, `query` parses (the server embeds a Go port of the tokenizer and parser sufficient to accept or reject; evaluation stays client-side), enumerations within the allowed sets, `panels` ids exist and are list views, `kind` immutable after creation. Keeping a Go parser in sync with the TypeScript one is a maintenance cost accepted so that scripts get immediate feedback; both are tested against the same examples file from `docs/filters.md`.
- Alternative: no server-side query validation. Rejected: a typo via the API would only surface in the UI later.

## Data model impact
- New entity `view` (13 fields) in server `Schema` and `Plural` (`views → view`), client types, defaults and a `views` table (database version bump). No existing field changes, no renames. Export gains `views`; version stays 1. All writes through the op log.
- Dependencies: none. Container image grows by the Go parser (well under 100 KB in the binary, negligible); runtime memory unchanged. Client bundle +5–7 KB gzipped.

## Risks / Trade-offs

- [Two parsers drift] → shared examples file used by both test suites; the grammar is frozen by `filter-queries`.
- [`panels` whole-array LWW loses a concurrent edit] → six-item preference, newer edit wins, documented.
- [Many pinned views cost a full scan each] → one pass evaluates all predicates; counts debounced.
- [Start view points at deleted view] → fallback to Inbox with notice.

## Migration Plan
Additive; no data migration. Requires `filter-query-language` to be applied first (parser, Filter view). Rollback: older clients ignore `view` ops (unknown-entity guard) and show no Views group.

## Open Questions
- Whether `project-sharing` should allow views over shared projects to be shared with the same members; the entity needs no change for that, only an owner scope.
