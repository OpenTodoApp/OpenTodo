# Spec Delta

## ADDED Requirements

### Requirement: Deadline segment quick choices
The Deadline segment of the When popover SHALL offer the quick choices End of week, End of month and In 2 weeks, each with the date it means, followed by the same worded date field and visible month calendar as the Do on segment. End of week SHALL be the last day of the user's week; End of month the last day of the current month.

#### Scenario: End of month
- **WHEN** today is 2026-10-21 and the user chooses End of month in the Deadline segment
- **THEN** the deadline is 2026-10-31 and the due date is unchanged

#### Scenario: Week setting respected
- **WHEN** the user's week starts on Monday, today is Wednesday 2026-10-21 and the user chooses End of week
- **THEN** the deadline is Sunday 2026-10-25
