# today-closed-list Specification

## Purpose
Turns Today into an optional closed list: a fixed number of slots filled first come, first served, the rest waiting for a slot, plus a list of what was done today and a way to log work that was never a task.

## Requirements

### Requirement: Today limit preference
Each user SHALL have a "Today limit" preference: off, or a whole number of slots from 1 to 20. It SHALL be an additive field of the user's personal preferences, written as an operation, synced to that user's devices only, editable offline with effect at once on the editing device, converging by last-writer-wins and included in the JSON export. A missing, zero, non-integer or out-of-range value SHALL read as off, and the client SHALL keep the stored value unchanged. Changing it SHALL write no operation on any task.

#### Scenario: Existing account after upgrade
- **WHEN** a user who had the app before this change opens Today
- **THEN** the limit reads off, Today lists every task as before, and no operation is written

#### Scenario: Set on one device
- **WHEN** the user sets the limit to 5 on the laptop while the phone is offline, and the phone later syncs
- **THEN** both devices show Today with five slots, the phone without a reload

#### Scenario: Unknown value from a newer client
- **WHEN** a device receives the limit `40`
- **THEN** it behaves as off and writes no operation

### Requirement: Slots and the Waiting for a slot group
While the limit is on, Today SHALL show at most that many available tasks in its usual groups and order, and list the other available tasks in a folded **Waiting for a slot** group after Blocked, with its count and the hint that the next task comes in when one is finished. A task SHALL count toward the limit when it is an open task of Today that is available under the rule of OpenSpec change `project-flow-modes` (until it exists: not blocked); blocked tasks SHALL stay in Blocked and habits SHALL never take a slot. The slots SHALL be filled in this order: today's focus from the Daily check, the tasks let in with Take a slot in the order taken, the Earlier tasks oldest due first, then the other tasks by creation time, oldest first, ties by id. The Waiting group SHALL list its tasks in that fill order. The slots SHALL be computed on the device from local rows with no write, SHALL follow synced changes live and SHALL work offline. A full Today SHALL never refuse a write. The page lead line SHALL show the slots in use and the limit ("3 of 5").

#### Scenario: Seven tasks, five slots
- **WHEN** the limit is 5 and Today has seven available tasks created in the order A to G, none in the focus, none overdue
- **THEN** A to E are listed in Today's usual groups and order, "Waiting for a slot · 2" is folded at the end, and opening it lists F then G

#### Scenario: A slot frees up
- **WHEN** the user completes C
- **THEN** F moves into Today and the Waiting group shows 1, with no operation written besides the completion

#### Scenario: New task on a full day
- **WHEN** Today is full and the user adds "Call the bank !1 today"
- **THEN** the task is created due today and listed first in Waiting for a slot, and no planned task leaves the slots

#### Scenario: Focus first
- **WHEN** the limit is 3 and the Daily check's focus holds G
- **THEN** G takes a slot ahead of A, and A, B are the other two

#### Scenario: Blocked and sequential tasks do not count
- **WHEN** the limit is 3 and Today has two available tasks, one blocked task and the second task of a Sequential project
- **THEN** both available tasks are in Today, the blocked task is in Blocked, the sequential one is not listed as available, and one slot is free

#### Scenario: Limit off
- **WHEN** the user turns the limit off
- **THEN** Today lists every task as before and the Waiting group is gone

### Requirement: Take a slot
A task in the Waiting group SHALL offer "Take a slot" as a row action, in the task's Actions menu and in the command palette. Taking a slot SHALL record the task id in a personal list of the logical day on the user's review row, written offline as an operation that syncs to the user's own devices and converges by last-writer-wins; the last automatically filled task SHALL go back to waiting. When every slot already holds a focus task or a taken task, the action SHALL be refused with a message and nothing written. A taken task SHALL offer "Give back the slot", which removes it from the list. A list for another day SHALL read as empty without a write, and ids of tasks that are completed, deleted or no longer in Today SHALL drop out as shown without a write. The list holds task ids only and is not content.

#### Scenario: Let a waiting task in
- **WHEN** the limit is 5, A to E fill the slots, and the user takes a slot for G
- **THEN** G is listed in Today, E moves to the top of Waiting for a slot, and the phone shows the same after sync

#### Scenario: Full of chosen tasks
- **WHEN** the limit is 2 and both slots hold focus tasks
- **THEN** Take a slot on a waiting task is refused with "Today is full: complete a task or give one back" and nothing is written

#### Scenario: Next day
- **WHEN** the user took a slot for G yesterday and G is still open and due
- **THEN** today G is filled by the usual order, with no write

### Requirement: Done today group
When the Done today preference reads shown, Today SHALL end with a folded **Done today** group with its count, listing the tasks completed during the user's logical today that the user can see, newest first, including completed occurrences of recurring tasks. Its circle SHALL reopen a task. Its open state is per device. It SHALL never count toward the limit, SHALL work offline and SHALL follow synced completions and reopenings live. The preference SHALL be an additive personal field (`shown` or `hidden`) synced like the limit; an empty or unknown value SHALL read as shown in the modes "Lists with method hints" and "Full Open Loops method" and as hidden in "Simple lists". While the limit is on and the group is shown, the lead line SHALL add the count ("3 of 5 · 4 done").

#### Scenario: Two done today
- **WHEN** the user in "Lists with method hints" completed two tasks today and one yesterday
- **THEN** Today ends with "Done today · 2" listing the two, newest first

#### Scenario: Reopen from the group
- **WHEN** the user clicks the circle of a task in Done today
- **THEN** the task is reopened, leaves the group and returns to its open place in Today

#### Scenario: After midnight with a day start
- **WHEN** the day start is `04:00` and a task was completed at 01:30
- **THEN** it is in Done today until 04:00 and absent from it afterwards

#### Scenario: Simple lists
- **WHEN** a user in "Simple lists" who never changed the preference opens Today
- **THEN** no Done today group is shown

### Requirement: Log a win
The user SHALL be able to add a task that is already done: from the "Log a win" button on the Done today heading, from the command palette ("Log a win"), and from quick add with its "Log as done" switch on. The task SHALL be created in one batch of operations with its completion time set to now and completed by the user, through the same path as every write, offline included, and SHALL then be listed in Done today and Completed and counted in statistics and Close the day like any completion. The quick-add grammar SHALL apply, except that recurrence and reminder phrases SHALL be refused with a chip saying a win does not repeat or remind; the default project SHALL be the Inbox or the current project, and projects the user can only view SHALL not be offered. Automation rules and webhooks SHALL see an ordinary creation and completion. On an encrypted account the title SHALL be encrypted like any title.

#### Scenario: Unplanned win
- **WHEN** the user activates "Log a win" and enters "Helped Ana with the release #Work"
- **THEN** a completed task "Helped Ana with the release" in Work, completed now by the user, is listed first in Done today and under Today in Completed

#### Scenario: Recurrence refused
- **WHEN** the user logs "Water the plants every day"
- **THEN** the chip says a win does not repeat, the phrase stays in the title, and the task is created completed without a rule

#### Scenario: Offline win
- **WHEN** the device is offline and the user logs a win
- **THEN** it is shown in Done today at once and reaches the other devices on the next sync as a completed task

### Requirement: Where the closed list is set
Settings → General → Start view and briefing SHALL offer a Today limit card with the limit (Off, 3, 5, 7, 10, Custom from 1 to 20) and the Done today switch, for every mode. Today's overflow menu SHALL offer "Limit Today…" and "Show done today" only in the modes "Lists with method hints" and "Full Open Loops method", or while a limit is set. The palette SHALL list "Limit Today…", "Take a slot", "Give back the slot" and "Log a win" without default keys. Viewers of a shared project SHALL be able to take a slot for its tasks, since the list is personal.

#### Scenario: Simple lists see nothing new
- **WHEN** a user in "Simple lists" opens Today's overflow menu
- **THEN** it has no Today limit item, and Today looks as before

#### Scenario: Custom limit
- **WHEN** the user picks Custom and types 12 in Settings → General → Start view and briefing → Today limit
- **THEN** the limit is 12; typing 25 is refused with a message and the stored value is unchanged

#### Scenario: Phone
- **WHEN** a user with a limit long-presses a waiting task on a 360 px screen
- **THEN** the task menu offers "Take a slot", and Today shows no new row of chrome

### Requirement: Time-sensitive tasks waiting for a slot
While the Waiting for a slot group is folded, Today SHALL list under its heading the waiting tasks that are due today with a time (in the user's time zone) or whose deadline is today, soonest first: by time, then the deadlines without a time, ties in fill order. Each SHALL show its time (or that its deadline is today) and offer Take a slot, with the rules of Take a slot (refused with its message while every slot holds a focus or taken task; Give back the slot undoes it). At most three SHALL be listed, with a control naming how many more there are that opens the group. The folded heading SHALL name the soonest of them with its time, as part of the heading's accessible name ("Waiting for a slot · 4 — next: Send the form, 4:00 PM"). Opened, the group SHALL list every waiting task in fill order as before, without this list. The fill order SHALL be unchanged: no task SHALL take a slot or move because of its time, and a task whose time has passed SHALL stay listed until the day ends. The list SHALL be derived on the device from local rows with no write, follow synced changes live and work offline; Take a slot writes and converges as before.

#### Scenario: Captured on a full day
- **WHEN** Today is full with a limit of 5 and the user adds "Send the form today at 4pm"
- **THEN** the task waits, the folded heading reads "Waiting for a slot · 1 — next: Send the form, 4:00 PM", and the task is listed under it with 4:00 PM and Take a slot

#### Scenario: Soonest first, fill order kept
- **WHEN** the waiting tasks, in fill order, are "Send the form" at 16:00, "Plain" with no time, "File the taxes" with a deadline today and "Call the school" at 09:00
- **THEN** the folded group lists "Call the school" at 09:00, "Send the form" at 16:00 and "File the taxes" as a deadline, and opening the group lists Send the form, Plain, File the taxes, Call the school

#### Scenario: Take a slot from the list
- **WHEN** the user activates Take a slot on "Send the form" in that list
- **THEN** it is listed in Today, the last automatically filled task waits again, and one operation on the review row is written, offline included

#### Scenario: Full of chosen tasks
- **WHEN** every slot holds a focus or taken task and the user activates Take a slot in the list
- **THEN** it is refused with "Today is full: complete a task or give one back" and nothing is written

#### Scenario: No time today
- **WHEN** no waiting task is due today with a time or has a deadline today
- **THEN** the folded heading shows its label and count only, as before

#### Scenario: Phone
- **WHEN** the list is shown on a 360 px screen
- **THEN** each line keeps its time, a truncated title and Take a slot on one line, and the heading truncates the next task's name before its label
