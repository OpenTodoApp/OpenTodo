## MODIFIED Requirements

### Requirement: Empty views
A view with nothing to list SHALL show one empty view, centred in the content column: one sentence, at most one primary action, and at most one secondary text link; no icon, no second sentence, no second button, no printed key hint. The action's key, when it has one, SHALL be in its tooltip on fine-pointer devices only. A list that shows its own quick-add field above the empty view SHALL offer no "Add a task" button: the field is the way to add, and `q` still focuses it (or opens the quick-add sheet on a touch device). Each view's copy is a scenario below. The empty view SHALL be one region with the sentence as its heading, reads local data (so it is the same offline) and writes nothing.

#### Scenario: Inbox
- **WHEN** the Inbox has no open task
- **THEN** it reads "Inbox zero: every task has a place." with no button and no link, under the Inbox's quick add

#### Scenario: Empty Today on a phone
- **WHEN** Today has no tasks on a touch device
- **THEN** it reads "Nothing due today." with an "Open Upcoming" link, no button and no key hint, and the quick add above it stays the way to add

#### Scenario: Empty Today on a desktop
- **WHEN** Today has no tasks on a desktop with a mouse
- **THEN** the same sentence and link are shown, no button and no hint, and `q` focuses the quick add

#### Scenario: Everything waits
- **WHEN** Today has three tasks that are all blocked by other tasks
- **THEN** it reads "Nothing is ready to start today." with the link "3 waiting for other tasks", which opens Waiting, and no button

#### Scenario: Upcoming, Anytime, Someday
- **WHEN** Upcoming, Anytime or Someday has no task
- **THEN** it reads "Nothing scheduled yet.", "Nothing waiting for a free moment." or "Nothing parked for later." with no button and no link

#### Scenario: Assigned to me
- **WHEN** nothing is assigned to the user
- **THEN** it reads "Nothing is assigned to you." with "Open Inbox"

#### Scenario: Next and Waiting
- **WHEN** no project has a next action, or nothing is waiting
- **THEN** Next reads "Add a next step to a project." with "Walk your projects", and Waiting reads "Nothing is waiting on anyone." with "Open Next"

#### Scenario: Project
- **WHEN** a project in the list layout has no open task
- **THEN** it reads "This project has no open tasks." with no button, or with "Open Inbox" when the project is read-only for the user (it has no quick add)

#### Scenario: Project with completed tasks only
- **WHEN** a project's tasks are all completed and its Completed group is off
- **THEN** the empty view offers the link "Show 4 completed", which turns the Completed group on

#### Scenario: Label
- **WHEN** no open task carries the label
- **THEN** it reads "No open task carries this label." with no button; the label's quick add above applies the label

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
- **WHEN** the Day view or the month's day list has nothing planned for its day
- **THEN** it reads "Nothing planned." with "Add a task", which opens quick add with that day as the date

#### Scenario: Empty days of the week agenda and Plan
- **WHEN** a day of the week agenda or of Plan has nothing planned
- **THEN** that day shows one quiet line, "Nothing planned." in the faint tone with a ghost "Add a task" that opens quick add with that day as the date, and not an empty view, so an empty week does not repeat seven empty views

#### Scenario: Inbox triage
- **WHEN** triage runs out of Inbox tasks
- **THEN** it reads "Inbox zero: every task has a place." with "Back to the Inbox"

#### Scenario: Gone target is not an empty view
- **WHEN** a project or label route names one that no longer exists
- **THEN** the page keeps its own note with the way back, not an empty view

#### Scenario: A task arrives
- **WHEN** the Inbox shows its empty view and another device captures a task, which syncs
- **THEN** the empty view is replaced by the task's row without a reload

#### Scenario: Place
- **WHEN** no open task happens at a saved location
- **THEN** its page reads "No open task happens at this location." with no button

### Requirement: Words for tasks that are late
The web app, the Daily check, the Today display, the weekly review and the digest SHALL NOT use the word "overdue" or its translations for the user's tasks. A group of tasks whose day has passed SHALL be called "Earlier"; a count of them "n from earlier"; a sentence about them "still open from earlier". Measurements keep their words: Statistics' "completed late" and "slipped", and the deadline countdown's "nd over". The filter query keyword `overdue` and the REST API are unchanged. The one exception is the project health word Overdue (statistics "Project health"): it names the state of a project on All projects, not a group or count of the user's tasks. The words SHALL be translated in every interface language and checked by the translation check.

#### Scenario: Daily check
- **WHEN** the Daily check lists two tasks due before today
- **THEN** their group is labelled "Earlier" and nothing on the page reads "overdue"

#### Scenario: Weekly review's Look back
- **WHEN** Look back shows two tasks due before today
- **THEN** its note reads "2 from earlier" and the step reads as done once both have a new date or are completed

#### Scenario: Carry over in Close the day
- **WHEN** Carry over lists a task that was due on Monday
- **THEN** its row shows Monday's date in the danger tone and the step's text says "still open from earlier", not "overdue"

#### Scenario: Statistics keep their measurements
- **WHEN** Statistics shows "completed late 3" and "slipped 2"
- **THEN** both words are unchanged

#### Scenario: Query keyword unchanged
- **WHEN** the user enters `overdue & #Home` in the Filter view
- **THEN** the query runs as before and the results page's group labels do not read "Overdue"

#### Scenario: Project health is the exception
- **WHEN** a project has an open task due before today
- **THEN** All projects reads "Overdue · 1 late" for it, while Today, the Daily check and the weekly review still call that task's group "Earlier"
