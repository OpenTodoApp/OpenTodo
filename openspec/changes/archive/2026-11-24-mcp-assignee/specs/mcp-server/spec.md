## MODIFIED Requirements

### Requirement: Write tools
When allowed, `tools/list` SHALL add `create_tasks`, `update_tasks`, `complete_tasks`, `reopen_tasks`, `move_tasks`, `schedule_tasks`, `create_project`, `update_project`, `archive_projects`, `set_favourite`, `create_sections`, `update_sections`, `reorder_sections`, `create_label`, `update_labels`, `add_comment`, `add_reminders`, `update_reminders`, `remove_reminders`, `start_timer`, `stop_timer`, `log_time`, `update_time_entries`, `log_habit` and `trash_tasks`. No tool SHALL purge or delete projects, sections, labels, custom field definitions or time entries, define custom fields, or change sharing, members, tokens, settings, webhooks, backups or imports. A task's assignee SHALL be set only as "Assignee in write tools" says. `trash_tasks` SHALL accept only tasks created by the same token. `update_project` SHALL accept a project `id` and any of `name`, `color` (`#rrggbb`), `icon` (a name from the icon catalogue, or null for none), `parent_id` (a project id or null, refused when it would make a project its own ancestor), `position`, and the note as described in "Project note in write tools"; it SHALL NOT accept `archived` or `deleted`, which only `archive_projects` (archive) and no tool (delete) change. `set_favourite` SHALL add a project to the user's Favourites, at the end, or remove it, keeping the order of the other entries. `create_sections` SHALL create sections in one project with a `name` and optional `color`, `icon` and `position`; `update_sections` SHALL change a section's `name`, `color`, `icon` or `position`; `reorder_sections` SHALL give the listed sections of one project positions in the given order, before any section it does not list. Results reflect synced data; changes are written as operations, work for devices that are offline (they apply on their next sync) and converge with offline device edits by last-writer-wins per field.

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

## ADDED Requirements

### Requirement: Assignee in write tools
`create_tasks` items and `update_tasks` updates SHALL accept `assignee`: a person named by account id, email or name (email and name ignoring case), or `me` for the user, or `null` to unassign. It SHALL be resolved only among the people the task can be assigned to under `task-assignment` "Assignee field": the current members of the task's shared project, or the user alone for a task in the Inbox or an unshared project. A person outside that set, or a name two members share, SHALL be refused with a JSON-RPC `-32602` error naming `assignee`, and nothing in the call SHALL be written. A viewer SHALL be refused with the tool error `forbidden`, as for any change they cannot make (`task-assignment` "Assignment permissions"). The assignment SHALL be written as the ordinary `assignee_id` operation, checked again by the sync path at receipt like a REST or device write, so it notifies the assignee, works for devices that are offline (they apply it on their next sync) and converges with offline device edits by last-writer-wins.

#### Scenario: Assign by name
- **WHEN** an allowed assistant calls `update_tasks` on a task of the shared project "House" with `assignee: "sam rivera"`, and Sam Rivera is a member
- **THEN** the task is assigned to Sam on every member's devices after sync and Sam is notified

#### Scenario: Create assigned
- **WHEN** an allowed assistant calls `create_tasks` with an item in "House" and `assignee: "sam@example.com"`
- **THEN** the new task is assigned to Sam

#### Scenario: Unassign
- **WHEN** an allowed assistant calls `update_tasks` with `assignee: null` on a task assigned to Sam
- **THEN** the task is unassigned on every member's devices after sync

#### Scenario: Someone outside the project
- **WHEN** an allowed assistant calls `update_tasks` with `assignee` naming an account that is not a member of the task's project, by id or by email
- **THEN** the response is a JSON-RPC `-32602` error naming `assignee` and the task keeps its assignee

#### Scenario: Viewer
- **WHEN** an assistant connected by a viewer of "House" calls `update_tasks` with an `assignee` on one of its tasks
- **THEN** the result is the tool error `forbidden` and nothing changes

#### Scenario: Personal task
- **WHEN** an allowed assistant sets `assignee` on an Inbox task to another account
- **THEN** the response is a JSON-RPC `-32602` error naming `assignee`, and `assignee: "me"` assigns it to the user
