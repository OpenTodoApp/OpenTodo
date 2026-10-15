# Spec Delta

## Purpose

Defines how a task reads in every list and board: one row anatomy, one metadata language, one group header, how empty groups behave, density, and the feedback a user gets when completing or undoing an action.

## ADDED Requirements

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
- **THEN** the task is open again at once, no completion is uploaded later for it, and other devices converge on the open state

### Requirement: Single-action undo
Deleting a task, moving it to another project, changing its date or parking it SHALL offer the same Undo toast as bulk actions, replacing the previous offer.

#### Scenario: Delete then undo
- **WHEN** the user deletes a task from its row menu and activates Undo
- **THEN** the task returns to its place with its subtasks and no tombstone remains after sync

### Requirement: Bulk selection does not shift rows
The selection checkbox SHALL take the place of the task checkbox while hovering, focusing or ticking a row, so the row does not change width or alignment. On touch devices Select mode SHALL show it in the same place.

#### Scenario: Hover a row
- **WHEN** the pointer enters a row in a project list
- **THEN** the selection checkbox appears where the task checkbox was and the title does not move

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
