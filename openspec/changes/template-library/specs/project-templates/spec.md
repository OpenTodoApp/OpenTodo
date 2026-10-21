## MODIFIED Requirements

### Requirement: Dates shift relative to a start day
Every copy SHALL offer a start day. When one is chosen, every due date in the copy SHALL move by the same number of days: the source's reference day lands on the start day, where the reference day is the template file's declared day, else the day the file was exported, else the earliest due date of the copied tasks. A template from the library SHALL carry relative offsets instead of dates, and each offset SHALL be counted from the start day (`+0d` is the start day, `+1w` seven days later, `+1m` the same day of the next month, or its last day when that month is shorter). Times and zones SHALL be kept. Without a start day, dates SHALL be copied as they are, and a library template SHALL count from today. Tasks without a due date SHALL stay undated.

#### Scenario: Duplicate with a start day
- **WHEN** a project whose earliest task is due 2026-10-01 and another 2026-10-04 is duplicated with start day 2026-11-10
- **THEN** the copies are due 2026-11-10 and 2026-11-13

#### Scenario: Template from the website
- **WHEN** a template exported on 2026-10-14 holds tasks due 2026-10-14 and 2026-10-21, and the user starts it on 2026-12-01
- **THEN** the tasks are due 2026-12-01 and 2026-12-08, and a task with a time keeps its time

#### Scenario: Keep dates
- **WHEN** a task tree is duplicated without choosing a start day
- **THEN** every copied task has the same due date as its original

#### Scenario: Library offsets
- **WHEN** the user starts a library template whose tasks have offsets `+0d`, `+2d` and `+1m` on start day 2026-01-31
- **THEN** the tasks are due 2026-01-31, 2026-02-02 and 2026-02-28

## ADDED Requirements

### Requirement: Start a project from a template
The sidebar SHALL offer "From a template…", reachable by keyboard and from the command palette, which SHALL open on the template library (see `template-library`) and SHALL also offer **Upload a file…** in the same dialog. A file SHALL be accepted when it is a template file (the own export format, with or without a `template` object). For a library template or an accepted file the dialog SHALL show what it holds (projects, sections, tasks, labels, how many tasks are dated), ask for a start day and an optional parent, and create the contents as a copy under the rules of this capability: one batch of operations, applied on the device at once, queued while offline and converging on every device like any copy. A file that is not an own export SHALL be refused with a message naming the Import screen.

#### Scenario: Website template
- **WHEN** the user picks the website's "Trip planning" download through **Upload a file…**, keeps the start day at today and confirms
- **THEN** the template's project opens with its sections and tasks, dated tasks shifted to count from today, and the labels it declares exist once

#### Scenario: Library template
- **WHEN** the user opens "From a template…", chooses "Trip planning" in the library and confirms the start day
- **THEN** the same project, sections, tasks and labels are created as from the file, without any download or upload

#### Scenario: Offline library start
- **WHEN** the device is offline and the user starts "Moving house" from the library
- **THEN** the project appears at once with its tasks and reaches the user's other devices after the next sync

#### Scenario: Wrong file
- **WHEN** the user picks a CSV file through **Upload a file…**
- **THEN** nothing is created and the dialog says the file is not an OpenTodo template and that CSV files go through Settings → Data → Import

#### Scenario: Reusable
- **WHEN** the same template is started twice, from the library or from a file
- **THEN** two complete projects exist, with different ids, and neither was skipped as existing

## REMOVED Requirements

### Requirement: Start a project from a template file
**Reason**: Replaced by "Start a project from a template", which opens on the template library and keeps uploading a file as a second way in.
**Migration**: The file path keeps working unchanged under **Upload a file…** in the same dialog; existing files are accepted as before.
