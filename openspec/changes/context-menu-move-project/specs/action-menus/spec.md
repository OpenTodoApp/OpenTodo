# Spec Delta

## ADDED Requirements

### Requirement: A menu step outlives the menu that opened it
When an item of a task's Actions menu leads to a further step after the menu closes (the review of a move or an assignment, the date of "Pick a date…"), that step SHALL appear however the menu was opened: a right-click, a touch hold, the row's More button, `.` or the selection bar. Closing the menu SHALL NOT discard the step, and applying it SHALL write the change as from any other way in.

#### Scenario: Move a task to another project from the right-click menu
- **WHEN** the user right-clicks a task in "Project 4", chooses "Move to project", picks "Project8" and applies the review
- **THEN** the menu closes, the review of the move appears, and after Apply the task is in "Project8" and leaves the "Project 4" list
