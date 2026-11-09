## MODIFIED Requirements

### Requirement: Deferred tasks
A task whose start is a date after the viewer's local date SHALL be deferred: absent from Today, Upcoming, Anytime and the sidebar counts, and listed in its project view under **Later** with a "Starts" chip showing the date: in a list grouped by section, in its own section after that section's active tasks, under a Later heading that is folded by default and shows its count, its open state remembered per device; otherwise in one Later group after the other tasks. In the project view a subtask SHALL be listed with its top-level task (OpenSpec `subtasks` "Subtasks in a project's Later group"): the subtasks of a deferred top-level task are in its Later under it, and a deferred subtask of an active parent stays under that parent. A deferred task without a project is not an Inbox task (OpenSpec `project-organization`); when it also has no do-on date it SHALL be listed in Upcoming under its start date with the "Starts" chip, so it is always reachable. A deferred task drawn as a span (OpenSpec `multi-day-tasks`) SHALL be listed in Upcoming once, under its start date, with its range chip. A task due or with a deadline today or earlier SHALL be in Today regardless of its start. Deferral SHALL be computed on the device from local data and SHALL change on the start day without any write.

#### Scenario: Deferred until next week
- **WHEN** today is 2026-10-14 and an open task without a project has the start `2026-10-21` and no due date
- **THEN** it is absent from Today, Anytime and the Inbox, the Inbox count does not include it, and Upcoming lists it under 21 October with `Starts 21 Oct`

#### Scenario: Deferred with a later due date
- **WHEN** a task is due 2026-10-24 with the start `2026-10-21` and today is 2026-10-14
- **THEN** Upcoming does not list it, and its project view shows it under Later

#### Scenario: Deferred parent with subtasks
- **WHEN** a top-level task with two open subtasks gets the start `2026-10-21` and today is 2026-10-14
- **THEN** its project view lists it under Later with both subtasks indented beneath it

#### Scenario: Hard date wins
- **WHEN** a task with the start `2026-10-21` has the deadline `2026-10-14` and today is 2026-10-14
- **THEN** it is listed in Today with its deadline countdown

#### Scenario: Start day arrives offline
- **WHEN** the device is offline and the local date advances to the task's start date
- **THEN** the task leaves Later and appears in Today without a reload or a write

#### Scenario: Deferred span in Upcoming
- **WHEN** a task is a span from 2026-10-21 to 2026-10-24 and today is 2026-10-14
- **THEN** Upcoming lists it under 21 October with `21–24 Oct` and not under 24 October, and its project view shows it under Later

#### Scenario: Deferred in a section
- **WHEN** today is 2026-10-14 and, in the project "Home" listed by section, the section "Garden" holds "Water plants" and "Paint the fence" with the start `2026-10-21`
- **THEN** "Garden" lists "Water plants", then a folded "Later" heading with "1" inside the section, and no Later group is added at the end of the list; opening it shows "Paint the fence" with `Starts 21 Oct`, and it stays open on this device

### Requirement: Someday
A task whose start is `someday` SHALL be parked: absent from Today, Upcoming, Anytime and the sidebar counts, listed in the Someday view and in its project's Later (in a list grouped by section, its own section's Later, as in "Deferred tasks") with a "Someday" chip; in the project view a subtask SHALL be listed with its top-level task (OpenSpec `subtasks` "Subtasks in a project's Later group"). A parked task without a project is not an Inbox task (OpenSpec `project-organization`). Parking from the app SHALL clear the due date in the same batch; giving a parked task a due or start date from the app SHALL un-park it in the same batch. A parked task dated by another client SHALL stay parked, except that a due date or deadline today or earlier puts it in Today.

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

### Requirement: Start shortcuts in a list
In a list, `n` SHALL park or un-park the selected task, `Shift+N` SHALL open the inline start date field and `Shift+E` SHALL toggle This Evening.

#### Scenario: Defer from the list
- **WHEN** a task is selected, focus is not in a text field, and the user presses `Shift+N`, types `21/10` (with a day-month date format) and Enter
- **THEN** the task's start is `2026-10-21` and the row shows `Starts 21 Oct`

#### Scenario: Park with the keyboard
- **WHEN** a task is selected in a project view and the user presses `n`
- **THEN** the task moves to the Later group as parked, and pressing `n` again returns it to the active list with no due date

#### Scenario: Park in a section with the keyboard
- **WHEN** a task is selected in a section of a project listed by section and the user presses `n`
- **THEN** the task leaves the section's active tasks for that section's folded Later, whose count rises by one
