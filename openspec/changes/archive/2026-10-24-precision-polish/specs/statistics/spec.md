## MODIFIED Requirements

### Requirement: Project health
The device SHALL work out one health word per live, unarchived project from the project's counted tasks (live, not a skipped habit occurrence, not a start guide sample, as in "Excluded rows"; in a shared project every member's tasks, since health describes the project, not the user), taking the first rule that holds: **Late** when an open task's deadline is before today, with the task's title when only one is, else how many; **Overdue** when an open task is due before today, with how many; **Quiet** when neither the project nor any of its tasks changed for 7 days, with the number of days; **On track** otherwise; and no word ("Nothing open") when no task is open. Open tasks SHALL include deferred and someday tasks. "Today" SHALL be the user's logical day, and a change SHALL be the newest timestamp in the synced row clocks, so every synced device shows the same words. Progress SHALL be completed tasks over completed and open tasks, counting a recurring series once through its open task. Like every statistic, health SHALL be computed on the device from local rows at the time it is shown, offline too, with no request, no write and nothing stored on the server.

#### Scenario: The first rule that holds
- **WHEN** a project has an open task whose deadline was last Friday and another open task due yesterday, and nothing in it changed for ten days
- **THEN** its health is Late, naming the task past its deadline

#### Scenario: A deadline today is not late
- **WHEN** a project's only open task has its deadline today and the project changed this morning
- **THEN** its health is On track

#### Scenario: Ticking a task wakes a quiet project
- **WHEN** a project reads "Quiet · 12 days" and the user completes one of its tasks
- **THEN** it reads On track at once, offline too

#### Scenario: Shared project
- **WHEN** a shared project's only late task is assigned to another member
- **THEN** the project reads Overdue for every member, while the user's own Statistics do not count that task

#### Scenario: Recurring series and samples
- **WHEN** a project holds a daily series completed on five days and the start guide's sample tasks
- **THEN** its progress counts the series once as open and the samples not at all

#### Scenario: Two devices agree
- **WHEN** two synced devices open All projects
- **THEN** they show the same health word and detail for every project, and only the "Updated" phrase may differ by the minute
