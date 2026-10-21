## MODIFIED Requirements

### Requirement: Deferred tasks
A task whose start is a date after the viewer's local date SHALL be deferred: absent from Today, Upcoming, Anytime and the sidebar counts, and listed in its project view in a **Later** group after the other tasks with a "Starts" chip showing the date. A deferred task without a project is not an Inbox task (OpenSpec `project-organization`); when it also has no do-on date it SHALL be listed in Upcoming under its start date with the "Starts" chip, so it is always reachable. A task due or with a deadline today or earlier SHALL be in Today regardless of its start. Deferral SHALL be computed on the device from local data and SHALL change on the start day without any write.

#### Scenario: Deferred until next week
- **WHEN** today is 2026-10-14 and an open task without a project has the start `2026-10-21` and no due date
- **THEN** it is absent from Today, Anytime and the Inbox, the Inbox count does not include it, and Upcoming lists it under 21 October with `Starts 21 Oct`

#### Scenario: Deferred with a later due date
- **WHEN** a task is due 2026-10-24 with the start `2026-10-21` and today is 2026-10-14
- **THEN** Upcoming does not list it, and its project view shows it under Later

#### Scenario: Hard date wins
- **WHEN** a task with the start `2026-10-21` has the deadline `2026-10-14` and today is 2026-10-14
- **THEN** it is listed in Today with its deadline countdown

#### Scenario: Start day arrives offline
- **WHEN** the device is offline and the local date advances to the task's start date
- **THEN** the task leaves Later and appears in Today without a reload or a write

### Requirement: Someday
A task whose start is `someday` SHALL be parked: absent from Today, Upcoming, Anytime and the sidebar counts, listed in the Someday view and in its project's Later group with a "Someday" chip; a parked task without a project is not an Inbox task (OpenSpec `project-organization`). Parking from the app SHALL clear the due date in the same batch; giving a parked task a due or start date from the app SHALL un-park it in the same batch. A parked task dated by another client SHALL stay parked, except that a due date or deadline today or earlier puts it in Today.

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
