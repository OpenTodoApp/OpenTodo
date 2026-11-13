## ADDED Requirements

### Requirement: Habit tools
`list_habits` SHALL return the user's open habits (and graduated ones with `include_graduated`), each with id, title and anchor as untrusted text, rule, part of the day, the current occurrence date, `kept` and `kept_of`, `strength`, `streak`, `best_streak`, `at_risk`, `back_on_track`, `graduated_at` and the server time. `get_habit` SHALL take an `id` and an optional `from` and `to` (local days, at most 400 days apart, the last 31 by default) and return the same fields plus each scheduled day in the range with its state (done, tiny, skipped, missed, pending, upcoming) and its check-in note as untrusted text. The numbers SHALL be those of "Habit numbers on the server" (OpenSpec `habits`). `log_habit` SHALL take `id`, `date` (a local day, today in `timezone` by default), `state` (`done`, `tiny`, `skipped` or `clear`) and an optional `note`, and SHALL write or tombstone that date's occurrence record exactly as the app does: today's date or the current occurrence completes or skips it and moves the series, an earlier scheduled date writes its record without moving the series, a date after today is refused. `create_tasks` and `update_tasks` SHALL accept `habit`, `habit_tiny` and `habit_anchor`, refusing `habit: true` on a task without a calendar rule. All of them SHALL follow the write permission gate, write limits, untrusted-text marking and project exclusions of every other tool; a habit in a project kept away from assistants SHALL not be listed or written.

#### Scenario: How is running going
- **WHEN** an assistant calls `get_habit` for Run with the default range
- **THEN** the result lists the last 31 days with their states and notes, and `strength`, `kept` and the streaks equal what the user's devices show after sync

#### Scenario: Log yesterday
- **WHEN** an allowed assistant calls `log_habit` with Run, yesterday's date, `state: "done"` and `note: "5k"`
- **THEN** yesterday's record is done with that note, the series keeps its due date, and the user's devices show it after sync

#### Scenario: Skip today
- **WHEN** an allowed assistant calls `log_habit` with Read, today and `state: "skipped"`
- **THEN** today's record is skipped and the series moves to its next date, as the app's Skip does

#### Scenario: A future day
- **WHEN** `log_habit` is called with tomorrow's date
- **THEN** the result is a tool error `invalid_input` naming `date`, and nothing is written

#### Scenario: Not a habit
- **WHEN** `log_habit` is called with the id of a task that is not a habit
- **THEN** the result is a tool error `not_a_habit` and nothing is written

#### Scenario: Without write access
- **WHEN** a `read` token, or an `agent` token while the user's "Allow AI assistants to make changes" is off, calls `log_habit`
- **THEN** the call is refused as every write tool is, and nothing is written

#### Scenario: Encrypted account
- **WHEN** an assistant calls `get_habit` on an end-to-end encrypted account with no opted-in device online
- **THEN** the numbers and day states are returned, and the title and notes read "[encrypted]"

## MODIFIED Requirements

### Requirement: Read-only tools
`tools/list` SHALL always advertise every read tool of the registry with its argument schema and a read-only annotation (at the time of writing `list_projects`, `list_tasks`, `get_task`, `search_tasks`, `today_summary`, `list_time_entries`, `list_icons`, `list_workspaces`, `list_frames`, `list_notes`, `search_notes`, `get_note`, `list_habits` and `get_habit`; a change that adds a read tool adds it to this list), and SHALL add write tools only as the write permission gate allows. Read tools SHALL filter as before, return structured JSON, exclude deleted entities, cover only the token's user, write nothing, and reflect only data devices have synced. Task results SHALL carry `tracked_minutes` (every member's live entries, a running one to the server time). `list_time_entries` SHALL take `task_id`, `from`, `to`, `running` and `limit`, return the entries the user can read with `task_id`, `user_id`, `started_at`, `ended_at`, `minutes` and `note` (the note marked as untrusted text, "[encrypted]" when it is ciphertext), and offer a cursor for more. No tool SHALL start, stop or edit an entry. The `inbox` view of `list_tasks` and the Inbox count of `today_summary` SHALL use the Inbox rule of OpenSpec `project-organization` (no project and not scheduled), and the tool descriptions SHALL say so.

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

#### Scenario: No tool deletes entries
- **WHEN** an `agent` token with every write switch on calls `tools/list`
- **THEN** the time entry write tools of "Time entry write tools" are listed, no tool that deletes a time entry is, and `tools/call` for such a name is refused like every unknown tool (JSON-RPC `-32602`)

#### Scenario: Inbox view leaves out planned tasks
- **WHEN** an assistant calls `list_tasks` with `view: "inbox"` while the user has an undated task and a task due tomorrow, both without a project
- **THEN** only the undated task is returned, and `today_summary` counts one Inbox task

#### Scenario: Habits are read tools
- **WHEN** a client with a `read` token calls `tools/list`
- **THEN** `list_habits` and `get_habit` are listed with a read-only annotation and `log_habit` is not

### Requirement: Write tools
When allowed, `tools/list` SHALL add `create_tasks`, `update_tasks`, `complete_tasks`, `reopen_tasks`, `move_tasks`, `schedule_tasks`, `create_project`, `update_project`, `archive_projects`, `set_favourite`, `create_sections`, `update_sections`, `reorder_sections`, `create_label`, `update_labels`, `add_comment`, `add_reminders`, `update_reminders`, `remove_reminders`, `start_timer`, `stop_timer`, `log_time`, `update_time_entries`, `log_habit` and `trash_tasks`. No tool SHALL purge or delete projects, sections, labels, custom field definitions or time entries, define custom fields, assign people, or change sharing, members, tokens, settings, webhooks, backups or imports. `trash_tasks` SHALL accept only tasks created by the same token. `update_project` SHALL accept a project `id` and any of `name`, `color` (`#rrggbb`), `icon` (a name from the icon catalogue, or null for none), `parent_id` (a project id or null, refused when it would make a project its own ancestor), `position`, and the note as described in "Project note in write tools"; it SHALL NOT accept `archived` or `deleted`, which only `archive_projects` (archive) and no tool (delete) change. `set_favourite` SHALL add a project to the user's Favourites, at the end, or remove it, keeping the order of the other entries. `create_sections` SHALL create sections in one project with a `name` and optional `color`, `icon` and `position`; `update_sections` SHALL change a section's `name`, `color`, `icon` or `position`; `reorder_sections` SHALL give the listed sections of one project positions in the given order, before any section it does not list. Results reflect synced data; changes are written as operations, work for devices that are offline (they apply on their next sync) and converge with offline device edits by last-writer-wins per field.

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

#### Scenario: Recolour and give an icon
- **WHEN** an allowed assistant calls `update_project` with the id of "Garden", `color: "#16A34A"` and `icon: "sprout"`
- **THEN** "Garden" shows a green sprout in the sidebar of every device after sync, and a phone that renamed "Garden" offline at the same time keeps its new name next to the new colour and icon

#### Scenario: Icon outside the catalogue
- **WHEN** an assistant calls `update_project` with `icon: "unicorn-rainbow"`, which is not in the catalogue
- **THEN** the response is a JSON-RPC `-32602` error naming `icon` and nothing is written

#### Scenario: Move under another project
- **WHEN** an assistant calls `update_project` to set the `parent_id` of "Home" to the id of its own child "Kitchen"
- **THEN** the result is a tool error `invalid` explaining the cycle and nothing changes

#### Scenario: Pin to Favourites
- **WHEN** an allowed assistant calls `set_favourite` with `kind: "project"`, the id of "Garden" and `favourite: true` while Favourites already lists two views
- **THEN** Favourites lists the two views and then "Garden", and calling it again changes nothing

#### Scenario: Set up sections
- **WHEN** an allowed assistant calls `create_sections` for "Garden" with "To buy", "To plant" (icon `shovel`) and "Done", then `reorder_sections` with "Done", "To buy", "To plant"
- **THEN** the project shows the three sections in that order, "To plant" with its icon, and the sections keep any tasks devices moved into them meanwhile

#### Scenario: No archive or delete
- **WHEN** an assistant calls `update_project` with `archived: true` or `deleted: true`
- **THEN** the response is a JSON-RPC `-32602` error naming the unexpected argument and nothing is written

#### Scenario: New tools hidden without write permission
- **WHEN** a `read` token, or an `agent` token whose user switched writes off, lists the tools
- **THEN** none of `archive_projects`, `update_labels`, `add_reminders`, `update_reminders`, `remove_reminders`, `start_timer`, `stop_timer`, `log_time` or `update_time_entries` is listed, and calling one is refused like any write tool

#### Scenario: Habit logging is a write tool
- **WHEN** an `agent` token with every write switch on calls `tools/list`
- **THEN** `log_habit` is listed with the other write tools
