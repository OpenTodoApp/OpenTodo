## ADDED Requirements

### Requirement: List updates follow the changed rows
After a write (local or from sync), a task list, its groups and its row details (progress, blockers, the step a task waits for, habit streaks), Today's closed list, the sidebar's counts and the app badge SHALL be worked out from the rows that write changed rather than from every stored task, and SHALL show exactly what working them out from all tasks shows: the same rows in the same order and groups, the same counts and the same flow and closed-list state. A row SHALL compare only the details a write could have changed. Completing a task SHALL redraw the list once, when the task leaves the list's data; the end of the departing row's animation SHALL NOT redraw the list. A long list SHALL let the browser skip blocks of rows far from the viewport, each row keeping its block from one drawing to the next, without splitting the list: every row stays an item of the one list (or section list) that assistive technology announces. Only how the screen derives and draws local data changes, so this behaves the same offline and convergence is unchanged.

#### Scenario: A completion in a 2,000-row project
- **WHEN** the user completes a task in a project of 2,000 open tasks in a 10,000-task account
- **THEN** the list, the section count, the sidebar counts and the app badge show the task gone, as a full recomputation would, without going over the 10,000 tasks

#### Scenario: Random writes give the same lists as a full recomputation
- **WHEN** any sequence of creates, edits, completions, reopenings, moves, deletions and blocker changes is applied
- **THEN** after each write the incremental lists, groups, counts, flows and closed list equal those worked out from all tasks

#### Scenario: The departing row ends
- **WHEN** a completed row's departure animation ends
- **THEN** the row leaves the screen without the list drawing again

#### Scenario: Rows in blocks for assistive technology
- **WHEN** a section lists 2,000 tasks
- **THEN** a screen reader finds 2,000 items in that one named list, each with its Complete button

#### Scenario: Synced changes while offline
- **WHEN** a device comes back online and a sync page changes many tasks at once
- **THEN** the lists show the synced state, worked out in full when the change is too large to follow row by row
