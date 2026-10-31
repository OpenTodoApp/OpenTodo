# Spec Delta

## ADDED Requirements

### Requirement: Default reminder preferences
The account SHALL have two synced default reminder preferences in Settings → Notifications, "Tasks with a time" and "Tasks with no time", each either none (the default) or an offset in minutes relative to the due time within the reminder offset limit. "Tasks with a time" SHALL offer None, At the due time, 10 minutes before, 30 minutes before, 1 hour before, 1 day before and Custom; "Tasks with no time" SHALL offer None, On the day at 09:00, 1 day before, 2 days before, 3 days before, 1 week before and Custom, all counted from 09:00 local on the due date. A stored value that is empty, malformed or outside the limit SHALL read as none and SHALL be kept. The preferences SHALL be written as operations, work offline, reach the user's other devices and converge by last-writer-wins; they are settings, not content, and are never encrypted. Changing a preference SHALL NOT change reminders that already exist.

#### Scenario: Set a default on the laptop
- **WHEN** the user sets "Tasks with a time" to "30 minutes before" on the laptop and the phone syncs
- **THEN** the phone's Settings shows "30 minutes before" and the phone applies it to the next task it schedules

#### Scenario: Default is none
- **WHEN** an account that never opened the card schedules a task at 15:00
- **THEN** no reminder is added

#### Scenario: Changing the preference leaves reminders alone
- **WHEN** a task already has a default reminder "30 minutes before" and the user changes the default to "1 hour before"
- **THEN** the task's reminder still fires 30 minutes before

### Requirement: Default reminder when a task gets a due date
When a write by a person gives a task that had no due date a due date, including creating a task with a due date, and that person's default for that kind of due is set, the writing device or server SHALL add one relative reminder with the default offset to the same batch, with its firing time computed from the new due like any relative reminder, unless the task is completed, deleted or a habit, the task already has a live relative reminder, the same write adds one (for example a quick-add reminder phrase), or the task's default reminder already exists, live or deleted by the person. The default reminder's id SHALL be derived from the person's id and the task's id, so it is created at most once per person and task. Moving a due date from one day to another SHALL NOT add a reminder. Undo, redo, restoring a version or restoring from the Trash SHALL NOT add one; Undo of the write that added it SHALL remove it, and a later due date MAY add it again. The reminder SHALL be an ordinary reminder of the writing person: shown and removable in the task's Reminders, delivered in the app, by push and by the native shells, served to calendar clients as an alarm, applied locally first so it works offline, uploaded with the due change in one batch, and converging like any reminder. Two devices that give the same task a due date offline SHALL end with one default reminder.

#### Scenario: Schedule an undated task
- **WHEN** "Tasks with a time" is "30 minutes before" and the user sets an undated task to tomorrow at 15:00
- **THEN** the task gets a reminder "30 minutes before" that fires tomorrow at 14:30, shown in its Reminders and pushed at 14:30

#### Scenario: Date-only task
- **WHEN** "Tasks with no time" is "1 day before" and the user captures "Pay rent friday" in quick add
- **THEN** the task is due Friday and has a reminder that fires on Thursday at 09:00

#### Scenario: Quick-add reminder wins
- **WHEN** a default is set and the user captures "Call Anna tomorrow 10am remind me 5 min before"
- **THEN** the task has only the 5-minutes-before reminder

#### Scenario: Rescheduling adds nothing
- **WHEN** a task due Monday with its default reminder is moved to Wednesday
- **THEN** the same reminder now fires relative to Wednesday and no second reminder is added

#### Scenario: Deleted default stays deleted
- **WHEN** the user deletes a task's default reminder, clears the due date and later sets a new one
- **THEN** no reminder is added

#### Scenario: Offline on two devices
- **WHEN** the phone and the laptop each schedule the same undated task offline and both sync
- **THEN** the task has exactly one default reminder on every device, with the firing time of the due date that won

#### Scenario: Shared project
- **WHEN** a member with a default set schedules an undated task of a shared project
- **THEN** that member gets a default reminder on it, and the other members get none from that write

#### Scenario: Undo removes it
- **WHEN** the user sets a date on an undated task, which adds a default reminder, and chooses Undo
- **THEN** the task has no due date and the default reminder is removed in the same step, and setting a date again adds it again

#### Scenario: Habits get none
- **WHEN** a default is set and the user schedules a habit
- **THEN** no reminder is added

### Requirement: Default reminder follows the kind of due
When a write changes a task's due between a date only and a date with a time, and the task's default reminder is live, relative, and still has the offset of the person's default for the old kind, its offset SHALL become the person's default for the new kind and its firing time SHALL be recomputed in the same batch; if the new kind has no default, or the person changed the reminder, it SHALL be left as it is. Clearing the due date SHALL keep the reminder without a firing time, as for any relative reminder. The change converges like any reminder edit.

#### Scenario: A time is added
- **WHEN** "Tasks with no time" is "1 day before", "Tasks with a time" is "30 minutes before", and a task due Friday with its untouched default reminder gets the time 15:00
- **THEN** the reminder becomes "30 minutes before" and fires on Friday at 14:30

#### Scenario: Edited reminder is left alone
- **WHEN** the user changed that default reminder to "2 hours before" and then removes the task's time
- **THEN** the reminder keeps its offset of 2 hours before

### Requirement: Default reminders through the API, the CLI and agents
`POST /api/v1/tasks` and `PATCH /api/v1/tasks/{id}` SHALL accept the optional query parameter `default_reminder` (`true` or `false`, default `false`); with `true` the server SHALL apply the person's defaults to that write with the same rule as the app, adding the reminder in the same batch with a firing time computed in the person's time zone. The routes keep their policies: they need a signed-in session or a token, and `read` tokens are refused. `ot add` and `ot edit` SHALL send `default_reminder=true` unless `--no-default-reminder` or `--remind` is given, and the browser extension SHALL send it. The MCP and agent write tools that create or schedule tasks SHALL apply the rule for the calling person, and so SHALL these routes when called with an `agent` token, since such writes run through the agent write tools. CalDAV writes, calendar sync, issue import, the importer, the Markdown vault, automation rules and email capture SHALL NOT apply it. The same rule SHALL be implemented in the server and the web app and pinned by shared test vectors.

#### Scenario: CLI add with a due date
- **WHEN** "Tasks with a time" is "10 minutes before" and the user runs `ot add "Dentist" --due tomorrow --time 09:00`
- **THEN** the task has one reminder that fires tomorrow at 08:50

#### Scenario: Script without the flag
- **WHEN** an integration creates a dated task with `POST /api/v1/tasks` and no query parameter
- **THEN** no default reminder is added

#### Scenario: Agent schedules a task
- **WHEN** an AI agent with an `agent` token uses `schedule_tasks` to give an undated task a time
- **THEN** the task gets the person's default reminder in the same change, attributed to the agent in the task's history

#### Scenario: Unauthenticated request
- **WHEN** a request without a session or token calls `POST /api/v1/tasks?default_reminder=true`
- **THEN** it is refused with 401 and nothing is written

#### Scenario: Invalid flag
- **WHEN** a client calls `PATCH /api/v1/tasks/{id}?default_reminder=maybe`
- **THEN** the request is refused with 400 and the error envelope, and nothing is written

#### Scenario: Calendar client creates a dated task
- **WHEN** a CalDAV client PUTs a new task with a due date and no alarm while a default is set
- **THEN** the task is created without a reminder
