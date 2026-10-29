## MODIFIED Requirements

### Requirement: Write tools
When allowed, `tools/list` SHALL add `create_tasks`, `update_tasks`, `complete_tasks`, `reopen_tasks`, `move_tasks`, `schedule_tasks`, `create_project`, `update_project`, `archive_projects`, `set_favourite`, `create_sections`, `update_sections`, `reorder_sections`, `create_label`, `update_labels`, `add_comment`, `add_reminders`, `update_reminders`, `remove_reminders`, `start_timer`, `stop_timer`, `log_time`, `update_time_entries` and `trash_tasks`. No tool SHALL purge or delete projects, sections, labels, custom field definitions or time entries, define custom fields, assign people, or change sharing, members, tokens, settings, webhooks, backups or imports. `trash_tasks` SHALL accept only tasks created by the same token. `update_project` SHALL accept a project `id` and any of `name`, `color` (`#rrggbb`), `icon` (a name from the icon catalogue, or null for none), `parent_id` (a project id or null, refused when it would make a project its own ancestor), `position`, and the note as described in "Project note in write tools"; it SHALL NOT accept `archived` or `deleted`, which only `archive_projects` (archive) and no tool (delete) change. `set_favourite` SHALL add a project to the user's Favourites, at the end, or remove it, keeping the order of the other entries. `create_sections` SHALL create sections in one project with a `name` and optional `color`, `icon` and `position`; `update_sections` SHALL change a section's `name`, `color`, `icon` or `position`; `reorder_sections` SHALL give the listed sections of one project positions in the given order, before any section it does not list. Results reflect synced data; changes are written as operations, work for devices that are offline (they apply on their next sync) and converge with offline device edits by last-writer-wins per field.

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

## ADDED Requirements

### Requirement: Reminder write tools
`add_reminders` SHALL create reminders for the caller on tasks the caller can read, each with `kind` `relative` (`offset_minutes` ≤ 0 before the due time, 0 meaning at the due time), `deadline` (`offset_minutes` ≤ 0 before 09:00 on the deadline day) or `absolute` (`at`: a date, a time and an optional IANA time zone, the user's time zone otherwise). The server SHALL compute `fire_at` exactly as `POST /api/v1/reminders` does, in the user's time zone, and leave it empty while the task has no due date (relative) or deadline (deadline). `update_reminders` SHALL change `offset_minutes` or `at` of the caller's reminders, never their kind; `remove_reminders` SHALL tombstone the caller's reminders. Reminders are personal: another user's reminder SHALL be `not_found`, a viewer of a shared project MAY set reminders for themselves, and no other member sees them. A task SHALL hold at most 10 live reminders after a call of these tools, otherwise the call is the tool error `invalid` and nothing changes. The reminders SHALL be written as operations and converge with offline device edits per field.

#### Scenario: Alert for a time block
- **WHEN** an allowed assistant calls `add_reminders` with `{task_id: <block at 10:00>, kind: "relative", offset_minutes: 0}` for a user in Europe/Rome
- **THEN** the reminder fires at 10:00 Rome time on every device of the user after sync, and history shows it added by "AI assistant (<token name>)"

#### Scenario: Due date moved after the reminder
- **WHEN** the person later moves that block to 11:30 on the phone while offline, and the phone syncs
- **THEN** the reminder fires at 11:30, because relative reminders follow the due time

#### Scenario: Absolute moment on an undated task
- **WHEN** an allowed assistant adds `{kind: "absolute", at: {date: "2026-11-02", time: "08:15"}}` to a task without a due date
- **THEN** the reminder fires at 08:15 on 2026-11-02 in the user's time zone

#### Scenario: Another user's reminder
- **WHEN** an assistant calls `update_reminders` with the id of a reminder another member set on a shared task
- **THEN** the result is the tool error `not_found` and nothing changes

#### Scenario: Too many reminders
- **WHEN** a task has 10 live reminders and an assistant adds one more
- **THEN** the result is the tool error `invalid` and no reminder is created

#### Scenario: Removed while a device edits it offline
- **WHEN** an assistant removes a reminder while the phone, offline, changes its offset, and the phone then syncs
- **THEN** every device shows the reminder removed, because the deletion time is a tombstone field

### Requirement: Reminders in task details
`get_task` and `opentodo://tasks/{id}` SHALL return the caller's own live reminders of the task as `reminders: [{id, kind, offset_minutes, fire_at, dismissed}]`, and never another user's reminders.

#### Scenario: Reading reminders
- **WHEN** a task carries two reminders of the caller and one of another member, and an assistant calls `get_task`
- **THEN** `reminders` lists the caller's two with their firing times and not the other member's

### Requirement: Project note in write tools
`update_project` SHALL accept `description` (the whole Markdown note) or `append_description` (Markdown added after a blank line to the end of the current note), not both in one update, under the length limits of `rich-text-editing`. The tools SHALL write `description` only and never `notes_doc`; devices fold it into the note's document by the rules of `project-notes`. Owners, admins and editors MAY write the note; a viewer SHALL get the tool error `forbidden`.

#### Scenario: Keep a client's note current
- **WHEN** an allowed assistant calls `update_project` with `append_description: "## 2026-10-29\nCall notes: budget approved."` on "Client X", an editor role
- **THEN** the note ends with that block on every device after sync and the earlier content is unchanged

#### Scenario: Note edited on a device at the same time
- **WHEN** the person adds a paragraph to the note on the laptop while offline and the assistant appends its block, and the laptop syncs
- **THEN** every device converges on the same note under the `project-notes` merge rules, and neither write is lost silently: history lists both

#### Scenario: Viewer
- **WHEN** the token's user is a viewer of the shared project and the assistant writes its `description`
- **THEN** the result is the tool error `forbidden` and nothing changes

### Requirement: Archive tool
`archive_projects` SHALL take one project `id` and `archived`. `true` SHALL archive the project and every descendant, one operation per project, as `project-organization` "Archive a project" requires; `false` SHALL unarchive that project alone. Only the project's owner or an admin MAY call it (`forbidden` otherwise). The call SHALL count each project written against the write limits.

#### Scenario: Archive a finished client
- **WHEN** an allowed assistant calls `archive_projects` with "Client X", which has two sub-projects, and `archived: true`
- **THEN** the three projects are archived on every device after sync, a `project.archived` webhook event is derived for each, and the call counted 3 against the daily limit

#### Scenario: Unarchive
- **WHEN** the assistant calls `archive_projects` with "Client X" and `archived: false`
- **THEN** "Client X" is back in the sidebar and its sub-projects stay archived

#### Scenario: Editor tries to archive
- **WHEN** the token's user is an editor of the shared project
- **THEN** the result is the tool error `forbidden` and nothing changes

### Requirement: Label write tool
`update_labels` SHALL change the `name`, `color` or `position` of the caller's labels, each as an operation on the label alone and none on tasks. A name equal, ignoring case, to another live label of the same workspace SHALL be the tool error `invalid`. No tool SHALL delete or merge labels.

#### Scenario: Rename a label
- **WHEN** an allowed assistant renames "errand" to "errands" while 40 tasks carry it
- **THEN** every device shows "errands" on the 40 tasks after sync and one operation was written

#### Scenario: Name taken
- **WHEN** the assistant renames "home" to "Errands" while "errands" exists in the same workspace
- **THEN** the result is the tool error `invalid` naming the existing label and nothing changes

### Requirement: Time entry write tools
`start_timer` SHALL start a running time entry on a task for the token's user with device `agent:<token-id>`. When another entry of the user runs, it SHALL be refused with the tool error `timer_running` (naming the running entry's task when the caller may read it) unless the call carries `stop_running: true`, in which case the running entry ends at the new start in the same batch. `stop_timer` SHALL stop the user's running entry, or answer `not_found`. `log_time` SHALL write closed entries whose end is after the start, at most 24 hours long and not in the future. `update_time_entries` SHALL change `started_at`, `ended_at` or `note` of entries the same token created and SHALL refuse others with `not_permitted`. No tool SHALL delete an entry. Viewers of a shared project SHALL get `forbidden`. The entries SHALL converge with device edits under `time-tracking` "One running entry per user".

#### Scenario: Log a Pomodoro worked beside the person
- **WHEN** an allowed assistant calls `log_time` with a 25 minute entry on "Write the report" from 09:00 to 09:25
- **THEN** the task's Time tab shows the entry on every device after sync, labelled as added by the AI assistant

#### Scenario: The person's timer is running
- **WHEN** the person runs a Focus session on task A and an assistant calls `start_timer` for task B without `stop_running`
- **THEN** the result is the tool error `timer_running` naming task A and the person's entry keeps running

#### Scenario: Explicit takeover
- **WHEN** the assistant calls `start_timer` for task B with `stop_running: true`
- **THEN** A's entry ends at B's start, B's entry runs, and the Focus screen on the person's device shows the session as stopped elsewhere after sync

#### Scenario: Editing the person's entry
- **WHEN** an assistant calls `update_time_entries` on an entry the person tracked in the app
- **THEN** the result is the tool error `not_permitted` and the entry is unchanged

#### Scenario: Invalid range
- **WHEN** an assistant calls `log_time` with an end before the start or a 30 hour entry
- **THEN** the response is a `-32602` error naming the fields and nothing is written

### Requirement: Encrypted accounts and the completed tool set
For an account with end-to-end encryption, the new content arguments (`update_project` `description`, `update_labels` `name`, `log_time` and `update_time_entries` `note`) SHALL follow "Encrypted accounts and write tools": ciphertext envelopes only without an opted-in device, plain text through an opted-in device. `append_description` SHALL work only through an opted-in device, which appends to the decrypted note and encrypts the result, and SHALL be the tool error `encryption_enabled` otherwise. Reminders, archiving, timers without a note, and label colours and positions carry no content and SHALL work for encrypted accounts.

#### Scenario: Append without a device
- **WHEN** an allowed assistant of an encrypted account with no opted-in device calls `update_project` with `append_description`
- **THEN** the result is the tool error `encryption_enabled` and nothing changes

#### Scenario: Reminder on an encrypted account
- **WHEN** the same assistant calls `add_reminders` on a task with an encrypted title
- **THEN** the reminder is created and fires on the user's devices, whose notification reads the generic text or the decrypted title as the device decides
