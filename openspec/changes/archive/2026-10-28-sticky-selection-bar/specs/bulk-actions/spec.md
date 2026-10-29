## ADDED Requirements

### Requirement: The selection bar stays in sight
While tasks are ticked, the selection bar SHALL stay visible as the list scrolls: pinned just below the page's sticky header, or at the top of the list where the header scrolls away, above the rows, which scroll under it. A row moved to with the keyboard SHALL be kept below the bar as well as below the header.

#### Scenario: Ticking far down a long list
- **WHEN** the user scrolls to the end of a 40-task project and Shift+clicks a range of tasks there
- **THEN** the bar with the count, Actions and Clear shows right below the page header without scrolling back up

#### Scenario: Keyboard cursor under the bar
- **WHEN** tasks are ticked and the user moves up the list with the arrow keys
- **THEN** every selected row stays fully visible below the selection bar
