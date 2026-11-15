## MODIFIED Requirements

### Requirement: Default reminder preferences
The account SHALL have two synced default reminder preferences, "Tasks with a time" and "Tasks with no time", on the Reminders page of Settings → Notifications (its first page, apart from push notifications, since a default reminder reaches the person by every channel), each either none (the default) or an offset in minutes relative to the due time within the reminder offset limit. "Tasks with a time" SHALL offer None, At the due time, 10 minutes before, 30 minutes before, 1 hour before, 1 day before and Custom; "Tasks with no time" SHALL offer None, On the day at 09:00, 1 day before, 2 days before, 3 days before, 1 week before and Custom, all counted from 09:00 local on the due date. A stored value that is empty, malformed or outside the limit SHALL read as none and SHALL be kept. The preferences SHALL be written as operations, work offline, reach the user's other devices and converge by last-writer-wins; they are settings, not content, and are never encrypted. Changing a preference SHALL NOT change reminders that already exist.

#### Scenario: Set a default on the laptop
- **WHEN** the user sets "Tasks with a time" to "30 minutes before" on the laptop and the phone syncs
- **THEN** the phone's Settings shows "30 minutes before" and the phone applies it to the next task it schedules

#### Scenario: Default is none
- **WHEN** an account that never opened the card schedules a task at 15:00
- **THEN** no reminder is added

#### Scenario: Changing the preference leaves reminders alone
- **WHEN** a task already has a default reminder "30 minutes before" and the user changes the default to "1 hour before"
- **THEN** the task's reminder still fires 30 minutes before

#### Scenario: Where the defaults live
- **WHEN** the user opens Settings → Notifications
- **THEN** the first page is Reminders with Default reminders, and Push notifications no longer shows them

### Requirement: Default reminder when a task gets a due date
When a write by a person gives a task that had no due date a due date, including creating a task with a due date, or changes a due between a date only and a date with a time while the person has no default for the old kind and the task has no default reminder (so the task gets its first due of a kind with a default, for example the date and then the time set in two steps), and that person's default for that kind of due is set, the writing device or server SHALL add one relative reminder with the default offset to the same batch, with its firing time computed from the new due like any relative reminder, unless the task is completed, deleted or a habit, the task already has a live relative reminder, the same write adds one (for example a quick-add reminder phrase), or the task's default reminder already exists, live or deleted by the person. The default reminder's id SHALL be derived from the person's id and the task's id, so it is created at most once per person and task. Moving a due date from one day to another SHALL NOT add a reminder. Undo, redo, restoring a version or restoring from the Trash SHALL NOT add one; Undo of the write that added it SHALL remove it, and a later due date MAY add it again. The reminder SHALL be an ordinary reminder of the writing person: shown and removable in the task's Reminders, delivered in the app, by push and by the native shells, served to calendar clients as an alarm, applied locally first so it works offline, uploaded with the due change in one batch, and converging like any reminder. Two devices that give the same task a due date offline SHALL end with one default reminder.

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

#### Scenario: The date, then the time
- **WHEN** only "Tasks with a time" is "30 minutes before" and the user sets a day on an undated task in the editor and then a time of 15:00
- **THEN** the task gets one reminder "30 minutes before" that fires at 14:30
