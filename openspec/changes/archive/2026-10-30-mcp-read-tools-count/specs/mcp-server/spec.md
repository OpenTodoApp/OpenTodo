## MODIFIED Requirements

### Requirement: Read-only tools
`tools/list` SHALL always advertise every read tool of the registry with its argument schema and a read-only annotation (at the time of writing `list_projects`, `list_tasks`, `get_task`, `search_tasks`, `today_summary`, `list_time_entries`, `list_icons`, `list_workspaces` and `list_frames`; a change that adds a read tool adds it to this list), and SHALL add write tools only as the write permission gate allows. Read tools SHALL filter as before, return structured JSON, exclude deleted entities, cover only the token's user, write nothing, and reflect only data devices have synced. Task results SHALL carry `tracked_minutes` (every member's live entries, a running one to the server time). `list_time_entries` SHALL take `task_id`, `from`, `to`, `running` and `limit`, return the entries the user can read with `task_id`, `user_id`, `started_at`, `ended_at`, `minutes` and `note` (the note marked as untrusted text, "[encrypted]" when it is ciphertext), and offer a cursor for more. No tool SHALL start, stop or edit an entry. The `inbox` view of `list_tasks` and the Inbox count of `today_summary` SHALL use the Inbox rule of OpenSpec `project-organization` (no project and not scheduled), and the tool descriptions SHALL say so.

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
- **THEN** exactly the read tools are listed, each with a read-only annotation, and no write tool

#### Scenario: Entries of a week
- **WHEN** an assistant calls `list_time_entries` with `from: "2026-10-12"`, `to: "2026-10-18"` and a `timezone`
- **THEN** the result lists the user's readable entries that started in those local days, each with its minutes and the task's title, and the server time

#### Scenario: No write tool for entries
- **WHEN** an `agent` token with every write switch on calls `tools/list`
- **THEN** no tool that starts, stops or edits a time entry is listed, and `tools/call` for such a name is refused like every unknown tool (JSON-RPC `-32602`)

#### Scenario: Inbox view leaves out planned tasks
- **WHEN** an assistant calls `list_tasks` with `view: "inbox"` while the user has an undated task and a task due tomorrow, both without a project
- **THEN** only the undated task is returned, and `today_summary` counts one Inbox task

### Requirement: Write permission gate
A write tool SHALL run only when MCP is enabled, the owner allowed assistant writes, the token's user switched on "Allow AI assistants to make changes", and the token's scope is `agent`. Otherwise `tools/list` SHALL omit write tools and `tools/call` of one SHALL return a tool error naming the missing condition (`writes_disabled_by_owner`, `writes_disabled_by_user` or `token_scope`) and change nothing. Switches are server state, not ops, read on every request.

#### Scenario: All conditions met
- **WHEN** the owner and the user allowed writes and a client with an `agent` token calls `tools/list`
- **THEN** every read tool and every write tool are listed, write tools with `readOnlyHint: false`

#### Scenario: Full token stays read-only on MCP
- **WHEN** both switches are on and a client with a `full` token calls `complete_tasks`
- **THEN** the result is a tool error `token_scope` and the task stays open

#### Scenario: User switch off
- **WHEN** the owner allowed writes, the user's switch is off and an `agent` token calls `create_tasks`
- **THEN** the result is a tool error `writes_disabled_by_user` and no task is created

#### Scenario: Owner switch turned off later
- **WHEN** an assistant created tasks and the owner then turns assistant writes off
- **THEN** the next `tools/list` omits write tools and a further write call returns `writes_disabled_by_owner`

#### Scenario: Demo instance
- **WHEN** a client calls `/mcp` on a demo instance with any token
- **THEN** the response is 403 `demo_restricted` before the token is evaluated
