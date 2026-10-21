## MODIFIED Requirements

### Requirement: Read-only tools
`tools/list` SHALL always advertise `list_projects`, `list_tasks`, `get_task`, `search_tasks`, `today_summary` and `list_time_entries` with argument schemas and a read-only annotation, and SHALL add write tools only as the write permission gate allows. Read tools SHALL filter as before, return structured JSON, exclude deleted entities, cover only the token's user, write nothing, and reflect only data devices have synced. Task results SHALL carry `tracked_minutes` (every member's live entries, a running one to the server time). `list_time_entries` SHALL take `task_id`, `from`, `to`, `running` and `limit`, return the entries the user can read with `task_id`, `user_id`, `started_at`, `ended_at`, `minutes` and `note` (the note marked as untrusted text, "[encrypted]" when it is ciphertext), and offer a cursor for more. No tool SHALL start, stop or edit an entry. The `inbox` view of `list_tasks` and the Inbox count of `today_summary` SHALL use the Inbox rule of OpenSpec `project-organization` (no project and not scheduled), and the tool descriptions SHALL say so.

#### Scenario: Today's tasks
- **WHEN** an assistant calls `list_tasks` with `view: "today"` and a `timezone`
- **THEN** the result lists open tasks due today or overdue in that time zone, each with id, title, project name, priority, due and labels, ordered overdue first

#### Scenario: Search
- **WHEN** an assistant calls `search_tasks` with `query: "dentist"`
- **THEN** the result lists non-deleted tasks whose title or description contains "dentist", with a `next_cursor` when more than `limit` match

#### Scenario: Invalid arguments
- **WHEN** `get_task` is called without `id` or `list_tasks` with `priority: 7`
- **THEN** the response is a JSON-RPC `-32602` error naming the argument

#### Scenario: Unsynced edits are not visible
- **WHEN** a device has created a task offline that has not synced yet
- **THEN** the tools do not return it until the device syncs, and the result carries the server time so the assistant can state how fresh the data is

#### Scenario: Read token sees only read tools
- **WHEN** a client with a `read` token calls `tools/list` while the owner and the user have allowed assistant writes
- **THEN** exactly the five read tools are listed

#### Scenario: Entries of a week
- **WHEN** an assistant calls `list_time_entries` with `from: "2026-10-12"`, `to: "2026-10-18"` and a `timezone`
- **THEN** the result lists the user's readable entries that started in those local days, each with its minutes and the task's title, and the server time

#### Scenario: No write tool for entries
- **WHEN** an `agent` token with every write switch on calls `tools/list`
- **THEN** no tool that starts, stops or edits a time entry is listed, and `tools/call` for such a name is refused like every unknown tool (JSON-RPC `-32602`)

#### Scenario: Inbox view leaves out planned tasks
- **WHEN** an assistant calls `list_tasks` with `view: "inbox"` while the user has an undated task and a task due tomorrow, both without a project
- **THEN** only the undated task is returned, and `today_summary` counts one Inbox task

### Requirement: Resources
`resources/list` SHALL expose `opentodo://projects` and `opentodo://views/{inbox|today|upcoming}`; `resources/templates/list` SHALL expose `opentodo://projects/{id}` and `opentodo://tasks/{id}`. `resources/read` SHALL return `application/json` content built from the same materialised reads as the tools, with the same exclusions; `opentodo://views/inbox` SHALL hold the Inbox tasks of OpenSpec `project-organization`. Reading a resource of another user or a deleted entity SHALL return a JSON-RPC `-32002` resource-not-found error.

#### Scenario: Read a project resource
- **WHEN** an assistant reads `opentodo://projects/<id>` for one of the user's projects
- **THEN** the content is the project with its open tasks as JSON

#### Scenario: Foreign or deleted entity
- **WHEN** an assistant reads `opentodo://tasks/<id>` for a task that is deleted or belongs to another user
- **THEN** the response is a `-32002` error that does not distinguish the two cases
