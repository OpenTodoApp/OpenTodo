## MODIFIED Requirements

### Requirement: Standard views
The client SHALL provide Inbox (the Inbox tasks of OpenSpec `project-organization`, "Inbox is the default container": open, without a project and not scheduled), Today (open tasks due today or earlier, with overdue tasks grouped first), Upcoming (open tasks due after today grouped by date), Completed (completed tasks newest first, grouped by the day they were completed), and one view per project (its open tasks). Under its header the Inbox SHALL show one quiet line "N planned tasks without a project" while at least one open scheduled task without a project exists; activating it SHALL open the Filter view with the query `no project`. When quick add in the Inbox creates a task that is scheduled (its line sets a date, a start or Someday), the client SHALL announce where it went (for example "Added to Friday") with a control that opens that view, instead of leaving the user to wonder why it did not appear. "Today" in these views is the user's logical today (OpenSpec `date-time-preferences`, "Logical today"): the calendar date, or the previous one while the local time is before the user's day start.

#### Scenario: Overdue grouping
- **WHEN** Today is opened and there are tasks due before today
- **THEN** they are listed under an "Overdue" heading above today's tasks

#### Scenario: Upcoming grouping
- **WHEN** Upcoming is opened
- **THEN** tasks are grouped by due date with "Tomorrow" and weekday headings in ascending order

#### Scenario: Today after midnight with a day start
- **WHEN** the user's day start is `04:00`, it is 01:30 on Thursday, and tasks are due on Wednesday and on Thursday
- **THEN** Today lists Wednesday's tasks under "Today" and none under "Overdue", and Upcoming lists Thursday's under "Tomorrow"

#### Scenario: Where planned tasks went
- **WHEN** the user has 3 tasks without a project that are due later this week and opens the Inbox
- **THEN** the Inbox does not list them, the line "3 planned tasks without a project" is shown under the header, and activating it opens Filter with `no project` listing them

#### Scenario: Quick add with a date in the Inbox
- **WHEN** the user types `Call the bank friday` in the Inbox quick add and presses Enter
- **THEN** the task is created due Friday without a project, it is not listed in the Inbox, and an announcement reads "Added to Friday" with a control that opens Upcoming at Friday
