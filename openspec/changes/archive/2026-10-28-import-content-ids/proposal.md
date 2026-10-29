## Why

After one custom JSON file was imported, every later JSON file showed all its rows as "already imported" and nothing could be imported (issue #520). Rows without an id got their position as source id (`task:#1`, `task:#2`, `list:#1`), and the importer skips rows whose source id an earlier import of the same profile recorded, so a second file's rows matched the first file's by position. A second file's lists could also be put into the first file's projects.

## What Changes

- In the generic JSON and the lists JSON formats, a row without an id gets a source id made from its content (title, description, project or list, section, parent), with the order of appearance telling equal rows apart, as CSV and Todoist rows already do.
- Importing the same file again is still recognised; a different file is never taken for an earlier one.

Not **BREAKING**. A file imported before the change and imported again is matched by the "looks like a task you have" check (title, project, due date) instead of by its source ids, so it is still skipped by default.

## Out of scope

- Other foreign formats keep their line-number fallback: their exports always carry ids.
- Repairing the record of earlier imports: nothing needs repairing, the old positional ids no longer match anything.

## Roadmap

Fixes #520 for `data-import` (ROADMAP section 6, import).

## Capabilities

### New Capabilities

### Modified Capabilities
- `data-import`: rows without ids get content ids.

## Impact

- `internal/importer/fallbackid.go` (new), `internal/importer/profile_json.go`; `docs/import-steps.md`. No dependency, no size change.
