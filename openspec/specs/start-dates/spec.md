# start-dates Specification

## Purpose
Lets a task say when it becomes relevant, separately from its due date: a start date defers it until that day, Someday parks it without a date, and This Evening sets it aside for tonight. Deferred and parked tasks stay out of the planning views and the counts until their time, and have views of their own.

## Requirements

### Requirement: Start and evening fields
A task SHALL have an optional `start`, which is null (default), a floating calendar date `YYYY-MM-DD`, or the word `someday`, and a boolean `evening` (default false). Both SHALL be additive task fields: validated like other fields, settable offline, synced as field operations, converging by per-field last-writer-wins, included in the export and the REST representation, and stored and forwarded untouched by a client without them.

#### Scenario: Default on creation
- **WHEN** a task is created with only a title
- **THEN** its start is null, evening is false, and no operation is written for either

#### Scenario: Invalid values rejected
- **WHEN** a client submits a start of `later`, `2026-02-30` or `2026-11-03T09:00`, or an evening of `"yes"`
- **THEN** the write is rejected as invalid and the task is unchanged

#### Scenario: Concurrent date and Someday converge
- **WHEN** device A defers a task until `2026-11-03` and device B parks it in Someday, both offline, and both sync
- **THEN** every device shows the start written with the greater timestamp, never a date and Someday at once

#### Scenario: Older client passes them through
- **WHEN** a device running a client that predates these fields receives a Someday task and edits its title
- **THEN** after sync the task is still in Someday with the new title on every device

### Requirement: Deferred tasks
A task whose start is a date after the viewer's local date SHALL be deferred: absent from Today, Upcoming, Anytime and the sidebar counts, and listed in its project or Inbox view in a **Later** group after the other tasks with a "Starts" chip showing the date. A task due or with a deadline today or earlier SHALL be in Today regardless of its start. Deferral SHALL be computed on the device from local data and SHALL change on the start day without any write.

#### Scenario: Deferred until next week
- **WHEN** today is 2026-10-14 and an open Inbox task has the start `2026-10-21` and no due date
- **THEN** it is absent from Today, Upcoming and Anytime, the Inbox count does not include it, and the Inbox view lists it under Later with `Starts 21 Oct`

#### Scenario: Deferred with a later due date
- **WHEN** a task is due 2026-10-24 with the start `2026-10-21` and today is 2026-10-14
- **THEN** Upcoming does not list it, and its project view shows it under Later

#### Scenario: Hard date wins
- **WHEN** a task with the start `2026-10-21` has the deadline `2026-10-14` and today is 2026-10-14
- **THEN** it is listed in Today with its deadline countdown

#### Scenario: Start day arrives offline
- **WHEN** the device is offline and the local date advances to the task's start date
- **THEN** the task leaves Later and appears in Today without a reload or a write

### Requirement: Started tasks in Today
A task whose start is a date on or before the viewer's local date SHALL be active: listed in Today's group, after tasks due today, with a "Started" chip when the start date is past, until it is completed, parked, deferred again or its start is cleared. The sidebar's Today count SHALL include it. A started task with a later due date SHALL also keep its place in Upcoming.

#### Scenario: On the start day
- **WHEN** today is 2026-10-21 and an open task with no due date has the start `2026-10-21`
- **THEN** Today lists it in today's group and the Today count includes it

#### Scenario: Still open days later
- **WHEN** today is 2026-10-24 and that task is still open
- **THEN** Today still lists it with the chip `Started 21 Oct`

#### Scenario: Started and due later
- **WHEN** today is 2026-10-21 and a task has the start `2026-10-21` and is due 2026-10-24
- **THEN** it is listed in Today and under 24 October in Upcoming

### Requirement: Someday
A task whose start is `someday` SHALL be parked: absent from Today, Upcoming, Anytime and the sidebar counts, listed in the Someday view and in its project's or the Inbox's Later group with a "Someday" chip. Parking from the app SHALL clear the due date in the same batch; giving a parked task a due or start date from the app SHALL un-park it in the same batch. A parked task dated by another client SHALL stay parked, except that a due date or deadline today or earlier puts it in Today.

#### Scenario: Park a scheduled task
- **WHEN** the user parks a task due 2026-10-16 with `every week` in Someday
- **THEN** in one batch the task's start becomes `someday`, its due date and rule are cleared, and it leaves Upcoming and appears in the Someday view

#### Scenario: Un-park by scheduling
- **WHEN** the user sets a due date on a parked task
- **THEN** in one batch the due date is written and the start becomes null, and the task returns to Upcoming or Today

#### Scenario: Park offline on two devices
- **WHEN** device A parks a task while device B, offline, moves its due date, and both sync
- **THEN** every device holds the start and the due value from the later edit of each field, and the task is shown as parked when the start is `someday`

#### Scenario: Parked in a shared project
- **WHEN** a member of a shared project parks one of its tasks
- **THEN** every member sees it parked after sync, because the start is a task field

### Requirement: Someday view
The client SHALL provide a Someday view, reachable from the sidebar and with `g` then `o`, listing every open parked task grouped by project with Inbox first and the standard task rows, rendered from local data. A task added from the Someday view with quick add SHALL be parked unless the line sets a date.

#### Scenario: Open Someday offline
- **WHEN** the device is offline and the user presses `g` then `o`
- **THEN** the parked tasks are listed by project from local data

#### Scenario: Capture in Someday
- **WHEN** the user adds `Learn Portuguese` in the Someday view
- **THEN** the task is created parked, in the Inbox, and stays in the view

### Requirement: Anytime view
The client SHALL provide an Anytime view, reachable from the sidebar and with `g` then `n`, listing every open task that is not parked, not deferred, has no due date and no start date, grouped by project with Inbox first, rendered from local data. The Anytime view SHALL leave out tasks of archived projects like the other cross-project views.

#### Scenario: Undated and active
- **WHEN** an open task has no due date and no start, and another is deferred, and a third is due tomorrow
- **THEN** Anytime lists only the first

#### Scenario: Results follow sync
- **WHEN** Anytime is open and another device gives a listed task a due date, then this device syncs
- **THEN** the task leaves the view without a reload

### Requirement: This Evening
In Today, tasks of today's group with `evening` set SHALL be listed under a **This Evening** heading after the other tasks of the day; overdue tasks SHALL stay in Overdue. Elsewhere an evening task SHALL show an evening chip. The flag SHALL be independent of the due time and SHALL be kept when the task is rescheduled.

#### Scenario: Evening group
- **WHEN** Today has three tasks due today, one of them with evening set, and no overdue task
- **THEN** the two others are listed first and the evening task under "This Evening"

#### Scenario: Rescheduled evening task
- **WHEN** an evening task due today is moved to tomorrow
- **THEN** it keeps the evening flag, shows the evening chip under Tomorrow in Upcoming, and returns to This Evening the next day

#### Scenario: Toggle offline
- **WHEN** the device is offline and the user toggles This Evening on a task due today
- **THEN** the task moves between the groups at once and the change uploads on the next sync

### Requirement: Setting when from the panel and the keyboard
The detail panel SHALL set the start inside the When popover: a Start segment offering Anytime (no start), a start date through the same date field and calendar as the due date, and Someday, with the Evening toggle in the Do on segment; a task with a start SHALL show it as a part of the When line reading "from" with a future date, "since" with a past date, or "Someday". Viewers SHALL see the values as text. The date field SHALL refuse a start after the due date with a message and leave the task unchanged.

#### Scenario: Start after due refused
- **WHEN** a task is due 2026-10-16 and the user types `2026-10-21` into its start date field
- **THEN** the field says the start must be on or before the due date and the task's start is unchanged

#### Scenario: Start from the When control
- **WHEN** the user opens the Do on part of a task, switches to Start and picks a date next week
- **THEN** the popover closes on Done, the When line reads the due date and "from" with the start date, and no separate Start line exists in the panel

#### Scenario: Start in the past
- **WHEN** a task's start was two days ago
- **THEN** the When line reads "since" with that date

#### Scenario: Parked task
- **WHEN** a task is parked in Someday
- **THEN** the When line reads "Someday" and the Start segment shows Someday selected

### Requirement: Start shortcuts in a list
In a list, `n` SHALL park or un-park the selected task, `Shift+N` SHALL open the inline start date field and `Shift+E` SHALL toggle This Evening.

#### Scenario: Defer from the list
- **WHEN** a task is selected, focus is not in a text field, and the user presses `Shift+N`, types `21/10` (with a day-month date format) and Enter
- **THEN** the task's start is `2026-10-21` and the row shows `Starts 21 Oct`

#### Scenario: Park with the keyboard
- **WHEN** a task is selected in a project view and the user presses `n`
- **THEN** the task moves to the Later group as parked, and pressing `n` again returns it to the active list with no due date

### Requirement: Start segment quick choices
The Start segment of the When popover SHALL offer the quick choices Today, Tomorrow, Next week and Someday, each with the date it means (none for Someday), followed by the same worded date field and visible month calendar as the Do on segment. An empty start SHALL read "No start date", not a bare word before an empty field. Choosing Someday SHALL park the task exactly as the Someday control does today.

#### Scenario: Start next week
- **WHEN** the user opens the Start segment and chooses Next week
- **THEN** the task's start is the first day of next week in the user's week setting, and the When line reads "from" with that date

#### Scenario: Park from the segment
- **WHEN** the user chooses Someday in the Start segment
- **THEN** the task is parked in Someday and the When line reads "Someday"

#### Scenario: Empty start
- **WHEN** a task has no start date and the user opens the Start segment
- **THEN** the segment reads "No start date" above the quick choices, and no choice is selected
