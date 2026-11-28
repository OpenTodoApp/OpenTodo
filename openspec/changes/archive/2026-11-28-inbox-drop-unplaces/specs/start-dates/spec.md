## MODIFIED Requirements

### Requirement: Someday view
The client SHALL provide a Someday view, reachable from the sidebar and with `g` then `o`, listing every open parked task grouped by project with the tasks without a project first, under the heading OpenSpec `project-organization` "Move to the Inbox" gives them ("No project", since a parked task is not in the Inbox) and the standard task rows, rendered from local data. A task added from the Someday view with quick add SHALL be parked unless the line sets a date.

#### Scenario: Open Someday offline
- **WHEN** the device is offline and the user presses `g` then `o`
- **THEN** the parked tasks are listed by project from local data

#### Scenario: Capture in Someday
- **WHEN** the user adds `Learn Portuguese` in the Someday view
- **THEN** the task is created parked, without a project, and stays in the view

### Requirement: Anytime view
The client SHALL provide an Anytime view, reachable from the sidebar and with `g` then `n`, listing every open task that is not parked, not deferred, has no due date, no start date and no time sector (OpenSpec `time-sectors`), grouped by project with the tasks without a project first, under the heading OpenSpec `project-organization` "Move to the Inbox" gives them, rendered from local data. The Anytime view SHALL leave out tasks of archived projects like the other cross-project views.

#### Scenario: Undated and active
- **WHEN** an open task has no due date and no start, and another is deferred, and a third is due tomorrow
- **THEN** Anytime lists only the first

#### Scenario: Results follow sync
- **WHEN** Anytime is open and another device gives a listed task a due date, then this device syncs
- **THEN** the task leaves the view without a reload

#### Scenario: A sectored task is not Anytime
- **WHEN** an open task without a date has the sector This week
- **THEN** Anytime does not list it, and it leaves the view when the sector is set on another device and this device syncs
