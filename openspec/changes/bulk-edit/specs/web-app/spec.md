# Spec Delta

## MODIFIED Requirements

### Requirement: Normal-mode motions and counts
In Normal mode the client SHALL support a count prefix for `j`, `k`, `J` and `K` (`J`/`K` move the selected task in manual order), `gg`/`G` to select the first/last task, `dd` to delete it, `x` to complete or reopen it, `o` to open quick add after the selection and `i` to open its detail panel in Insert mode. When several tasks are ticked (see `bulk-actions`), `x` and `dd` SHALL act on the ticked tasks and `J`/`K` SHALL keep moving the cursor task; ticking in Vim mode uses Space and `Shift+↓`/`Shift+↑`, which the Vim layer leaves untouched. Task actions SHALL be applied locally first and recorded as operations, so they work offline and converge.

#### Scenario: Count prefix
- **WHEN** a task is selected and the user types `3j`
- **THEN** the selection moves down three tasks, clamped at the last task

#### Scenario: Delete with dd offline
- **WHEN** the device is offline and the user presses `d` twice with a task selected
- **THEN** the task is deleted immediately, the deletion is uploaded on the next sync, and other devices converge on the tombstone

#### Scenario: Incomplete sequence times out
- **WHEN** the user presses `d` once and nothing within one second
- **THEN** no task is deleted and the pending key is discarded

#### Scenario: Count before G or gg
- **WHEN** the user types `4G` or `4gg`
- **THEN** the fourth task of the list is selected

#### Scenario: Move the selected task with J
- **WHEN** a task is selected in a project list or the Inbox and the user types `2J`
- **THEN** the task moves down two places, recorded as position operations like Alt+Down

#### Scenario: a keeps its default meaning
- **WHEN** a task is selected and the user presses `a`
- **THEN** the inline subtask field opens as without Vim keybindings, which is Insert mode

#### Scenario: x with several tasks ticked
- **WHEN** Vim keybindings are on, the user ticks three tasks with Space and presses `x`
- **THEN** the three tasks are completed as one batch and a toast offers Undo

#### Scenario: Extend the selection in Vim mode
- **WHEN** Vim keybindings are on and the user presses Space on a row, then `Shift+↓`
- **THEN** that row and the next are ticked, while `J` still moves the cursor task down one place
