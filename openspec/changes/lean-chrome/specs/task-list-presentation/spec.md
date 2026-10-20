# Spec Delta

## MODIFIED Requirements

### Requirement: Nothing between the header and the list
Above the first task of a list there SHALL be at most the page header and the quick add, and the quick add SHALL end at its field and its preview chips: no help link, hint line or note under it. Filters (duration, labels, assignee), layout switches, disclosures, sort notes, promotions, help links and first-run guidance SHALL live in the page header, its menus, the overflow, the Help panel or an overlay, never as rows above or inside the list. A list with no task SHALL show its empty view (see "Empty views") in the place of the rows, with nothing between the quick add and it. This is presentation only and behaves the same offline.

#### Scenario: First task on a phone
- **WHEN** the Inbox with eight tasks opens on a 390×844 screen with the keyboard closed
- **THEN** at least four tasks are visible without scrolling

#### Scenario: Filter affordance
- **WHEN** the user activates Filter in the page header of Today and chooses "Quick wins"
- **THEN** the list is filtered and one active chip with a clear control appears in the header, not above the list

#### Scenario: No help row under the quick add
- **WHEN** a new browser opens the Inbox and has never added a task
- **THEN** the page shows the header, the quick add and the first task, and the only Help control on the page is the header's Help action

#### Scenario: First visit on a fresh account
- **WHEN** an account opens the Inbox for the first time
- **THEN** the list page holds the header, the quick add and the empty view only; the start guide is an overlay over it

## ADDED Requirements

### Requirement: Empty views
A view with nothing to list SHALL show one empty view, centred in the content column: one sentence, one primary action, and at most one secondary text link; no icon, no second sentence, no second button, no printed key hint. The action's key, when it has one, SHALL be in its tooltip on fine-pointer devices only. Each view's copy is a scenario below. The empty view SHALL be one region with the sentence as its heading, reads local data (so it is the same offline) and writes nothing.

#### Scenario: Inbox
- **WHEN** the Inbox has no open task
- **THEN** it reads "Your Inbox is empty." with "Add a task", which focuses the quick add (the quick-add sheet on a phone), and no link

#### Scenario: Empty Today on a phone
- **WHEN** Today has no tasks on a touch device
- **THEN** it reads "Nothing due today." with an "Add a task" button and an "Open Upcoming" link, no icon and no key hint, and the button opens the quick-add sheet

#### Scenario: Empty Today on a desktop
- **WHEN** Today has no tasks on a desktop with a mouse
- **THEN** the same sentence, button and link are shown, no hint is printed, and hovering or focusing the button shows "Press q"

#### Scenario: Everything waits
- **WHEN** Today has three tasks that are all blocked by other tasks
- **THEN** it reads "Nothing is ready to start today." with "Add a task" and the link "3 waiting for other tasks", which opens Waiting

#### Scenario: Upcoming, Anytime, Someday
- **WHEN** Upcoming, Anytime or Someday has no task
- **THEN** it reads "Nothing scheduled yet.", "Nothing waiting for a free moment." or "Nothing parked for later." with "Add a task" (the view's defaults applied) and no link

#### Scenario: Assigned to me
- **WHEN** nothing is assigned to the user
- **THEN** it reads "Nothing is assigned to you." with "Open Inbox"

#### Scenario: Next and Waiting
- **WHEN** no project has a next action, or nothing is waiting
- **THEN** Next reads "Add a next step to a project." with "Walk your projects", and Waiting reads "Nothing is waiting on anyone." with "Open Next"

#### Scenario: Project
- **WHEN** a project in the list layout has no open task
- **THEN** it reads "This project has no open tasks." with "Add a task", or "Open Inbox" when the project is read-only for the user

#### Scenario: Project with completed tasks only
- **WHEN** a project's tasks are all completed and its Completed group is off
- **THEN** the empty view offers the link "Show 4 completed", which turns the Completed group on

#### Scenario: Label
- **WHEN** no open task carries the label
- **THEN** it reads "No open task carries this label." with "Add a task" (the label applied)

#### Scenario: Filters
- **WHEN** a filter query, a saved filter or the duration filter matches no task
- **THEN** it reads "No task matches this filter." with "Clear the filter", "No task matches this view." with "Edit the view", or "No task matches this duration filter." with "Clear the filter"

#### Scenario: Completed has no quick add
- **WHEN** Completed is empty
- **THEN** it reads "Nothing completed yet." with "Open Today" and no "Add a task"

#### Scenario: Trash
- **WHEN** the Trash is empty
- **THEN** it reads "The Trash is empty." with one "Open Inbox" button and nothing else

#### Scenario: Calendar day
- **WHEN** a day of the Day view, the week's agenda or the month's day list has nothing planned
- **THEN** it reads "Nothing planned." with "Add a task", which opens quick add with that day as the date

#### Scenario: Inbox triage
- **WHEN** triage runs out of Inbox tasks
- **THEN** it reads "Inbox zero: every task has a place." with "Back to the Inbox"

#### Scenario: Gone target is not an empty view
- **WHEN** a project or label route names one that no longer exists
- **THEN** the page keeps its own note with the way back, not an empty view

#### Scenario: A task arrives
- **WHEN** the Inbox shows its empty view and another device captures a task, which syncs
- **THEN** the empty view is replaced by the task's row without a reload
