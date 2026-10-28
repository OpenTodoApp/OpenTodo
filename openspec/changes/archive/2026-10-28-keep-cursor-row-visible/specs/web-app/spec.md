## ADDED Requirements

### Requirement: The keyboard cursor stays in sight
When the keyboard moves the selection in a task list (project lists, the standard views, saved views, the New view page), the selected row SHALL be scrolled fully into view below everything pinned at the top of the list, such as the sticky page header or a group header, and above the bottom edge, scrolling only as far as that needs. Moving to the first row SHALL scroll the list to its very top.

#### Scenario: Moving up a long list
- **WHEN** the user moves to the last of 40 tasks with the down arrow and then back up with the up arrow
- **THEN** every selected row is fully visible below the page header, never behind it

#### Scenario: Back at the first task
- **WHEN** the user reaches the first task with the up arrow
- **THEN** the list is scrolled to the top and the page header and quick add show again
