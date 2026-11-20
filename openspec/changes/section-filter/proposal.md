# Proposal

## Why

Sections group the tasks of one project, but a person's work spans projects: "everything in review" or "everything still in the backlog" means a section of the same name in several projects. The filter language reaches labels, projects, assignees and states, but has no way to ask for a section, so such a list cannot be saved as a view.

## What Changes

- **`section: name` matches tasks in a section of that name.** Names are matched like labels and projects: ignoring case, in every project, quotes for names with spaces. `section: Review | section: Backlog` lists both.
- **`no section` matches tasks that are in none**, including a task whose section was deleted or belongs to another project, as the lists already show them under "No section".
- **The builder gets a Section condition**, picked from a searchable list of section names, with a chip like every other condition.
- The word `section` becomes reserved, like `assigned`.

No schema or op change: a query is plain text and sections are already available to both evaluators.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `filter-queries`: adds the Section terms.

## Impact

`web/src/lib/filter/` (parse, evaluate, builder), `internal/filter/` (parse, evaluate), `web/src/app/filter/` (condition editor), the filter chips, `docs/filters.md`, the shared evaluation vectors and the translation catalogs. Bundle impact is a few hundred bytes of existing filter code.
