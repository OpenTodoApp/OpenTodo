# Spec Delta

## MODIFIED Requirements

### Requirement: Complete and reopen
A task SHALL be completable and reopenable from the list, the detail panel and the keyboard. Completing a task without a recurrence rule SHALL record the completion time and remove the task from open views without deleting it. Completing a task with a recurrence rule SHALL record a completed occurrence and move the task to its next occurrence, unless the rule's end condition is reached, in which case it completes like any other task. All of this SHALL work offline and converge across devices.

#### Scenario: Complete from the list
- **WHEN** the user clicks the circle of an open task or presses `c` with it selected
- **THEN** the task gains a completion time, disappears from the current open view and appears in Completed

#### Scenario: Reopen
- **WHEN** the user reopens a completed task
- **THEN** the completion time is cleared and the task returns to its project or Inbox

#### Scenario: Complete a recurring task
- **WHEN** the user completes a task with `every day` due today
- **THEN** a completed entry for today appears in Completed and the task stays open, due tomorrow, keeping its rule

#### Scenario: Reopen a completed occurrence
- **WHEN** the user reopens a completed occurrence of a series
- **THEN** that occurrence becomes a standalone open task with its original due date, and the series is not moved back

#### Scenario: Complete the same occurrence on two devices offline
- **WHEN** two devices complete the same occurrence without a network and later sync
- **THEN** Completed shows that occurrence once and the series is due on the same next occurrence on both devices
