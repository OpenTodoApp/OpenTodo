# Spec Delta

## MODIFIED Requirements

### Requirement: Accepted import formats
The server SHALL import the app's own JSON export (`opentodo-export` version 1 and later), CSV with the documented column mapping, JSON exports of other task managers through named importer profiles, and the export files of named apps (`todoist-csv`, `todoist-backup`, `ticktick-csv`, `linear-csv`, `things-db`, `google-tasks-json`, `trello-json`, `asana-csv`, `microsoft-todo-json`, `apple-reminders-json`, `anydo-json`), all documented in `docs/import.md`. The format SHALL be detected from the file content and the detected format SHALL be shown and overridable before anything is written. A named format SHALL be detected only on a signature distinctive of that app's file, never on a product name alone, so that no file of one format is read as another and the generic JSON and CSV profiles keep every file they accepted before.

#### Scenario: Own export is detected
- **WHEN** a file whose top-level document carries `"format":"opentodo-export"` is uploaded for preview
- **THEN** the preview reports the format `opentodo` and the export version, and no profile choice is required

#### Scenario: CSV with documented columns
- **WHEN** a CSV file whose header row contains at least a `title` column is uploaded
- **THEN** the preview reports the format `csv`, lists recognised and ignored columns, and maps `project`, `section`, `parent`, `priority`, `due_date`, `due_time`, `labels`, `description`, `completed_at` and `created_at` when present

#### Scenario: Unrecognised file
- **WHEN** a file matches neither the own export, CSV, nor any importer profile or named app format
- **THEN** the preview is refused with a 400 `unsupported_format` error naming the formats that are supported

#### Scenario: A named app's export is detected
- **WHEN** a Todoist project CSV export is uploaded for preview without choosing a format
- **THEN** the preview reports the format `todoist-csv`, and the user can still choose another format before importing

#### Scenario: Six more apps are detected
- **WHEN** a Google Takeout `Tasks.json`, a Trello board JSON, an Asana project CSV, a Microsoft To Do Graph JSON, an Apple Reminders Shortcut JSON or an Any.do data-request JSON is uploaded for preview without choosing a format
- **THEN** the preview reports `google-tasks-json`, `trello-json`, `asana-csv`, `microsoft-todo-json`, `apple-reminders-json` or `anydo-json` respectively, and the format menu of the import screen lists each of them with the app's name

#### Scenario: Existing fixtures keep their format
- **WHEN** every fixture kept with the tests, including the generic JSON and CSV ones, is detected after the six formats are added
- **THEN** each is reported in the format it was reported in before, and the detection test names any fixture whose format changed

### Requirement: Named formats are verified against real exports
Each named app format SHALL be tested against at least one export file produced by that app from a real account, stripped of personal data and kept with the tests. For an app that has no export of its own (Microsoft To Do, Apple Reminders, Any.do), the file SHALL be one produced from a real account by the exact script, Shortcut or data request the switch guide describes, and `docs/import.md` SHALL say so next to the format. A change to a format's detection or mapping SHALL keep every such file importing with the same rows, warnings and errors unless the change states the difference.

#### Scenario: Regression on a real file
- **WHEN** a contributor changes the Todoist mapping so that a fixture's subtask becomes a top-level task
- **THEN** the importer tests fail and name the fixture and the row

#### Scenario: Scripted export is pinned like a built-in one
- **WHEN** a contributor changes how `microsoft-todo-json` reads `dueDateTime`
- **THEN** the golden preview of the sanitised file produced by the guide's script fails until the golden is updated with the stated difference

### Requirement: Linear attributes
A Linear issue SHALL be completed when it was completed or canceled, with canceled ones labelled `canceled`. Its priority (urgent, high, medium, low, none) SHALL map to p1, p2, p3, p4, p4. Labels, the due date and the Markdown description SHALL be kept, the description starting with the issue identifier, and the identifier SHALL also become the task's origin `{kind: "issue", provider: "linear", id: <identifier>}` without a URL, since the export carries none. An issue assigned to the importing user's email address SHALL stay assigned to them. An estimate SHALL become the value of a number field named "Estimate" on the issue's project, created by the import when the project has no number field of that name (see "Imported custom fields"). Cycles, milestones, relations other than "Blocked by", and other assignees SHALL be dropped with a warning.

#### Scenario: Canceled issue
- **WHEN** an issue's status is canceled
- **THEN** it is imported completed, with the label `canceled`

#### Scenario: Identifier kept
- **WHEN** issue `ENG-123` is imported
- **THEN** its description starts with `ENG-123` and its origin is `{kind: "issue", provider: "linear", id: "ENG-123"}`, shown as a chip reading "ENG-123" without a link

#### Scenario: Estimate becomes a field value
- **WHEN** a Linear CSV has issues with `Estimate` 3 and 5 in project "Launch", which has no field named "Estimate"
- **THEN** the preview counts one field definition to create, the import creates a number field "Estimate" on "Launch" and the two tasks carry the values 3 and 5, with no estimate warning

#### Scenario: Estimate field already exists
- **WHEN** the project the issues go to already has a number field named "Estimate"
- **THEN** no definition is created and the values are written to the existing field

### Requirement: Imported origins
A task imported from a Todoist, Things, TickTick, Google Tasks, Trello, Asana, Microsoft To Do, Apple Reminders or Any.do export SHALL carry the origin `{kind: "import", provider: <profile name>, id: <source id>}`, the same source id the importer records for duplicate detection, without a URL, the provider being the profile's short name (`todoist`, `things`, `ticktick`, `google-tasks`, `trello`, `asana`, `microsoft-todo`, `apple-reminders`, `anydo`). A Trello card SHALL carry its `shortUrl` as the origin's URL, since the export provides one. A task from a generic CSV or JSON file SHALL carry none. An own export SHALL carry each task's `origin` and the import of an own export SHALL restore it unchanged, so the round trip is equivalent. Origins are written in the import's operations, like every other field.

#### Scenario: TickTick task keeps its id
- **WHEN** a TickTick row with `taskId` `6f1a…` is imported
- **THEN** the task's origin is `{kind: "import", provider: "ticktick", id: "6f1a…"}` and `origin: ticktick` lists it

#### Scenario: Things item keeps its uuid
- **WHEN** a Things to-do with uuid `A1B2…` is imported
- **THEN** the task's origin is `{kind: "import", provider: "things", id: "A1B2…"}`

#### Scenario: Trello card keeps its link
- **WHEN** a Trello card with id `5f3a…` and `shortUrl` `https://trello.com/c/AbCd1234` is imported
- **THEN** the task's origin is `{kind: "import", provider: "trello", id: "5f3a…", url: "https://trello.com/c/AbCd1234"}` and the origin chip opens the card

#### Scenario: Google task keeps its id
- **WHEN** a Google Tasks item with `id` `MTIz…` is imported twice
- **THEN** the first import gives it the origin `{kind: "import", provider: "google-tasks", id: "MTIz…"}` and the second preview reports it as `skip` with reason `already_imported`

#### Scenario: Round trip keeps origins
- **WHEN** an export holding a task captured from a page, a task from email and an imported issue is imported into an empty account
- **THEN** a fresh export lists the three tasks with the same `origin` values as the file

#### Scenario: Generic file has none
- **WHEN** a generic CSV with a `title` column is imported
- **THEN** the created tasks have no origin, and the preview shows no origin column

#### Scenario: Offline device receives origins
- **WHEN** the import finishes while a device is offline and the device later syncs
- **THEN** the imported tasks arrive with their origins as ordinary operations and the chips show on that device

## ADDED Requirements

### Requirement: Imported custom fields
A named format whose rows carry typed values beyond the task model (Linear estimates, Asana custom field columns, Trello custom field items) SHALL import them as custom field values of the task's project: for each named value the import SHALL reuse the project's live field definition of that name and type when it exists, or create one (number for numbers, text for text, choice for a single-select value with the options the file shows, checkbox for booleans, date for a date) as part of the same job, so that undoing the import removes the definitions it created and nothing else. A value whose type does not match an existing definition of that name SHALL be dropped with a row warning naming the field. The preview SHALL count the definitions to create under `fields`. A project at its limit of definitions SHALL get no new definition and the row a warning. Tasks that end in the Inbox or in an existing project of another member SHALL receive no field values (a warning names them), since fields belong to a project. Definitions and values are written as operations in the import, applied on the server and reaching every device by sync, like every other imported entity.

#### Scenario: Asana number column
- **WHEN** an Asana CSV has a column "Effort" with the values 2 and 3.5 on two tasks of project "Website"
- **THEN** the import creates a number field "Effort" on "Website" and writes 2 and 3.5 to the two tasks, and the preview counted one definition

#### Scenario: Single-select column becomes a choice
- **WHEN** an Asana CSV column "Stage" holds the values `Draft`, `Review` and `Draft`
- **THEN** the import creates a choice field "Stage" with the options `Draft` and `Review` in first-seen order and writes each task's value

#### Scenario: Existing field of another type
- **WHEN** project "Website" already has a text field "Effort" and the file carries numbers under "Effort"
- **THEN** no definition is created, the values are dropped, and each row warns that "Effort" exists with another type

#### Scenario: Definition limit reached
- **WHEN** the target project already has 30 live field definitions and the file carries a new column
- **THEN** the rows warn that the field cannot be created, the tasks are still imported without that value, and no definition is written

#### Scenario: Undo removes created definitions
- **WHEN** an import that created two field definitions is undone
- **THEN** the definitions and the tasks are removed as one undo, and a definition that existed before the import is untouched

### Requirement: Google Tasks structure
A Google Takeout `Tasks.json` SHALL be recognised by its top-level `items` array of lists each holding `kind` `tasks#taskList` and an `items` array of `tasks#task` objects. Each list SHALL become a project (a list titled "My Tasks" or `@default` SHALL go to the target project, Inbox by default), and an item whose `parent` names another item SHALL become that item's subtask. Items with `deleted` or `hidden` set and a completed status older than the export SHALL still be imported as completed tasks, so a history of done tasks is kept; items with `deleted` true SHALL be skipped with a note counting them.

#### Scenario: Lists and subtasks
- **WHEN** `Tasks.json` has a list "Groceries" with an item "Fruit" and an item "Apples" whose `parent` is "Fruit"
- **THEN** the project "Groceries" is created with "Fruit" as a task and "Apples" as its subtask

#### Scenario: Default list
- **WHEN** a list is titled "My Tasks" and the user chose no target project
- **THEN** its items go to the Inbox and the preview notes it

### Requirement: Google Tasks attributes and dates
A Google Tasks item SHALL keep its `title`, its `notes` as the description, its `status` (`completed` with `completed` as the completion time), and its `due` as a floating due date without a time (Google Tasks stores dates at midnight UTC; the date part SHALL be used as written, never shifted by the import's time zone). A `links` entry SHALL become a link attachment. Google Tasks has no priority, labels or recurrence in the file, so none are produced and nothing is warned.

#### Scenario: Due date is not shifted
- **WHEN** an item has `due` `2026-11-03T00:00:00.000Z` and the import's time zone is `America/Los_Angeles`
- **THEN** the task is due on 2026-11-03 without a time

#### Scenario: Completed item
- **WHEN** an item has `status` `completed` and `completed` `2026-10-01T09:12:00.000Z`
- **THEN** the task is imported completed at that instant

#### Scenario: Malformed item
- **WHEN** an item has no `title` or its `due` is not a timestamp
- **THEN** the row without a title is an error naming the list and position, a bad `due` is a warning and the task is imported without a due date, and with `skip_rows` the rest of the file is still imported

### Requirement: Trello structure
A Trello board JSON export SHALL be recognised by its top-level `id`, `name`, `lists`, `cards` and `checklists` keys. The board SHALL become one project, each open list a section in the board's order (so the project opens as a board on the importing device), each card a task in its list's section, each checklist item a subtask (checked items completed), and the board's labels labels. Cards and lists that are `closed` (archived) SHALL be imported completed and placed in their section; a `closed` list's cards SHALL keep the list as their section. A ZIP of several board exports SHALL be imported as one job.

#### Scenario: Lists become board columns
- **WHEN** a board "Renovation" has lists "To do", "Doing" and "Done" with cards in each
- **THEN** the project "Renovation" has those three sections in that order, each with its cards, and opens as a board on the importing device

#### Scenario: Checklist becomes subtasks
- **WHEN** a card has a checklist "Steps" with two items, one `complete`
- **THEN** the task has two subtasks, one completed

#### Scenario: Archived card
- **WHEN** a card is `closed`
- **THEN** it is imported completed, in its list's section, and the preview counts it as completed

### Requirement: Trello attributes and dates
A Trello card SHALL keep its `name` as the title, its `desc` as the description, its labels (by name; a label with a colour and no name SHALL be named after the colour), its `due` as a floating due date with a time converted from UTC to the import's time zone, `dueComplete` as completed, `start` as the start date, and `dateLastActivity` ignored. Comment actions (`commentCard`) in the export SHALL be appended to the description under a "Comments" heading with their author's name and date, because their authors cannot be kept. Attachments with a URL SHALL become link attachments; uploaded files SHALL be dropped with a warning. Members SHALL be dropped with a warning unless the card's member is the importing user's full name or username, in which case the task stays assigned to them. Custom field items with a number, text, checkbox or list value SHALL become custom field values ("Imported custom fields"). The card's `shortUrl` SHALL be the origin's URL.

#### Scenario: Due with a time
- **WHEN** a card has `due` `2026-11-05T17:00:00.000Z` and the import's time zone is `Europe/Rome`
- **THEN** the task is due 2026-11-05 at 18:00

#### Scenario: Comments kept as text
- **WHEN** a card has two `commentCard` actions
- **THEN** the description ends with a "Comments" heading and one line per comment with the author's name and date, and the row warns once that comment authors cannot be kept

#### Scenario: File attachment dropped
- **WHEN** a card has an attachment that is an uploaded file and another that is a link
- **THEN** the link becomes a link attachment and the file is dropped with a warning naming it

### Requirement: Asana structure
An Asana project CSV export SHALL be recognised by a header containing `Task ID`, `Created At`, `Completed At`, `Last Modified`, `Name`, `Section/Column`, `Assignee`, `Due Date` and `Parent task`. The file's rows SHALL go to one project named after the file (an archive entry's name without its extension) or the target project, `Section/Column` SHALL become sections in first-seen order (and the project opens as a board on the importing device when the file names a column for every task), and a row whose `Parent task` names another row's `Name` SHALL become that row's subtask. The optional `Projects` column SHALL be shown as a note and not create projects, since one file is one project.

#### Scenario: Sections and subtasks
- **WHEN** a CSV has rows in "Backlog" and "In progress", one row with `Parent task` "Write brief"
- **THEN** the project has the two sections and the row is a subtask of "Write brief"

#### Scenario: Parent not in the file
- **WHEN** a row's `Parent task` names no row of the file
- **THEN** the task is imported at the top level with a warning naming the parent

### Requirement: Asana attributes and dates
An Asana row SHALL keep `Name` as the title, `Notes` as the description, `Tags` as labels, `Due Date` as a floating due date (a `Due Time` or a time in the value in the import's time zone when present), `Start Date` as the start date, `Completed At` as completed at that instant, `Created At` as the creation time, and `Priority` (High, Medium, Low) as p1, p2, p3 when the column exists as Asana's built-in field. `Assignee` SHALL be kept only when it is the importing user's email address, otherwise dropped with a warning. Every other column not in the documented list SHALL be treated as a custom field column ("Imported custom fields"): numeric values as a number field, `Yes`/`No` as a checkbox, dates as a date field, at most ten distinct text values across the file as a choice field, otherwise a text field. `Blocked By (Dependencies)` SHALL become dependencies on rows of the same file. Rows with an `Assignee Email` or `Collaborators` column SHALL drop those with a warning.

#### Scenario: Custom column becomes a field
- **WHEN** a CSV has a column "Budget" with numeric values
- **THEN** a number field "Budget" is created on the project and each task carries its value

#### Scenario: Dependencies in the file
- **WHEN** a row's `Blocked By (Dependencies)` names "Order paint" and that row exists in the file
- **THEN** the task waits for the "Order paint" task

#### Scenario: Unreadable date
- **WHEN** a row's `Due Date` is `soon`
- **THEN** the task is imported without a due date and the row warns quoting the value

### Requirement: Microsoft To Do structure
Microsoft To Do has no export of its own. The `microsoft-todo-json` format SHALL read a JSON document holding the Microsoft Graph To Do shape, as written by the script in the switch guide: an array (or a `value` array) of `todoTaskList` objects, each with `displayName`, `wellknownListName` and a `tasks` array of `todoTask` objects (`id`, `title`, `body`, `importance`, `status`, `dueDateTime`, `startDateTime`, `completedDateTime`, `createdDateTime`, `reminderDateTime`, `recurrence`, `categories`, `checklistItems`, `linkedResources`). It SHALL be recognised by the presence of `wellknownListName` or of a task with `importance` and `dueDateTime`. Each list SHALL become a project (the `defaultList` SHALL go to the target project, Inbox by default; the `flaggedEmails` list SHALL become a project "Flagged emails"), each task a task, each checklist item a subtask. The guide SHALL also say that the Outlook data export's tasks file is read when it holds the same objects.

#### Scenario: Lists and checklist items
- **WHEN** the file has a list "Home" with a task "Fix tap" holding two `checklistItems`, one `isChecked`
- **THEN** the project "Home" has the task with two subtasks, one completed

#### Scenario: Default list
- **WHEN** a list has `wellknownListName` `defaultList`
- **THEN** its tasks go to the target project (Inbox by default) and the preview notes it

#### Scenario: Not a To Do file
- **WHEN** a JSON array of objects has neither `wellknownListName` nor tasks with `importance`
- **THEN** it is not detected as `microsoft-todo-json` and the generic JSON profiles decide as before

### Requirement: Microsoft To Do attributes and dates
A To Do task SHALL keep its `title`, its `body.content` as the description (HTML converted to plain text), `importance` `high` as p1, `normal` as p4 and `low` as p4, `status` `completed` with `completedDateTime` as the completion, `categories` as labels, a `linkedResources` entry with a `webUrl` as a link attachment (and, when it is the only one, as the task's origin URL), and `dueDateTime` as a floating due date: Graph writes due dates as midnight in the `timeZone` the object names, so the date part SHALL be taken in that zone and no time set; a `reminderDateTime` SHALL become an absolute reminder at that instant in its named zone. `recurrence` (`pattern` and `range`) SHALL become a rule where the grammar expresses it (daily, weekly on days, monthly on a day, yearly) and otherwise a warning. `startDateTime` SHALL become the start date. Attachments other than links SHALL be dropped with a warning.

#### Scenario: Due date in a named zone
- **WHEN** a task has `dueDateTime` `{dateTime: "2026-11-03T00:00:00.0000000", timeZone: "Pacific Standard Time"}`
- **THEN** the task is due on 2026-11-03 without a time, whatever the import's time zone

#### Scenario: Weekly recurrence
- **WHEN** a task's `recurrence.pattern` is `{type: "weekly", interval: 1, daysOfWeek: ["monday", "wednesday"]}`
- **THEN** the task gets the rule `every monday, wednesday`

#### Scenario: Reminder kept
- **WHEN** a task has `reminderDateTime` `{dateTime: "2026-11-03T09:00:00.0000000", timeZone: "W. Europe Standard Time"}` and `isReminderOn` true
- **THEN** the task has an absolute reminder at 09:00 Central European Time on that day

### Requirement: Apple Reminders file
Apple Reminders has no export of its own. The `apple-reminders-json` format SHALL read the JSON the switch guide's Shortcut writes: an array of objects with `list`, `title`, `notes`, `dueDate`, `isCompleted`, `completionDate`, `creationDate`, `priority`, `flagged`, `tags`, `url`, `identifier`, `parent` and `subtasks` (an array of the same shape), recognised by the presence of `identifier` and `isCompleted` on every object. Each distinct `list` SHALL become a project ("Reminders", the default list, SHALL go to the target project), each object a task, `subtasks` and `parent` references subtasks. The switch guide SHALL say first that a CalDAV connection to the server moves the same data without a file, and present the Shortcut for people who want a one-time copy.

#### Scenario: Lists and subtasks
- **WHEN** the file has reminders in lists "Groceries" and "Work", one with two `subtasks`
- **THEN** two projects are created and the reminder has two subtasks

#### Scenario: Partial Shortcut output
- **WHEN** an object lacks `identifier` or `isCompleted`
- **THEN** the file is not detected as `apple-reminders-json`, and when the format is chosen by hand the row is an error naming the missing key

### Requirement: Apple Reminders attributes and dates
A reminder SHALL keep its `title`, `notes` as the description, `priority` (Apple's 1 high, 5 medium, 9 low, 0 none) as p1, p2, p3, p4, `flagged` as the label `flagged`, `tags` as labels, `url` as a link attachment, `isCompleted` with `completionDate` as the completion, `creationDate` as the creation time, and `dueDate` as a floating due date with its time when the Shortcut wrote one (an all-day reminder has no time). Dates are written by Shortcuts in the device's zone as ISO 8601 with an offset and SHALL be converted to the import's time zone. Repeat rules and location or message triggers are not in the Shortcut output and SHALL be named in the guide as not carried.

#### Scenario: Priority mapping
- **WHEN** a reminder has `priority` 1
- **THEN** the task is p1

#### Scenario: Timed reminder
- **WHEN** a reminder has `dueDate` `2026-11-03T17:30:00+01:00` and the import's time zone is `Europe/Rome`
- **THEN** the task is due 2026-11-03 at 17:30

### Requirement: Any.do file
Any.do has no export of its own. The `anydo-json` format SHALL read the JSON of Any.do's account data request (Settings → Privacy → Request my data), recognised by top-level `categories` and `tasks` arrays whose tasks carry `categoryId`, `globalTaskId` (or `id`) and `status`. Each category SHALL become a project (the category marked `isDefault` SHALL go to the target project), each task a task, a task whose `parentGlobalTaskId` names another a subtask. `docs/import.md` SHALL state that this file was verified on the fixture obtained through that request and that Any.do may change it without notice.

#### Scenario: Categories and subtasks
- **WHEN** the file has categories "Personal" and "Work" and a task whose `parentGlobalTaskId` names another task
- **THEN** two projects are created and the task is a subtask of the named one

#### Scenario: Not an Any.do file
- **WHEN** a JSON document has `tasks` but no `categories` array or no `categoryId` on its tasks
- **THEN** it is not detected as `anydo-json` and the generic JSON profiles decide as before

### Requirement: Any.do attributes and dates
An Any.do task SHALL keep its `title`, its `note` as the description, `priority` `High` as p1 and `Normal` as p4, `status` `CHECKED` or `DONE` as completed (`DELETED` skipped with a count), `dueDate` (Unix milliseconds) as a floating due date in the import's time zone, with its time unless it falls on midnight, `repeatingMethod` (`TASK_REPEAT_DAY`, `_WEEK`, `_MONTH`, `_YEAR`) as a rule, `tags` as labels, `alert` as an absolute reminder, and `creationDate` as the creation time. Shared-list members, attachments and the "moment" plan SHALL be dropped with a warning when present.

#### Scenario: Due at midnight is a date
- **WHEN** a task's `dueDate` is midnight of 2026-11-03 in the import's time zone
- **THEN** the task is due 2026-11-03 without a time

#### Scenario: Weekly repeat
- **WHEN** a task has `repeatingMethod` `TASK_REPEAT_WEEK`
- **THEN** the task gets the rule `every week` from its due date
