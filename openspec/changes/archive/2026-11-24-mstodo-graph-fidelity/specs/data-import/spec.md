## MODIFIED Requirements

### Requirement: Microsoft To Do structure
Microsoft To Do has no export of its own. The `microsoft-todo-json` format SHALL read a JSON document holding the Microsoft Graph To Do shape, as written by the script in the switch guide: an array (or a `value` array) of `todoTaskList` objects, each with `displayName`, `wellknownListName` and a `tasks` array of `todoTask` objects (`id`, `title`, `body`, `importance`, `status`, `dueDateTime`, `startDateTime`, `completedDateTime`, `createdDateTime`, `reminderDateTime`, `recurrence`, `categories`, `checklistItems`, `linkedResources`). It SHALL be recognised by the presence of `wellknownListName` or of a task with `importance` and `dueDateTime`. Each list SHALL become a project (the `defaultList` SHALL go to the target project, Inbox by default; the `flaggedEmails` list SHALL become a project "Flagged emails"; `none`, `unknownFutureValue` and any other value SHALL become a project of the list's name), each task a task, each checklist item a subtask with its `createdDateTime`. A list with `isShared` true SHALL add a preview note saying it is imported as the user's own project. The guide SHALL also say that the Outlook data export's tasks file is read when it holds the same objects. The import writes through operations like every other import, so offline devices converge on the imported entities when they next sync.

#### Scenario: Lists and checklist items
- **WHEN** the file has a list "Home" with a task "Fix tap" holding two `checklistItems`, one `isChecked`
- **THEN** the project "Home" has the task with two subtasks, one completed

#### Scenario: Default list
- **WHEN** a list has `wellknownListName` `defaultList`
- **THEN** its tasks go to the target project (Inbox by default) and the preview notes it

#### Scenario: Not a To Do file
- **WHEN** a JSON array of objects has neither `wellknownListName` nor tasks with `importance`
- **THEN** it is not detected as `microsoft-todo-json` and the generic JSON profiles decide as before

#### Scenario: Shared list
- **WHEN** a list "Family" has `isShared` true
- **THEN** the project "Family" is created and the preview notes that the list is shared in To Do and is imported as the user's own project

### Requirement: Microsoft To Do attributes and dates
A To Do task SHALL keep its `title`, its `body.content` as the description (HTML converted to plain text: comments and the head, style, script and template elements are removed with their content, list items become `- ` lines, other tags are removed and entities decoded last), `importance` `high` as p1, `normal` as p4 and `low` as p4, `status` `completed` with `completedDateTime` as the completion, `categories` as labels, a `linkedResources` entry with a `webUrl` as a link attachment (and, when it is the only one, as the task's origin URL) and one without `webUrl` dropped with a warning, and `dueDateTime` and `startDateTime` as floating dates without a time: To Do stores the local midnight of the chosen day and Graph usually returns it converted to UTC (15 April at UTC+2 is `2023-04-14T22:00:00` UTC), so a midnight in a named zone other than UTC SHALL be taken as that day, and any other value SHALL be converted from its `timeZone` into the import's time zone and rounded to the nearest midnight there; a zone the server does not know SHALL fall back to the written date; a `reminderDateTime` SHALL become an absolute reminder at that instant in its named zone. The statuses `notStarted`, `inProgress`, `waitingOnOthers` and `deferred` SHALL be open tasks; any other status SHALL be an open task with a warning. `recurrence` (`pattern` and `range`) SHALL become the rule that gives the same dates where the grammar expresses it: `daily`, `weekly` on days, `absoluteMonthly`, `relativeMonthly` on one weekday or on Monday to Friday, `absoluteYearly` and `relativeYearly`, each with its `interval` where the grammar has one, and a range of type `endDate` as `until` and `numbered` as `for N times`; any other pattern SHALL be a warning and no rule, and a range end the rule cannot carry SHALL be dropped with a warning, keeping the rule. A completed task SHALL carry no rule, since To Do keeps the repeat on the open task it created. `startDateTime` SHALL become the start date. Attachments other than links SHALL be dropped with a warning.

#### Scenario: Due date in a named zone
- **WHEN** a task has `dueDateTime` `{dateTime: "2026-11-03T00:00:00.0000000", timeZone: "Pacific Standard Time"}`
- **THEN** the task is due on 2026-11-03 without a time, whatever the import's time zone

#### Scenario: Due date returned in UTC
- **WHEN** a task has `dueDateTime` `{dateTime: "2023-04-14T22:00:00.0000000", timeZone: "UTC"}` and the import's time zone is Europe/Berlin (or UTC)
- **THEN** the task is due on 2023-04-15 without a time

#### Scenario: Weekly recurrence
- **WHEN** a task's `recurrence.pattern` is `{type: "weekly", interval: 1, daysOfWeek: ["monday", "wednesday"]}`
- **THEN** the task gets the rule `every monday, wednesday`

#### Scenario: Reminder kept
- **WHEN** a task has `reminderDateTime` `{dateTime: "2026-11-03T09:00:00.0000000", timeZone: "W. Europe Standard Time"}` and `isReminderOn` true
- **THEN** the task has an absolute reminder at 09:00 Central European Time on that day

#### Scenario: Nth weekday of the month
- **WHEN** a task due 2026-11-12 has `recurrence.pattern` `{type: "relativeMonthly", interval: 1, daysOfWeek: ["thursday"], index: "second"}`
- **THEN** the task gets the rule `every 2nd thursday` and the row has no warning

#### Scenario: Every two weeks until a date
- **WHEN** a task due 2026-11-02 has `pattern` `{type: "weekly", interval: 2, daysOfWeek: ["monday", "thursday"]}` and `range` `{type: "endDate", endDate: "2027-06-30"}`
- **THEN** the task gets the rule `every 2 weeks on monday, thursday until 2027-06-30`

#### Scenario: Pattern the grammar cannot say
- **WHEN** a task's pattern is `{type: "relativeMonthly", daysOfWeek: ["monday", "friday"], index: "first"}`
- **THEN** the task is imported without a rule and the row warns quoting the pattern

#### Scenario: Outlook HTML body
- **WHEN** a task's `body` is `{contentType: "html"}` holding a document with a `<style>` block, a comment, a `<script>` element and a list
- **THEN** the description holds the visible text with the list items as `- ` lines, and none of the CSS, the comment or the script

#### Scenario: Outlook status
- **WHEN** a task has `status` `waitingOnOthers`
- **THEN** it is imported as an open task without a warning, and a task with `status` `paused` is an open task with a warning naming the status

#### Scenario: Completed repeating task
- **WHEN** a task has `status` `completed` and a daily `recurrence`
- **THEN** it is imported completed and without a rule
