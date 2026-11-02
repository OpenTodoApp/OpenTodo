## MODIFIED Requirements

### Requirement: Undo a bulk action in one step
After a bulk action a toast SHALL name it ("12 tasks completed") with an Undo control for ten seconds; trashing a batch SHALL hold the offer for fifteen seconds and offer a "Show Trash" control as its second. The control, or `Ctrl`/`⌘`+`Z` outside a text field while the toast shows, SHALL restore the previous values as one new batch, offline-capable and convergent. Trashing more than twenty ticked tasks SHALL first ask the shared confirmation dialog naming the count; smaller sets SHALL trash at once. A field changed again since the action SHALL be skipped and the task named. Undo state SHALL be device-local (the last 20 batches), never synced or exported, and cleared at sign-out.

#### Scenario: Undo a cross-scope move
- **WHEN** the user moved two personal tasks into a shared project and activates Undo
- **THEN** the two copies go to the Trash and the two originals are restored, in one batch

#### Scenario: Undo a reschedule
- **WHEN** the user rescheduled eight tasks to tomorrow and activates Undo
- **THEN** each task has its previous due date (or none) on every device after sync, and each task's history shows the reschedule and the restore

#### Scenario: Field changed since
- **WHEN** after completing five tasks the user reopened one by hand, then presses `Ctrl+Z`
- **THEN** the four others are reopened, the hand-edited one is left alone and the toast names it

#### Scenario: Toast is keyboard reachable
- **WHEN** a bulk action's toast is shown and the user presses Tab
- **THEN** the Undo control receives focus and Enter undoes

#### Scenario: Large trash asks first
- **WHEN** the user ticks 30 tasks and presses Delete
- **THEN** the shared confirmation dialog names the count ("Move 30 tasks to the Trash?"), and the batch lands in the Trash only after confirming; ticking three tasks and pressing Delete trashes them at once

#### Scenario: The Trash offer holds longer
- **WHEN** the user trashes a batch of tasks
- **THEN** the offer holds Undo for fifteen seconds (instead of ten) with "Show Trash" as its second control, and activating it opens the Trash view
