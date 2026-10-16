## MODIFIED Requirements

### Requirement: Bulk selection does not shift rows
The selection checkbox SHALL take the place of the task checkbox only while a selection is in progress (a row is ticked, or touch Select mode is on), so the row does not change width or alignment. Hover and keyboard focus SHALL NOT replace the task checkbox: clicking it always completes or reopens the task.

#### Scenario: Hover a row
- **WHEN** nothing is ticked and the pointer enters a row in a project list
- **THEN** the task checkbox stays in place and the title does not move

#### Scenario: Selection in progress
- **WHEN** one row is ticked
- **THEN** every row shows the selection checkbox where the task checkbox was and no title moves
