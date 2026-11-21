## MODIFIED Requirements

### Requirement: Deferred tasks
A task whose start is a date after the viewer's local date SHALL be deferred: absent from Today, Upcoming, Anytime and the sidebar counts, and listed in its project view under **Later** with a "Starts" chip, except a task drawn as a span (below) showing the date: in a list grouped by section, in its own section after that section's active tasks, under a Later heading that is folded by default and shows its count, its open state remembered per device; otherwise in one Later group after the other tasks. In the project view a subtask SHALL be listed with its top-level task (OpenSpec `subtasks` "Subtasks in a project's Later group"): the subtasks of a deferred top-level task are in its Later under it, and a deferred subtask of an active parent stays under that parent. A deferred task without a project is not an Inbox task (OpenSpec `project-organization`); when it also has no do-on date it SHALL be listed in Upcoming under its start date with the "Starts" chip, so it is always reachable. A deferred task drawn as a span (OpenSpec `multi-day-tasks`) SHALL be listed in Upcoming once, under its start date, with its range chip, and in its project view SHALL stay among its section's active tasks (or the list's, without sections) with its range chip, never under Later; it is still absent from Today, Anytime and the sidebar counts until its first day. A task due or with a deadline today or earlier SHALL be in Today regardless of its start. Deferral SHALL be computed on the device from local data and SHALL change on the start day without any write.

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
- **THEN** Upcoming lists it under 21 October with `21–24 Oct` and not under 24 October, and its project view lists it among its section's tasks with `21–24 Oct`, not under Later

#### Scenario: Deferred in a section
- **WHEN** today is 2026-10-14 and, in the project "Home" listed by section, the section "Garden" holds "Water plants" and "Paint the fence" with the start `2026-10-21`
- **THEN** "Garden" lists "Water plants", then a folded "Later" heading with "1" inside the section, and no Later group is added at the end of the list; opening it shows "Paint the fence" with `Starts 21 Oct`, and it stays open on this device

#### Scenario: A span in a section
- **WHEN** today is 2026-11-19 and, in the project "Trip" listed by section, the section "Booking" holds "Call the hotel" and "Conference" as a span from 2026-11-24 to 2026-11-26
- **THEN** "Booking" lists "Call the hotel" and "Conference" with `24–26 Nov`, with no Later heading, and neither Today nor the sidebar counts include "Conference" before the 24th

#### Scenario: A start without a span still defers
- **WHEN** today is 2026-11-19 and "Renew passport" in the section "Booking" has the start `2026-11-24` and the do-on date `2026-11-30`, without span
- **THEN** it is under the section's folded Later with `Starts 24 Nov`, as before
