## ADDED Requirements

### Requirement: Import from Todoist with an API token
The import screen SHALL offer, with Switch from: Todoist, a field for a Todoist API token. `POST /api/v1/import/todoist` with `{token}` SHALL make one request to Todoist's sync endpoint for the projects, sections, labels, tasks and comments, through the outbound policy without private-network targets or redirects, and answer Todoist's JSON, which the import previews and runs like an uploaded `json-items` file with the same options, limits and Undo. The token SHALL be used for that request only and never stored or logged. A token Todoist refuses SHALL answer 400 `invalid_token`, an answer over the import limit 413 `too_large`, an unreachable Todoist 502 `upstream_failed`, more than 10 requests an hour 429 `rate_limited`; demo instances and `read` or `agent` tokens SHALL be refused. A task's comments SHALL join the end of its notes.

#### Scenario: A free Todoist account
- **WHEN** a person without Todoist Premium pastes their API token and chooses Fetch from Todoist
- **THEN** the preview shows their projects, sections, labels and tasks with repeats, priorities and comments in the notes, and starting the import creates them with Undo, and the token is stored nowhere

#### Scenario: A wrong token
- **WHEN** the token is mistyped
- **THEN** the screen says Todoist did not accept it, and nothing is imported
