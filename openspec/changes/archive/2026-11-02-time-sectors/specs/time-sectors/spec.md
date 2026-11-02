## ADDED Requirements

### Requirement: Sector field
A task SHALL have an additive field `sector`: empty (the default) or one period:
- an ISO 8601 week `YYYY-Www` (`W53` only in a year that has 53 ISO weeks);
- a month `YYYY-MM`;
- a quarter `YYYY-Qn`;

with a year from 2000 to 2999. The field SHALL be validated on every write path (sync, REST, CalDAV, vault, MCP, CLI). It SHALL be settable offline, synced as a field operation, converging by per-field last-writer-wins, plaintext for encrypted accounts, included in the JSON export and the REST representation, and stored and forwarded untouched by a client that predates it. A REST `null` SHALL be stored as empty.

#### Scenario: Default on creation
- **WHEN** a task is created with only a title
- **THEN** its sector is empty and no operation is written for it

#### Scenario: Invalid values refused
- **WHEN** a client submits the sector `2026-W54`, `2027-W53`, `2026-13`, `2026-Q5`, `this week` or `1999-Q1`
- **THEN** the write is refused as invalid (`400 invalid_input` over REST) and the task is unchanged

#### Scenario: Valid week 53
- **WHEN** a client submits the sector `2026-W53`
- **THEN** it is stored, because 2026 has 53 ISO weeks

#### Scenario: Older client passes it through
- **WHEN** a device whose client predates the field receives a task with the sector `2026-W45` and edits its title
- **THEN** after sync every device shows the new title and the sector `2026-W45`

#### Scenario: Encrypted account
- **WHEN** an end-to-end encrypted account sets a sector
- **THEN** the operation carries the plaintext period, and the title stays ciphertext

### Requirement: One when at a time
Setting a sector from the app SHALL write the sector and clear the do-on date, the start (date or Someday) and the evening flag in one batch; setting a do-on date, a start date or Someday from the app SHALL clear the sector in the same batch. The deadline, its reminders, the estimate and the labels SHALL be kept. A task that holds both a do-on date and a sector (written by the API, CalDAV or an older client) SHALL be placed by its do-on date, its rows SHALL show no sector chip, and its When line SHALL read the sector as ignored while dated with a Clear action. A repeating task SHALL NOT be given a sector from the app.

#### Scenario: Sector replaces a fake date
- **WHEN** a task due Monday with the deadline Friday is set to This week
- **THEN** in one batch its sector is the current week and its do-on date is cleared, the deadline Friday is kept, and one Undo restores the due date and clears the sector

#### Scenario: Dating a sectored task
- **WHEN** the user gives a task with the sector This week a do-on date of Wednesday
- **THEN** in one batch the due is Wednesday and the sector is empty

#### Scenario: Concurrent edits converge
- **WHEN** device A sets a task to Next week while device B, offline, gives it the due date Thursday, and both sync
- **THEN** every device shows either the sector with no due date or the due date with no sector, whichever batch has the greater timestamp

#### Scenario: Both set through the API
- **WHEN** a script PATCHes a task with `{"due": {"date": "2026-11-04"}, "sector": "2026-11"}`
- **THEN** the task is listed under 4 November in Upcoming, its rows show no sector chip, and its When line reads the sector as ignored while dated with a Clear action

#### Scenario: Repeating task
- **WHEN** the user opens the When popover of a task with `every monday`
- **THEN** the Sector segment is disabled with the text "Repeating tasks keep a date"

### Requirement: Relative names and carry-over
The client SHALL name a sector relative to the viewer's local date and first day of the week:
- This week, Next week, This month, Next month, This quarter, Next quarter;
- otherwise the period's own name with its dates.

This week SHALL be the ISO week that contains the Monday falling inside the viewer's current week. A sector whose period ended before the viewer's current period of the same kind SHALL be carried over: shown with a "From <period>" chip in the faint tone, never in the overdue colour, and listed under Carried over in the planning list. Names and carry-over SHALL be computed on the device by one rules module shared with the server's Go twin and pinned by shared vectors, and SHALL never write an operation.

#### Scenario: Monday week
- **WHEN** the week starts on Monday, today is Wednesday 2026-10-28 and a task has the sector `2026-W44`
- **THEN** its chip reads "This week"

#### Scenario: Sunday week on a Sunday
- **WHEN** the week starts on Sunday and today is Sunday 2026-11-01
- **THEN** This week means `2026-W45`, and a task with `2026-W44` is carried over

#### Scenario: A week ends offline
- **WHEN** the device is offline and the local date moves from Sunday 2026-11-01 to Monday 2026-11-02 with Monday weeks
- **THEN** a task with `2026-W44` shows "From week 44" without a reload, and no operation is written or queued

#### Scenario: Shared project, two week starts
- **WHEN** a member with Monday weeks sets a shared task to This week on Wednesday 2026-10-28, and a member with Sunday weeks views it the same day
- **THEN** both see "This week", because the stored value is `2026-W44` for both

#### Scenario: Same answer on the server
- **WHEN** the vitest and the Go test run the shared sector vectors
- **THEN** both produce the same validity, names and carry-over for every vector

### Requirement: Setting the sector
While time sectors are on, or when the task already has a sector, the When popover SHALL offer a Sector segment after Do on and Start:
- quick choices This week, Next week, This month, Next month, This quarter and Next quarter, each with its period and dates in muted text;
- "Later…" with a period picker for weeks, months and quarters;
- Clear.

The segment SHALL be keyboard-operable like the other segments. The command palette SHALL offer "Set time sector…" for the selected tasks as one undoable change, skipping repeating tasks and saying how many it skipped. Viewers of a shared project SHALL see the sector as text only.

#### Scenario: From the popover
- **WHEN** the user opens When on a task, chooses Sector and presses Enter on Next week
- **THEN** the task's sector is next week's ISO week, the popover closes, and the When line reads "Next week"

#### Scenario: Bulk from the palette
- **WHEN** the user selects five tasks, one of them repeating, and runs "Set time sector…" with This month
- **THEN** four tasks get the current month, the toast says one repeating task was skipped, and one Undo reverts the four

#### Scenario: Viewer
- **WHEN** a viewer of a shared project opens a task with a sector
- **THEN** the When line shows the sector as text and offers no control to change it

#### Scenario: Offline
- **WHEN** the device is offline and the user sets a sector
- **THEN** the task leaves the Inbox at once and the batch uploads on the next sync

### Requirement: Time sectors in the planning list
While time sectors are on, the calendar's planning list SHALL offer the source Time sectors, which groups open tasks without a do-on date by sector in this order, hiding empty groups:
1. Carried over
2. This week
3. Next week
4. This month
5. Next month
6. This quarter
7. Next quarter
8. Later

Each task SHALL appear once, by its own sector. Each group SHALL show its count and the sum of known estimates. A group SHALL list only available tasks: open, not deleted, not deferred, not blocked, and not waiting behind an earlier open task of a Sequential project or section. That is the one availability rule shared with `project-flow-modes` and `today-closed-list`. Unavailable tasks SHALL be counted in a "waiting" footer that filters the group to them. Placing a row on a day, with `s` or by drag, SHALL set its do-on date and clear its sector as one undoable change. "Do today" SHALL respect Today's limit when one is set. With time sectors off, a remembered Time sectors source SHALL read as the Inbox.

#### Scenario: Plan the week from the sectors
- **WHEN** the user opens the planning list in the Week with the source Time sectors, focuses a This week row, presses `s`, moves to Thursday and presses Enter
- **THEN** the task is due Thursday with no sector, it leaves the list, and one Undo returns it to This week

#### Scenario: Waiting tasks are counted
- **WHEN** This week holds four tasks, one blocked by an open task and one second in a Sequential project whose first task is open
- **THEN** the group lists two tasks and its footer reads "2 waiting"

#### Scenario: Today is full
- **WHEN** the Today limit is 5, Today holds 5 tasks and the user chooses "Do today" on a This week row
- **THEN** the task is due today and listed in Today's "Waiting for a slot" drawer, as any addition to a full Today is

#### Scenario: Switch turned off
- **WHEN** the remembered source is Time sectors and the user turns time sectors off on another device, then this device syncs
- **THEN** the planning list shows the Inbox, and tasks with sectors keep them

### Requirement: Time sectors switch
Each user SHALL have the preference `time_sectors`, an additive user_prefs field. Empty or any unknown value means off, `on` means on, and a client SHALL keep an unknown value unchanged. It SHALL be written as an operation, synced to that user's devices only, editable offline, and converging by last-writer-wins. Settings → Account → How you work SHALL show it as a switch below the three choices, off by default whichever choice is made. While it is off:
- the Sector segment is hidden unless the task has a sector;
- the planning list has no Time sectors source;
- quick add recognises no sector phrase;
- the weekly review shows no sector section.

Chips, filters, placement and every API SHALL keep working.

#### Scenario: Simple lists see nothing new
- **WHEN** a user with Simple lists who never turned the switch on opens a task's When popover, the planning list and quick add
- **THEN** none of them shows anything about sectors

#### Scenario: A sector from elsewhere with the switch off
- **WHEN** the switch is off and a task gets the sector `2026-W45` from the CLI
- **THEN** the task shows a "Next week" chip and the When popover shows the Sector segment for that task with Clear

#### Scenario: Turned on on another device
- **WHEN** the user turns the switch on on the laptop while the phone is offline, and the phone syncs
- **THEN** the phone shows the Sector segment without a reload
