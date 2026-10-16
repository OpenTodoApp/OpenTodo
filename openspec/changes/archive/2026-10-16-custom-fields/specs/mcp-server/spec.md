# Spec Delta

## MODIFIED Requirements

### Requirement: Read-only tools
`tools/list` SHALL always advertise `list_projects`, `list_tasks`, `get_task`, `search_tasks` and `today_summary` with argument schemas and a read-only annotation, and SHALL add write tools only as the write permission gate allows. Read tools SHALL filter as before, return structured JSON, exclude deleted entities, cover only the token's user, write nothing, and reflect only data devices have synced. Projects SHALL list their live custom field definitions and tasks SHALL carry their `fields` values (OpenSpec `custom-fields`), with names and string values marked untrusted like every user text.

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

#### Scenario: Fields in results
- **WHEN** an assistant calls `list_projects` and then `get_task` on a task of "Kitchen", which defines Cost (number) and Client (choice)
- **THEN** the project carries the two definitions with id, type, options and an untrusted name, and the task carries `fields` keyed by those ids, its Client string marked untrusted

### Requirement: Write tools
When allowed, `tools/list` SHALL add `create_tasks`, `update_tasks`, `complete_tasks`, `reopen_tasks`, `move_tasks`, `schedule_tasks`, `create_project`, `create_label`, `add_comment` and `trash_tasks`. `create_tasks` and `update_tasks` SHALL accept a `fields` object keyed by definition id, validated against the task's project definitions (OpenSpec `custom-fields`). No tool SHALL define or delete custom fields, purge, archive or delete projects, assign people, or change sharing, members, tokens, settings, webhooks, backups or imports. `trash_tasks` SHALL accept only tasks created by the same token. Results reflect synced data; changes converge with offline device edits by last-writer-wins.

#### Scenario: Create tasks
- **WHEN** an allowed assistant calls `create_tasks` with two items for project "Garden", one due tomorrow with priority 2
- **THEN** both tasks exist in "Garden" with those fields and the result lists their ids

#### Scenario: Reschedule overdue tasks
- **WHEN** an allowed assistant calls `schedule_tasks` with three overdue task ids and `due: {"date": "2026-10-16"}`
- **THEN** the three tasks are due on 2026-10-16 and any time of day they had is kept unless `time` is given

#### Scenario: Complete a recurring task
- **WHEN** an allowed assistant completes the current occurrence of a weekly task
- **THEN** the series advances exactly as a REST completion does, and a device completing the same occurrence offline converges to one completion

#### Scenario: Trash only its own creations
- **WHEN** an assistant calls `trash_tasks` with one task it created and one the user created in the web app
- **THEN** nothing is changed and the result is a tool error `not_permitted` naming the user-created task

#### Scenario: No mention notifications from assistants
- **WHEN** an assistant calls `add_comment` with a body containing `@bob` on a shared task
- **THEN** the comment is stored and Bob receives no mention notification

#### Scenario: Unknown or foreign target
- **WHEN** an assistant calls `update_tasks` with a task id that is deleted or belongs to another account
- **THEN** the result is a tool error `not_found` that does not distinguish the two and nothing changes

#### Scenario: Set a field value
- **WHEN** an allowed assistant calls `update_tasks` with `fields: {"<cost-id>": 120}` on a task of the project that defines Cost as a number
- **THEN** the task holds Cost 120 after the change set is applied, as one operation for that field

#### Scenario: Value of the wrong type
- **WHEN** an allowed assistant calls `update_tasks` with `fields: {"<cost-id>": "cheap"}`
- **THEN** the response is a JSON-RPC `-32602` error naming the field and its type and nothing changes
