# Proposal

## Why

OpenTodo's Todoist import reads a backup ZIP, and Todoist's backups are a Premium feature. Every Todoist account, free ones included, can create an API token under Settings → Integrations → Developer (discussion #1237, issue #1238).

## What Changes

- **Import with a Todoist API token.** On the import screen, Switch from: Todoist offers **Or import with a Todoist API token**. The server asks Todoist's sync endpoint once for the projects, sections, labels, tasks and comments, and the screen previews and imports the answer like a file, through the existing `json-items` profile, with the same options, limits and Undo.
- **The token** is used for that one request and never stored or logged. The request goes to Todoist's fixed host through `internal/outbound` (no private networks, no redirects), 60 s, at most the import size limit, 10 an hour per account; demo instances refuse it.
- **Comments** of a task join the end of its notes (also for a JSON backup in the same shape), instead of being dropped with a warning.
- Completed tasks are not part of Todoist's sync answer and are not imported this way.

## Capabilities

### Modified Capabilities

- `data-import`: a Todoist API token as a source.

## Impact

`internal/importer/todoistapi.go`, `internal/importer/profile_json.go` (comments), `internal/httpapi/import_todoist.go` (`POST /api/v1/import/todoist`, `signedIn.FullTokens().DemoDenied()`), the import screen, strings, docs (`docs/import.md`, `docs/api.md`). No new dependency, no stored secret.
