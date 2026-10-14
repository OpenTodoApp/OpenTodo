# Spec Delta

## MODIFIED Requirements

### Requirement: Board view
Every project SHALL offer a board view with one column per section ordered by section position, preceded by a "No section" column, each listing the section's open tasks ordered by position with a per-column count and quick-add. The board SHALL be one of three project layouts, list, board and timeline (OpenSpec `project-timeline`), chosen with the view toggle or by cycling with `v`; the choice SHALL be remembered per project per device and SHALL not be synced. The board SHALL render from local data, scroll horizontally on narrow screens, and SHALL be navigable by keyboard.

#### Scenario: Switch to board
- **WHEN** the user presses the view toggle or `v` in a project
- **THEN** the project is shown as columns, and the same project opens as a board on the next visit on that device only

#### Scenario: Cycle through the layouts
- **WHEN** the project is shown as a board and the user presses `v` twice
- **THEN** the timeline is shown after the first press and the list after the second, and the last choice is remembered for that project on that device

#### Scenario: Keyboard navigation across columns
- **WHEN** the board is shown and the user presses `l` or Right
- **THEN** the selection moves to the first task of the next column, and `j`/`k` continue to move within a column
