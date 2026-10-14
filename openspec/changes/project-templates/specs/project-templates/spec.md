# Spec Delta

## Purpose

Lets a user duplicate a project or a task tree, save a project as a template file, and start a project from a template file, so repeated work (a trip checklist, a client onboarding, a method set-up from the website) is created in one step with fresh ids and dates shifted to a start day.

## ADDED Requirements

### Requirement: What a copy carries
A duplicate or a project started from a template SHALL contain the source's projects (the project, its note, colour and sub-projects), sections, open tasks and their open subtasks with title, description, note, priority, estimate, labels, recurrence rule and due date, and section placement, under new ids and in the same relative order. Completed tasks, occurrence records, deleted items, assignees, comments and reminders SHALL NOT be copied. Labels SHALL be matched by name ignoring case and created when missing.

#### Scenario: Open tasks and structure
- **WHEN** a project with sections "Before" and "During", a completed task, an open task with two subtasks (one completed) and a recurring task is duplicated
- **THEN** the copy has both sections, the open task with its one open subtask in the same section, and the recurring task with its rule, and no completed task

#### Scenario: Labels by name
- **WHEN** a template uses a label "errand" and the account has a label "Errand"
- **THEN** the created tasks carry the existing "Errand" label and no new label is created

#### Scenario: Shared source makes a personal copy
- **WHEN** an editor duplicates a shared project whose tasks are assigned to other members
- **THEN** the copy is an unshared project of the editor with no assignees, and the shared project is unchanged

### Requirement: Dates shift relative to a start day
Every copy SHALL offer a start day. When one is chosen, every due date in the copy SHALL move by the same number of days: the source's reference day lands on the start day, where the reference day is the template file's declared day, else the day the file was exported, else the earliest due date of the copied tasks. Times and zones SHALL be kept. Without a start day, dates SHALL be copied as they are. Tasks without a due date SHALL stay undated.

#### Scenario: Duplicate with a start day
- **WHEN** a project whose earliest task is due 2026-10-01 and another 2026-10-04 is duplicated with start day 2026-11-10
- **THEN** the copies are due 2026-11-10 and 2026-11-13

#### Scenario: Template from the website
- **WHEN** a template exported on 2026-10-14 holds tasks due 2026-10-14 and 2026-10-21, and the user starts it on 2026-12-01
- **THEN** the tasks are due 2026-12-01 and 2026-12-08, and a task with a time keeps its time

#### Scenario: Keep dates
- **WHEN** a task tree is duplicated without choosing a start day
- **THEN** every copied task has the same due date as its original

### Requirement: Copies are operations that work offline
A duplicate or an instantiated template SHALL be written as one batch of ordinary operations, applied on the device at once, queued for upload while offline, and SHALL converge on every device under per-field last-writer-wins. The batch SHALL be refused on the device, with nothing written, when it would exceed the device-side limit of one thousand tasks; the message SHALL point to the Import screen for larger files.

#### Scenario: Offline duplicate
- **WHEN** the device is offline and the user duplicates a project with forty tasks
- **THEN** the copy appears in the sidebar immediately with all forty tasks, and it reaches the user's other devices after the next sync

#### Scenario: Two devices duplicate the same project
- **WHEN** two devices duplicate the same project while offline and both sync
- **THEN** every device shows two copies, each complete, and the original is unchanged

#### Scenario: Too large
- **WHEN** a template file holds 1,500 tasks
- **THEN** "From a template" refuses it before writing anything and names the Import screen as the way to load it

### Requirement: Duplicate a project
The project menu SHALL offer "Duplicate…", reachable by keyboard, for a project the user may read. It SHALL ask for a name (default: the source name followed by "copy"), an optional parent project and an optional start day, then create the copy and open it. The copy SHALL be placed last among its siblings.

#### Scenario: Duplicate from the menu
- **WHEN** the user opens the project menu of "Trip to Rome", chooses Duplicate… and confirms the defaults
- **THEN** a project "Trip to Rome copy" with the same note, sections and open tasks opens, listed after the user's other top-level projects

#### Scenario: Viewer may duplicate
- **WHEN** a viewer of a shared project chooses Duplicate…
- **THEN** a personal copy is created for the viewer and nothing is written to the shared project

### Requirement: Duplicate a task tree
The task panel's actions menu SHALL offer "Duplicate", and <kbd>Shift</kbd>+<kbd>D</kbd> on a selected task in a list SHALL do the same, for a task the user may edit. The copy and its open subtasks SHALL be placed directly after the original in the same project, section and parent, with the same title, and the copy SHALL become the selected task.

#### Scenario: Keyboard duplicate
- **WHEN** a task with three open subtasks is selected and the user presses <kbd>Shift</kbd>+<kbd>D</kbd>
- **THEN** a copy with three subtasks appears directly below the original, in the same section, and is selected

#### Scenario: Viewer cannot duplicate a task
- **WHEN** a viewer of a shared project presses <kbd>Shift</kbd>+<kbd>D</kbd> on a task
- **THEN** nothing is written and the Duplicate action is absent from the task menu

### Requirement: Save a project as a template file
The project menu SHALL offer "Save as template…", which SHALL produce on the device, without a server round trip, a file in the own export format (`opentodo-export`, version 1) holding the project tree, its sections, its open tasks and the labels they use, with an additional top-level `template` object naming the reference day, and offer it as a download. Dates SHALL be written as they are. For an encrypted account the dialog SHALL say that the file is not encrypted.

#### Scenario: File contents
- **WHEN** the user saves "Trip to Rome" as a template on 2026-10-14
- **THEN** the downloaded file has `format: "opentodo-export"`, `version: 1`, `template.day: "2026-10-14"`, the project, its sections, its open tasks and only the labels those tasks use, and no completed task, assignee, comment or reminder

#### Scenario: Offline save
- **WHEN** the device is offline and the user saves a project as a template
- **THEN** the file is produced from local data and downloaded

#### Scenario: Encrypted account
- **WHEN** a user with end-to-end encryption saves a template
- **THEN** the file holds readable text and the dialog says so before the download

### Requirement: Start a project from a template file
The sidebar SHALL offer "From a template…", reachable by keyboard, which SHALL accept a template file (the own export format, with or without a `template` object), show what it holds (projects, sections, tasks, labels, how many tasks are dated), ask for a start day and an optional parent, and create the contents as a copy under the rules of this capability. A file that is not an own export SHALL be refused with a message naming the Import screen.

#### Scenario: Website template
- **WHEN** the user picks the website's "Trip planning" download, keeps the start day at today and confirms
- **THEN** the template's project opens with its sections and tasks, dated tasks shifted to count from today, and the labels it declares exist once

#### Scenario: Wrong file
- **WHEN** the user picks a CSV file
- **THEN** nothing is created and the dialog says the file is not an OpenTodo template and that CSV files go through Settings → Data → Import

#### Scenario: Reusable
- **WHEN** the same template file is started twice
- **THEN** two complete projects exist, with different ids, and neither was skipped as existing
