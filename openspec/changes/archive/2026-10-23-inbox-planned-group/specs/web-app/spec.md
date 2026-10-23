## MODIFIED Requirements

### Requirement: Standard views
The client SHALL provide Inbox (the Inbox tasks of OpenSpec `project-organization`, "Inbox is the default container": open, without a project and not scheduled), Today (open tasks due today or earlier, with the tasks due before today grouped first under "Earlier"), Upcoming (open tasks due after today grouped by date), Completed (completed tasks newest first, grouped by the day they were completed), and one view per project (its open tasks). The Inbox list SHALL end with a group "Planned, no project" with its count while at least one open scheduled task without a project exists. The group SHALL be folded by default, and whether it is open SHALL be remembered on the device; open, it SHALL list those tasks as ordinary rows (open, complete, act on them, drag them onto a project), ordered by their do-on date, then their start date, with Someday last. Its header SHALL offer "Open as filter", which opens the Filter view with the query `no project`. The group SHALL NOT count as part of the Inbox: the Inbox's empty state, Process the Inbox and its count read only the Inbox's own tasks, and with only planned tasks left the Inbox shows its empty state with the folded group below it. The group is derived from synced task fields, so it shows the same tasks on every device once they have synced, and offline it shows what the device holds. When quick add in the Inbox creates a task that is scheduled (its line sets a date, a start or Someday), the client SHALL announce where it went (for example "Added to Friday") with a control that opens that view, instead of leaving the user to wonder why it did not appear. "Today" in these views is the user's logical today (OpenSpec `date-time-preferences`, "Logical today"): the calendar date, or the previous one while the local time is before the user's day start.

The Earlier group of Today SHALL carry two actions in its header, visible at all times: **Move all to today**, which sets today as the due date of every task in the group keeping each task's time of day, and **Reschedule…**, which opens the date choices of the bulk Actions menu (today, tomorrow, next week, pick a date) and applies the choice to every task in the group. Both SHALL write one batch with the Undo toast of bulk actions, apply locally at once, work offline and converge per task and field. A task in the group because of a past deadline only SHALL get a due date and keep its deadline; a repeating task SHALL move its occurrence as a single date change does. The same two actions SHALL be command palette commands, "Move earlier tasks to today" and "Reschedule earlier tasks…", offered while Today's Earlier group is not empty, with no key of their own.

#### Scenario: Overdue grouping
- **WHEN** Today is opened and there are tasks due before today
- **THEN** they are listed under an "Earlier" heading above today's tasks (the group is named Earlier; "overdue" is not a word of the interface, see `task-list-presentation` "Words for tasks that are late")

#### Scenario: Move all to today
- **WHEN** Earlier holds a task due Monday at 09:30 and a task due Tuesday without a time, and the user activates "Move all to today"
- **THEN** both are due today, the first at 09:30, they join today's group at once, the Earlier group is gone, and a toast reads "2 tasks moved to today" with Undo

#### Scenario: Reschedule offline
- **WHEN** the device is offline and the user chooses Reschedule… → Tomorrow on an Earlier group of four tasks
- **THEN** the four tasks are due tomorrow at once, leave Today, are queued as one batch and reach the other devices after the next sync

#### Scenario: Undo
- **WHEN** the user moved three earlier tasks to today and activates Undo within ten seconds
- **THEN** each task has its previous due date again and is back in Earlier, as one batch

#### Scenario: Deadline-only task
- **WHEN** Earlier holds a task with no due date whose deadline was yesterday and the user activates "Move all to today"
- **THEN** the task is due today and its deadline is unchanged

#### Scenario: Palette command
- **WHEN** Earlier holds two tasks and the user opens the command palette and types "earlier"
- **THEN** "Move earlier tasks to today" and "Reschedule earlier tasks…" are offered, and neither is offered while Earlier is empty

#### Scenario: Upcoming grouping
- **WHEN** Upcoming is opened
- **THEN** tasks are grouped by due date with "Tomorrow" and weekday headings in ascending order

#### Scenario: Today after midnight with a day start
- **WHEN** the user's day start is `04:00`, it is 01:30 on Thursday, and tasks are due on Wednesday and on Thursday
- **THEN** Today lists Wednesday's tasks under "Today" and none under "Earlier", and Upcoming lists Thursday's under "Tomorrow"

#### Scenario: Where planned tasks went
- **WHEN** the Inbox holds two tasks and three tasks without a project are due later this week
- **THEN** the Inbox lists its two tasks, then a folded group "Planned, no project" with the count 3; opening it lists the three tasks in place, and its "Open as filter" opens Filter with `no project`

#### Scenario: Inbox zero with planned tasks
- **WHEN** every task without a project has a date, a start date or Someday
- **THEN** the Inbox shows its empty state and Process the Inbox is not offered, with the folded group "Planned, no project" below it

#### Scenario: The group remembers being opened
- **WHEN** the user opens the group, leaves the Inbox and comes back on the same device
- **THEN** the group is still open; on another device it is folded until opened there
#### Scenario: Quick add with a date in the Inbox
- **WHEN** the user types `Call the bank friday` in the Inbox quick add and presses Enter
- **THEN** the task is created due Friday without a project, it is not listed in the Inbox, and an announcement reads "Added to Friday" with a control that opens Upcoming at Friday
