# Spec Delta

## ADDED Requirements

### Requirement: Quick add stays reachable in long lists
From 768 px wide, wherever the floating Add button is not shown, a list page's quick add SHALL stay visible directly under the page header while the list scrolls under it, on the page surface with its bottom border, so a new task can be added at any scroll position without scrolling back up. It SHALL be the same row as before, not an extra one, and SHALL never cover a focused row, the selection bar or a toast; focused rows SHALL scroll into view below it. Below 768 px the quick add SHALL scroll with the list as before, the floating Add button being the always reachable add control. Section add rows and board columns SHALL NOT stick. This is presentation only and behaves the same offline.

#### Scenario: Add after scrolling down
- **WHEN** on a 1280 × 800 window the user scrolls a project with 80 tasks to its end
- **THEN** the quick add is still visible under the page header, and clicking it and adding a task needs no scroll

#### Scenario: Focused row not covered
- **WHEN** the list is scrolled and the user moves the focus with `k` to a row just under the stuck quick add
- **THEN** the row scrolls so that it is fully visible below the quick add

#### Scenario: Phone unchanged
- **WHEN** the same project is scrolled on a 390 × 844 screen
- **THEN** the quick add scrolls away with the list and the floating Add button stays visible

### Requirement: A new task out of sight is announced
When a task added from a list page's quick add or a section's add row lands outside the visible part of the list, the app SHALL show a toast naming where it went ("Added to the bottom of {list}" or "Added to the top of {list}") with a Show action that scrolls the task into view and selects it. No toast SHALL be shown when the new row is visible, and the Inbox's note about a task that left the Inbox SHALL take precedence. This is presentation only and behaves the same offline.

#### Scenario: Added at the bottom of a long Inbox
- **WHEN** "Add new tasks" is at the bottom and the user adds a task to an Inbox of 60 tasks whose end is not visible
- **THEN** a toast says "Added to the bottom of Inbox", and Show scrolls to the new task and selects it

#### Scenario: Visible task
- **WHEN** the user adds a task to a project of five tasks that all fit on the screen
- **THEN** the new task appears and no toast is shown
