## ADDED Requirements

### Requirement: Drop a task on a label
A task dragged from a list or a board SHALL be droppable on a label in the sidebar (the Labels section and pinned labels in Favourites). Dropping SHALL add that label to the task, keeping its other labels, and a toast SHALL name the label with Undo; a task that already has the label SHALL be left unchanged and the toast SHALL say so. When the dragged task is part of the bulk selection, every selected task SHALL get the label as one batch. The task's position, project and dates SHALL not change. The write SHALL apply locally at once, work offline through the outbox and converge like any label change (the whole array, last writer wins). `l` remains the keyboard way to add a label.

#### Scenario: Add a label by dropping
- **WHEN** the user drags "Call the plumber" onto the label "errand" in the sidebar
- **THEN** the task carries "errand" in addition to its labels, stays where it was in the list, and the toast reads "Added errand" with Undo

#### Scenario: Already labelled
- **WHEN** the task already has "errand" and is dropped on "errand"
- **THEN** nothing is written and the toast says the task already has that label

#### Scenario: Drop while offline
- **WHEN** the device is offline and the user drops two selected tasks on "waiting"
- **THEN** both show the label at once and the change reaches the other devices after the next sync
