# deadlines Specification

## Purpose
Gives a task a deadline, the day by which it must be done, kept separate from the due date, the day it is planned for, so a task can be scheduled for Tuesday and due by Friday and both dates stay visible, filterable and synced.

## Requirements

### Requirement: Deadline field
A task SHALL have an optional `deadline`: a floating calendar date `YYYY-MM-DD` or null (default), with no time and no time zone. It SHALL be an additive task field: validated like other fields, settable offline, synced as a field operation, converging by per-field last-writer-wins, included in the export and in the REST task representation. A client without the field SHALL store and forward it untouched.

#### Scenario: Default on creation
- **WHEN** a task is created with only a title
- **THEN** its deadline is null and no deadline operation is written

#### Scenario: Invalid deadline rejected
- **WHEN** a client submits a deadline that is not a valid `YYYY-MM-DD` date, such as `2026-02-30`, `2026-11-03T09:00` or an object with a time
- **THEN** the write is rejected as invalid and the task's deadline is unchanged

#### Scenario: Set offline and converge
- **WHEN** device A sets the deadline to `2026-11-06` and device B sets it to `2026-11-13` on the same task, both offline, and both sync
- **THEN** the deadline shows immediately on each editing device, and after sync every device shows the value written with the greater timestamp

#### Scenario: Older client passes it through
- **WHEN** a device running a client that predates deadlines receives a deadline operation and later edits the task's title
- **THEN** after sync the task keeps its deadline and the new title on every device

#### Scenario: Create via the API
- **WHEN** a script POSTs a task with `{"title":"Report","deadline":"2026-11-06"}` with a bearer token
- **THEN** the response is 201 with `"deadline":"2026-11-06"`, and `{"deadline":"next friday"}` is refused with 400 `invalid_input`

### Requirement: Deadline is independent of the due date
Setting, moving or clearing the due date SHALL NOT change the deadline, and setting, moving or clearing the deadline SHALL NOT change the due date, the due time or the zone. A deadline before the due date SHALL be accepted and shown with the danger tone, never refused.

#### Scenario: Clear the due date
- **WHEN** a task due Tuesday with a deadline on Friday has its due date cleared
- **THEN** the task has no due date, keeps the Friday deadline, and leaves Upcoming's Tuesday group

#### Scenario: Due after the deadline
- **WHEN** the user moves the due date of a task with a deadline on Friday to the following Monday
- **THEN** the change is accepted and the row shows the deadline countdown in the danger tone

### Requirement: Deadline entry
The detail panel SHALL set the deadline inside the When popover, in a Deadline segment that reads the date in the user's date format and is edited with the same date field and calendar as the due date, including typed dates and relative words, and SHALL be clearable from the popover's footer. A task with a deadline SHALL show it as a part of the When line reading "deadline" followed by the date and its countdown. Every change SHALL apply locally at once.

#### Scenario: Set from the panel
- **WHEN** the user opens a task, opens the When popover, switches to Deadline, types `fri` and confirms
- **THEN** the deadline is the next Friday, the When line gains "deadline" with the date in the user's format and its countdown, and the due date is unchanged

#### Scenario: Viewer of a shared project
- **WHEN** a viewer of a shared project opens one of its tasks
- **THEN** the deadline part reads as text and cannot be changed

#### Scenario: No deadline, no chip
- **WHEN** a task has no deadline
- **THEN** the When line has no deadline part, and Deadline is offered in the Add menu under When and as a segment of the When popover

#### Scenario: Overdue deadline tone
- **WHEN** a task's deadline was three days ago
- **THEN** the deadline part reads "deadline" with the date and "3 days over" in the danger tone, as the row does

### Requirement: Deadline entry from a list
Pressing `d` on a selected task in a list SHALL open the same date field inline, so the deadline can be set without opening the panel. Every change SHALL apply locally at once.

#### Scenario: Set from the list
- **WHEN** a task is selected in a list, focus is not in a text field, and the user presses `d`, types `2026-11-06` and presses Enter
- **THEN** the task's deadline is `2026-11-06` and the row shows its countdown

### Requirement: Deadline countdown
A task with a deadline SHALL show, on its row in every list and in the detail panel, a countdown computed on the device from the deadline and the viewer's local calendar date: the days remaining (`3d`), `Today` on the deadline day, or the days elapsed (`2d over`). The chip SHALL use a neutral tone beyond seven days, a warning tone within seven days, and the danger tone on the day and after. The panel SHALL also show the full date.

#### Scenario: Countdown in a project list
- **WHEN** today is 2026-10-14 and a task in a project has the deadline `2026-10-17`
- **THEN** its row shows `3d` in the warning tone

#### Scenario: Past deadline
- **WHEN** today is 2026-10-14 and an open task has the deadline `2026-10-12`
- **THEN** its row shows `2d over` in the danger tone

#### Scenario: Countdown updates offline
- **WHEN** the device is offline and the viewer's calendar date advances past midnight
- **THEN** every countdown is recomputed from local data without a reload or a network request

### Requirement: Deadlines in Today
Today SHALL list, besides tasks due today or earlier, every open task whose deadline is today or earlier. A task whose deadline has passed and that is not due today SHALL join the Overdue group; a task whose deadline is today SHALL join today's group. The sidebar's Today count SHALL count the same tasks. A task SHALL appear once even when both its due date and its deadline qualify.

#### Scenario: Deadline today without a due date
- **WHEN** today is 2026-10-14 and an open task has no due date and the deadline `2026-10-14`
- **THEN** it is listed in Today's group with the `Today` countdown, and the Today count includes it

#### Scenario: Scheduled later than a past deadline
- **WHEN** today is 2026-10-14 and a task is due 2026-10-16 with the deadline 2026-10-13
- **THEN** it is listed once, in Today's Overdue group, with `1d over`

#### Scenario: Deadline still ahead
- **WHEN** a task is due 2026-10-20 with the deadline 2026-10-24 and today is 2026-10-14
- **THEN** it is not in Today

### Requirement: Deadlines in Upcoming
Upcoming SHALL list an open task that has a future deadline and no due date under its deadline day, after that day's tasks with a due date, marked with its countdown. A task with a due date SHALL be listed under its due date only, carrying the countdown when it has a deadline.

#### Scenario: Deadline only
- **WHEN** an open task has no due date and the deadline `2026-10-17`, and today is 2026-10-14
- **THEN** Upcoming shows it under Saturday 17 October after the tasks due that day, with `3d`

#### Scenario: Both dates
- **WHEN** a task is due 2026-10-15 with the deadline 2026-10-17
- **THEN** Upcoming lists it under Tomorrow only, with the `3d` countdown on its row

### Requirement: Deadline segment quick choices
The Deadline segment of the When popover SHALL offer the quick choices End of week, End of month and In 2 weeks, each with the date it means, followed by the same worded date field and visible month calendar as the Do on segment. End of week SHALL be the last day of the user's week; End of month the last day of the current month.

#### Scenario: End of month
- **WHEN** today is 2026-10-21 and the user chooses End of month in the Deadline segment
- **THEN** the deadline is 2026-10-31 and the due date is unchanged

#### Scenario: Week setting respected
- **WHEN** the user's week starts on Monday, today is Wednesday 2026-10-21 and the user chooses End of week
- **THEN** the deadline is Sunday 2026-10-25
