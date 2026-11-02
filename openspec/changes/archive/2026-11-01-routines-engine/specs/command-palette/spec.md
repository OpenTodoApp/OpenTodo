## ADDED Requirements

### Requirement: Run a routine from the palette
The palette SHALL offer "Run routine…", listing the user's live routines by name from local data with their trigger summary, and "Go to Routines". Choosing a routine SHALL run it now; when a task is open or under the cursor and the routine reads the trigger's task, that task SHALL be passed. The outcome SHALL be shown in a toast with its counts, a link to the run and Undo. Offline the entry SHALL be listed and say "Needs a connection" instead of running.

#### Scenario: Run from Ctrl+K
- **WHEN** the user presses `Ctrl+K`, types "groc" and picks "Run routine: Groceries"
- **THEN** the routine runs and a toast reads "Groceries: 3 tasks created" with View run and Undo

#### Scenario: With the open task
- **WHEN** the task "Call the plumber" is open and the user runs "Waiting follow-up" from the palette
- **THEN** the run receives that task as the trigger's task

#### Scenario: Offline
- **WHEN** the device is offline and the user picks a routine in the palette
- **THEN** nothing runs and the entry reads "Needs a connection"
