## MODIFIED Requirements

### Requirement: Todoist structure
A Todoist export SHALL map each project file to a project, section rows to sections, and task rows to tasks nested by their indent level into subtasks. Note rows SHALL become comments on the task right above them ("Todoist notes as comments").

#### Scenario: Nested tasks and sections
- **WHEN** a Todoist CSV contains a section row followed by a task at indent 1 and a task at indent 2
- **THEN** the first task is in that section and the second is its subtask

#### Scenario: Board projects stay boards
- **WHEN** a Todoist project file's meta row says `view_style=board` and the import is committed from the web app
- **THEN** that project opens as a board on the importing device, and other devices keep their own choice

## ADDED Requirements

### Requirement: Todoist notes as comments
Each `note` row of a Todoist CSV, read alone or from the backup ZIP, SHALL become a comment on the task right above it, authored by the importing account, in the file's order, and SHALL NOT be added to the task's description. The comment's body SHALL start with a line naming the note's original author in bold and its time in UTC, `**<author>** · <YYYY-MM-DD HH:MM> UTC`, then a blank line and the note's text. The author SHALL be the `AUTHOR` column without its trailing account id (`Pete (14148749)` is `Pete`) and the time the `DATE` column, an ISO 8601 instant. A missing author SHALL leave only the time, a missing or unreadable date only the author, and with neither the body SHALL be the note's text alone. One import SHALL create at most 5,000 comments; a note past that SHALL be appended to its task's description under a "Comments" heading instead. A note whose comment body would exceed the size limit of a comment body SHALL be posted without its first line, and one too long even alone SHALL be cut to fit at a character boundary and end in "…". The preview SHALL carry one file-level note with the count of notes added to descriptions and of comments cut. An import's comments SHALL NOT count against the per-account comment creation limit, and every other writer's comments SHALL. Undo SHALL remove the comments the import created, and importing the same file again SHALL create none. The comments are written as ops through the op log, so they reach every device on its next sync, offline devices included, and converge like any comment. This applies to the Todoist CSV only: the Todoist API import, other apps' exports and the own export keep their behaviour.

#### Scenario: Notes become comments with their author and time
- **WHEN** a Todoist task row is followed by a note by `Pete (14148749)` dated `2023-11-01T16:08:26.405000Z` and a second note without a date, and the import is committed
- **THEN** the task has two comments by the importing account, in that order, the first starting with `**Pete** · 2023-11-01 16:08 UTC` and the second with `**Pete**`, each followed by a blank line and the note, and the task's description has no "Comments" heading

#### Scenario: More notes than one import creates
- **WHEN** a Todoist backup has 5,002 notes
- **THEN** the first 5,000 become comments, the last two are appended to their task's description under "Comments", and the preview has one note saying that 2 notes were added to their tasks' description

#### Scenario: A note too long for a comment
- **WHEN** a note is larger than a comment body may be
- **THEN** it becomes a comment cut to fit and ending in "…", the task's description is unchanged, the task's other notes become comments, and the preview has one note saying that 1 comment was cut to fit

#### Scenario: Not limited like a device
- **WHEN** a Todoist backup with 100 notes is imported while the account's comment limit is 60 a minute
- **THEN** all 100 comments are created, and a device of the account can still create its 60 comments in that minute and is refused the 61st with reason `rate_limited`

#### Scenario: Importing again and undoing
- **WHEN** the same backup is imported a second time, and the first import is then undone
- **THEN** the second import creates no comment, and Undo removes the comments the first one created
