# task-list-presentation Specification

## Purpose
Defines how a task reads in every list and board: one row anatomy, one metadata language, one group header, how empty groups behave, density, and the feedback a user gets when completing or undoing an action.

## Requirements

### Requirement: One row anatomy
Every task list (Inbox, Today, Upcoming, Anytime, Someday, Assigned, Completed, projects, labels, filters, saved filters, dashboards, Trash) SHALL render tasks with the same row: a fixed 24 px leading slot (collapse chevron only when the task has children, otherwise empty), the checkbox, the title, and a metadata line shown only when there is metadata. The checkbox SHALL sit at the same horizontal position in every flat view and at the same position plus indentation in tree views.

#### Scenario: Same alignment across views
- **WHEN** the user moves between Today, the Inbox and a project without sections
- **THEN** the checkboxes of top-level tasks are at the same horizontal position in all three

#### Scenario: Single-line rows
- **WHEN** a task has no date, labels, estimate, subtasks, comments or attachments
- **THEN** its row is one line tall

### Requirement: Metadata language
Row metadata SHALL use three styles only: tone text for the date and the deadline (the deadline with its icon), label chips, and neutral chips for estimate, subtask progress, comment count, attachment count and project. Repeat and evening SHALL be a suffix of the date text, not separate glyphs. The project SHALL not be shown in the Inbox or inside that project's view. Counts SHALL use tabular figures, not a monospace face.

#### Scenario: Recurring evening task
- **WHEN** a task is due today, repeats every day and is marked for the evening
- **THEN** its metadata reads "Today · evening · repeats" in the date tone, with no separate icons

#### Scenario: Inbox rows
- **WHEN** the Inbox is shown
- **THEN** no row carries an "Inbox" chip

### Requirement: Group headers
Date groups, section groups, project groups and the "Later" group SHALL use one header: a title, a count, a collapse control, and trailing actions that appear on hover, focus or touch. Overdue keeps the danger tone. Collapse state SHALL be remembered per device.

#### Scenario: Collapse a date group
- **WHEN** the user collapses "Tomorrow" in Upcoming and reloads
- **THEN** "Tomorrow" stays collapsed on this device and shows its count

### Requirement: Empty groups
A group with no open tasks SHALL be hidden when it is generated (a date, "No section", "Later"), and SHALL show only its header when it is user-created (a section). A section whose tasks are all completed SHALL show "n completed" in its header with a control that reveals them.

#### Scenario: Done section
- **WHEN** a project's "Done" section holds two completed tasks and no open one
- **THEN** its header reads "Done · 2 completed" with a Show control, and no empty body is rendered

### Requirement: Nothing between the header and the list
Above the first task of a list there SHALL be at most the page header and the quick add. Filters (duration, labels, assignee), layout switches, disclosures, sort notes and promotions SHALL live in the page header, its menus or the overflow, never as rows above the list.

#### Scenario: First task on a phone
- **WHEN** the Inbox with eight tasks opens on a 390×844 screen with the keyboard closed
- **THEN** at least four tasks are visible without scrolling

#### Scenario: Filter affordance
- **WHEN** the user activates Filter in the page header of Today and chooses "Quick wins"
- **THEN** the list is filtered and one active chip with a clear control appears in the header, not above the list

### Requirement: Density preference
Settings → Appearance SHALL offer a density of Comfortable (default) or Compact, synced with the appearance preferences, applied to rows, group headers and the sidebar at once.

#### Scenario: Compact rows
- **WHEN** the user chooses Compact
- **THEN** single-line rows are 36 px tall instead of 44 px on fine-pointer devices, and touch targets stay 44 px on coarse pointers

### Requirement: Completion feedback
Completing a task SHALL animate the check mark and fade the row within the emphasis duration before the row leaves or re-sorts, SHALL update counts live, and SHALL offer Undo in a toast for five seconds. Under reduced motion only the opacity fades. Undo SHALL reopen the task as an ordinary operation, applied locally first, so it works offline and converges by last-writer-wins.

#### Scenario: Undo a completion offline
- **WHEN** the device is offline, the user completes a task and activates Undo in the toast
- **THEN** the task is open again at once, the reopening is queued right after the completion as an ordinary op, and other devices converge on the open state

### Requirement: Single-action undo
Deleting a task, moving it to another project, changing its date or parking it SHALL offer the same Undo toast as bulk actions, replacing the previous offer.

#### Scenario: Delete then undo
- **WHEN** the user deletes a task from its row menu and activates Undo
- **THEN** the task returns to its place with its subtasks and no tombstone remains after sync

### Requirement: Bulk selection does not shift rows
The selection checkbox SHALL take the place of the task checkbox only while a selection is in progress (a row is ticked, or touch Select mode is on), so the row does not change width or alignment. Hover and keyboard focus SHALL NOT replace the task checkbox: clicking it always completes or reopens the task.

#### Scenario: Hover a row
- **WHEN** nothing is ticked and the pointer enters a row in a project list
- **THEN** the task checkbox stays in place and the title does not move

#### Scenario: Selection in progress
- **WHEN** one row is ticked
- **THEN** every row shows the selection checkbox where the task checkbox was and no title moves

### Requirement: Drag feedback
A dragged row SHALL lift with the popover elevation and a slight scale, the drop position SHALL show as a line with a dot at its start, and dropping on the middle of a row SHALL ring that row. Under reduced motion the lift is an opacity change.

#### Scenario: Start a drag
- **WHEN** the user drags a task in a project list
- **THEN** the row lifts and the target line appears between rows as the pointer moves

### Requirement: Skeleton loading
While a list, the panel or a settings page waits for local data, it SHALL show skeleton rows in the row's shape, never a spinner or a "Loading…" sentence; the skeleton SHALL be replaced in place.

#### Scenario: Cold start
- **WHEN** the app opens before the local database has answered
- **THEN** the content column shows skeleton rows that are replaced by tasks without a layout jump

### Requirement: Large lists stay responsive

Task lists SHALL do work in proportion to what changed, not to the size of the list or of the task store. Moving the cursor SHALL re-render only the row it leaves and the row it reaches. One write (local or from sync) SHALL read the stored tasks once for every list, count and badge on screen together, not once per component. Grouping a list SHALL take time linear in the number of tasks. With end-to-end encryption on, rows SHALL NOT each open their own query. This holds offline as online: the lists read local storage either way, and every device converges as before because only reads change.

#### Scenario: Cursor moves in a long list

- **WHEN** a project lists 2,000 tasks and the user presses `j` or `k`
- **THEN** at most the two rows whose selection changed render again

#### Scenario: One write with the sidebar and a project open

- **WHEN** a project of 2,000 tasks is open with the sidebar and one task is renamed
- **THEN** the stored tasks are read about once to update the list, the sidebar counts and the project header

#### Scenario: Synced changes refresh every view

- **WHEN** a sync batch lands while the device was offline or online
- **THEN** every open list, count and badge shows the new state from one shared read

#### Scenario: Grouping a large list

- **WHEN** 20,000 tasks fall into one group of a list
- **THEN** grouping them takes linear time (milliseconds, not seconds)

### Requirement: Lists for assistive technology

The keyboard cursor of a task list SHALL be real focus: when the cursor moves to a row, that row's open control SHALL take focus, unless focus is outside the list (the task panel, a dialog, the quick add, a text field, the sidebar), which keeps focus. The cursor row SHALL be marked as current. Rows of the project and Inbox trees SHALL expose their level and their position among their visible siblings. Each row's complete control SHALL be named after its task ("Complete Buy milk", "Reopen Buy milk"), and a title that cannot be decrypted SHALL NOT be read out as ciphertext. Cursor moves SHALL still re-render only the row left and the row reached. This is presentation only and behaves the same offline.

#### Scenario: Moving the cursor

- **WHEN** a list is shown and the user presses `j`
- **THEN** focus is on the first row's open control and the row is marked as current

#### Scenario: Focus stays in the panel

- **WHEN** focus is in the task panel and the cursor moves
- **THEN** focus stays in the panel

#### Scenario: Subtasks

- **WHEN** a project shows a task with two subtasks
- **THEN** the subtask rows are level 2 and positions 1 and 2 of 2

#### Scenario: Complete button

- **WHEN** a row shows the task "Pack"
- **THEN** its complete button is named "Complete Pack"
