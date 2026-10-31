## MODIFIED Requirements

### Requirement: Deferred tasks
A task whose start is a date after the viewer's local date SHALL be deferred: absent from Today, Upcoming, Anytime and the sidebar counts, and listed in its project view in a **Later** group after the other tasks with a "Starts" chip showing the date. A deferred task without a project is not an Inbox task (OpenSpec `project-organization`); when it also has no do-on date it SHALL be listed in Upcoming under its start date with the "Starts" chip, so it is always reachable. A deferred task drawn as a span (OpenSpec `multi-day-tasks`) SHALL be listed in Upcoming once, under its start date, with its range chip. A task due or with a deadline today or earlier SHALL be in Today regardless of its start. Deferral SHALL be computed on the device from local data and SHALL change on the start day without any write.

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

#### Scenario: Deferred span in Upcoming
- **WHEN** a task is a span from 2026-10-21 to 2026-10-24 and today is 2026-10-14
- **THEN** Upcoming lists it under 21 October with `21–24 Oct` and not under 24 October, and its project view shows it under Later

### Requirement: Started tasks in Today
A task whose start is a date on or before the viewer's local date SHALL be active: listed in Today's group, after tasks due today, with a "Started" chip when the start date is past, until it is completed, parked, deferred again or its start is cleared. A task drawn as a span (OpenSpec `multi-day-tasks`) SHALL show the chip "until" with its do-on date instead of the "Started" chip. The sidebar's Today count SHALL include it. A started task with a later due date SHALL also keep its place in Upcoming, except a span, which Upcoming lists only under its start date.

#### Scenario: On the start day
- **WHEN** today is 2026-10-21 and an open task with no due date has the start `2026-10-21`
- **THEN** Today lists it in today's group and the Today count includes it

#### Scenario: Still open days later
- **WHEN** today is 2026-10-24 and that task is still open
- **THEN** Today still lists it with the chip `Started 21 Oct`

#### Scenario: Started and due later
- **WHEN** today is 2026-10-21 and a task has the start `2026-10-21` and is due 2026-10-24
- **THEN** it is listed in Today and under 24 October in Upcoming

#### Scenario: Span under way
- **WHEN** today is 2026-10-22 and a task is a span from 2026-10-21 to 2026-10-24
- **THEN** Today lists it with the chip `until 24 Oct` and Upcoming does not list it under 24 October
