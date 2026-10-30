# calendar-slots Specification

## Purpose
Defines calendar slots: personal blocks on the Day and Week grid that hold an ordered checklist of small tasks, which tasks a slot shows, how tasks are added, taken out and dated with it, how Day and Week draw, move and resize a slot, how it counts toward capacity and shows in lists, how slots are created, and their API, CLI and assistant surface.

## Requirements

### Requirement: Slot entity
A user SHALL be able to keep slots: personal records with an optional title, a date, a start wall time (`HH:MM`), a length of 15 to 480 minutes in 15-minute steps, a colour, an ordered list of at most 20 task ids, and a deletion tombstone. Slots SHALL be written through the operation log, resolve to the author's personal scope (synced to the author's own devices, never to project members), be editable offline, converge per field by last-writer-wins with the task list as one whole value, and be included in the export. No field SHALL be added to tasks for slots.

#### Scenario: Create a slot offline
- **WHEN** the device is offline and the user creates "Admin" on Wednesday at 16:00 for 45 minutes
- **THEN** the slot is drawn on Wednesday at once and reaches the user's other devices after the next sync

#### Scenario: Concurrent task lists
- **WHEN** the laptop sets a slot's tasks to `[A, B]` and the phone to `[A, C]`, both offline, and both sync
- **THEN** every device shows the list written with the greater timestamp, never a merge of both

#### Scenario: Invalid value
- **WHEN** a client submits a slot with 21 task ids or a `start` of `"25:00"`
- **THEN** the write is rejected as invalid and the slot is unchanged

#### Scenario: Personal on a shared project
- **WHEN** Ana puts a task of the shared project "Launch" in her slot
- **THEN** Ben, a member, never receives the slot and sees only the task's date as it was set

### Requirement: Tasks a slot shows
A slot SHALL show each listed task that is known locally, not deleted, and whose due date in the viewer's zone is the slot's date or which has no due date; open tasks as checklist rows in list order and completed ones checked after them. Listed ids that name a task moved to another day, deleted or not yet received SHALL be kept without a write and not shown. When two slots of the same day list the same open task, only the slot created first SHALL show it. A task shown in a slot SHALL not also be drawn as its own block or in the unscheduled lane.

#### Scenario: Moved on another device
- **WHEN** a task in Wednesday's slot is moved to Thursday on the phone and the laptop syncs
- **THEN** the laptop shows the task on Thursday as usual, the slot no longer shows it, and no operation is written for the slot

#### Scenario: Completed in the slot
- **WHEN** the user ticks two of five tasks in a slot
- **THEN** the slot reads "2 of 5 done" and the two rows are shown checked at the end of the checklist

#### Scenario: Listed in two slots
- **WHEN** after concurrent edits a task is listed by two slots of the same day
- **THEN** it appears only in the slot created first, and nothing is written

### Requirement: Add tasks to a slot
Dropping a task on a slot, from a list, the planning list, the unscheduled lane or a block, SHALL add it at the end of the slot's list and, in the same batch, set the task's due to the slot's date without a time when it is not already that, removing the task from any other slot of that day; one Undo SHALL revert the whole batch. During a placement, when the proposed start lies inside a slot, `Shift+Enter` SHALL add the task to that slot while Enter keeps placing it as its own block. On a phone, the Schedule sheet SHALL offer the day's slots as choices. A task the user may not edit SHALL be added only when it is already due on the slot's date; a full slot SHALL refuse the drop with a message. Every write is local first, queued offline, and converges as ordinary field edits.

#### Scenario: Drop a small task
- **WHEN** the user drags "Reply to Marco" (due Friday at 10:00) onto Wednesday's "Admin" slot
- **THEN** the task is due Wednesday without a time, appears in the slot's checklist and not as its own block, and one Undo restores Friday at 10:00 and the slot's previous list

#### Scenario: Keyboard placement into a slot
- **WHEN** the user presses `s` on a list task, moves the placement into the "Admin" slot and presses `Shift+Enter`
- **THEN** the task is added to the slot as by a drop, and pressing Enter instead would have placed it at that time as its own block

#### Scenario: Viewer's task
- **WHEN** the user is a viewer of a task's project and the task is due Friday, and they drop it on Wednesday's slot
- **THEN** the drop is refused with "You can't change this task's date" and nothing is written

#### Scenario: Slot is full
- **WHEN** a slot lists 20 tasks and the user drops another
- **THEN** the drop is refused with a message that a slot holds 20 tasks

### Requirement: Slots drawn in Day and Week
Day and Week SHALL draw a slot as one block from its start for its length, with its colour, a stack icon, its title (or "Slot"), a count of done and listed tasks, and as many checklist rows as fit, the rest behind a "+n" control that opens a popover listing all of them. A slot SHALL take part in the side-by-side layout and the overlap marker with task and event blocks, lie above frame bands, and be dimmed on days before today. Checklist rows SHALL be reachable with the keyboard (arrows between rows, Space completes, Enter opens the task). Below 640 px the Week agenda SHALL show a slot as one row with its time and count that expands in place to its checklist.

#### Scenario: Ten small tasks, one block
- **WHEN** a 45-minute slot holds ten 5-minute tasks and fits six rows
- **THEN** the grid shows one block "Admin · 0 of 10 done" with six rows and "+4", and no separate blocks for the ten tasks

#### Scenario: Complete from the grid with the keyboard
- **WHEN** the user tabs to a slot, presses the down arrow to its second row and Space
- **THEN** that task is completed and the count reads "1 of 10 done"

#### Scenario: Phone agenda
- **WHEN** the Week is opened at 390 px and Wednesday has the "Admin" slot
- **THEN** Wednesday lists "Admin · 16:00–16:45 · 0 of 10", and tapping it shows the ten tasks under it

### Requirement: Move, resize and delete a slot
Dragging a slot or moving it with the arrow keys SHALL write its date and start, and a change of date SHALL also set the date of each shown task the user may edit in the same batch; tasks the user may not edit SHALL stay on their day. Dragging its lower edge or `Shift` with up and down SHALL change its length in 15-minute steps, never below 15 minutes. Deleting a slot SHALL tombstone it and leave its tasks on its date without a time. Taking a task out SHALL remove it from the list, and a drop of the row on the grid SHALL also give it that time. Each action SHALL be one batch with one Undo, applied locally first and converging by last-writer-wins.

#### Scenario: Move to tomorrow
- **WHEN** the user drags Wednesday's slot holding three tasks to Thursday 09:00
- **THEN** the slot is on Thursday at 09:00, the three tasks are due Thursday, and one Undo puts the slot and the three dates back

#### Scenario: Delete keeps the tasks
- **WHEN** the user deletes a slot holding four open tasks
- **THEN** the four tasks appear in that day's unscheduled lane, and Undo brings the slot back with its list

#### Scenario: Take one task out
- **WHEN** the user drags a row out of the slot onto 14:00
- **THEN** the task is due that day at 14:00 as its own block and the slot no longer lists it

### Requirement: Slots in capacity and lists
A slot SHALL count toward its day's capacity in Day, Week, Month and Plan once, with the greater of its length and the sum of its open shown tasks' estimates, and its tasks SHALL not be counted again; when the estimates exceed the length the slot SHALL read "overfull" in the warning tone ("50m in 45m"). In lists, a task shown in a slot SHALL show the slot's start in the row's time column with the stack icon and the slot's name in its tooltip, adding no row property. Re-planning the day SHALL treat a slot's interval as occupied and SHALL not move it.

#### Scenario: Slot counted once
- **WHEN** a 45-minute slot holds tasks estimated at 25 minutes in total and the day has a 1-hour task block
- **THEN** the day's capacity counts 1 h 45 m

#### Scenario: Overfull
- **WHEN** a 45-minute slot holds tasks estimated at 50 minutes in total
- **THEN** the slot shows "50m in 45m" in the warning tone and the day counts 50 minutes for it

#### Scenario: Today in calendar order
- **WHEN** a task is in today's 16:00 slot
- **THEN** its row in Today shows 16:00 with the stack icon in the time column, and its tooltip names the slot

### Requirement: Create slots
The Day and Week overflow menu and the command palette SHALL offer New slot (the focused day, the next free quarter hour, 30 minutes). When the grid offers an empty-slot menu (OpenSpec change `calendar-clarity`) it SHALL include New slot here…, and a frame's popover (OpenSpec change `calendar-frames`) SHALL include Make a slot here, creating a slot over that occurrence with the frame's title and colour. No slot control SHALL appear in Today, lists or the sidebar before a slot exists.

#### Scenario: From a frame
- **WHEN** the user opens the "Admin" frame (16:00–16:45) on Wednesday and chooses Make a slot here
- **THEN** a slot "Admin" is created on Wednesday from 16:00 for 45 minutes in the frame's colour, and its title is focused for editing

#### Scenario: From the palette
- **WHEN** the Day shows today at 10:07 and the user runs New slot from the command palette
- **THEN** a 30-minute slot is created today at 10:15

### Requirement: Slots API
The server SHALL offer `GET /api/v1/slots` with a date range, `POST /api/v1/slots`, `PATCH /api/v1/slots/{id}` and `DELETE /api/v1/slots/{id}`, each requiring a signed-in session or token; reads SHALL accept every token scope and writes SHALL be refused to `read` and `agent` tokens. Writes SHALL be applied as operations with `ApplyStrict` and wake the user's devices. A `PATCH` with `move_tasks` SHALL also set the listed tasks' due dates as adding does, and SHALL write nothing when any listed task cannot be edited by the caller. On an encrypted account the title SHALL be returned as stored with `"encrypted": true` and a plaintext title write refused. The CLI SHALL offer `ot slots`, `ot slots add`, `ot slots put` and `ot slots rm`, and the agent tools a read tool listing slots with their tasks for a date range, titles marked as untrusted text.

#### Scenario: Unauthenticated request
- **WHEN** a request to `GET /api/v1/slots` carries no session or token
- **THEN** the server answers 401 with the error envelope

#### Scenario: Too many tasks
- **WHEN** a client patches a slot with 21 task ids
- **THEN** the server answers 422 with the error envelope and nothing is written

#### Scenario: Move tasks refused for a viewer
- **WHEN** a caller patches a slot with `move_tasks` and one listed task belongs to a project where they are a viewer
- **THEN** the server answers 403 naming the task and writes nothing

#### Scenario: Put tasks from the CLI
- **WHEN** the user runs `ot slots put <slot> <task1> <task2>`
- **THEN** both tasks are added to the slot and dated to its day as one batch, and the web app shows them in the slot after its next sync
