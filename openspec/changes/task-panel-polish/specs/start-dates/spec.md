# Spec Delta

## ADDED Requirements

### Requirement: Start segment quick choices
The Start segment of the When popover SHALL offer the quick choices Today, Tomorrow, Next week and Someday, each with the date it means (none for Someday), followed by the same worded date field and visible month calendar as the Do on segment. An empty start SHALL read "No start date", not a bare word before an empty field. Choosing Someday SHALL park the task exactly as the Someday control does today.

#### Scenario: Start next week
- **WHEN** the user opens the Start segment and chooses Next week
- **THEN** the task's start is the first day of next week in the user's week setting, and the When line reads "from" with that date

#### Scenario: Park from the segment
- **WHEN** the user chooses Someday in the Start segment
- **THEN** the task is parked in Someday and the When line reads "Someday"

#### Scenario: Empty start
- **WHEN** a task has no start date and the user opens the Start segment
- **THEN** the segment reads "No start date" above the quick choices, and no choice is selected
