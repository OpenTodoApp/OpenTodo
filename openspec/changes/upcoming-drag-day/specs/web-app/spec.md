# Spec Delta

## ADDED Requirements

### Requirement: Move a task to another day in Upcoming
In Upcoming the client SHALL let the user drag a task onto another day's group, its heading or any of its tasks, and SHALL then move the task to that day, with the same gestures as manual order: a mouse or pen drag, and on a touch screen a press and hold on the task before moving it; Escape cancels. The group under the pointer SHALL show that it takes the drop. The move SHALL follow the calendar's move to another day (Week, Month and Plan), one rule for both: the due date moves to the new day and keeps its time, and a due fixed to a time zone keeps that zone. The date that moves SHALL be the one that lists the task under its day: a multi-day task moves whole, its start and due by the same days; a task without a due date that Upcoming lists under its deadline moves its deadline and gets no due date; a deferred task without a project or due date moves its start. A repeating task moves its current occurrence as a single date change does. A drop on the task's own day SHALL change nothing, since Upcoming's order is fixed. A task the user may only view (a shared project where they are a viewer) SHALL NOT be picked up, and a drop never changes it. Each move SHALL be one change with the Undo toast, applied locally at once; offline it is queued and reaches other devices after the next sync, and concurrent edits converge per field as every task edit does.

With a task selected in Upcoming, Shift+← and Shift+→ SHALL move it a day earlier or later by the same rule, never before today; a task listed on an earlier day steps from today.

#### Scenario: Drop on another day keeps the time
- **WHEN** a task due tomorrow at 09:30 is dragged onto Saturday's group in Upcoming
- **THEN** it is due Saturday at 09:30, it is listed under Saturday at once, and a toast reads "Date changed" with Undo

#### Scenario: Undo
- **WHEN** the user activates Undo on that toast
- **THEN** the task is due tomorrow at 09:30 again

#### Scenario: Deadline-only task
- **WHEN** a task without a due date is listed under Friday because its deadline is Friday, and it is dropped on Sunday
- **THEN** its deadline is Sunday, it has no due date, and it is listed under Sunday

#### Scenario: Multi-day task
- **WHEN** a task spanning Thursday to Saturday is listed under Thursday and dropped on Friday
- **THEN** it spans Friday to Sunday

#### Scenario: Same day
- **WHEN** a task is dropped on its own day's group
- **THEN** nothing is written and no toast is shown

#### Scenario: Touch
- **WHEN** on a phone the user presses and holds a task in Upcoming, then moves it onto another day and lifts the finger
- **THEN** the task moves to that day as with a mouse; a swipe without the hold still scrolls the list

#### Scenario: Read-only task
- **WHEN** a task belongs to a shared project where the user is a viewer
- **THEN** its row cannot be dragged, and a drop that includes it leaves it unchanged

#### Scenario: Keys
- **WHEN** the selected task is due tomorrow at 14:00 and the user presses Shift+→
- **THEN** it is due the day after tomorrow at 14:00 and stays selected; Shift+← twice brings it to today, and a third Shift+← does nothing

#### Scenario: Offline
- **WHEN** the device is offline and the user drops a task on another day
- **THEN** the task moves at once and the change is sent with the next sync
