# Spec Delta

## MODIFIED Requirements

### Requirement: Board view
Every project SHALL offer a board view with one column per section ordered by section position, preceded by a "No section" column, each listing the section's open tasks ordered by position with a per-column count and quick-add. Cards SHALL show the task's non-empty custom field values as compact badges (OpenSpec `custom-fields`), at most three with a count for the rest. The list/board choice SHALL be remembered per project per device and SHALL not be synced. The board SHALL render from local data, scroll horizontally on narrow screens, and SHALL be navigable by keyboard.

#### Scenario: Switch to board
- **WHEN** the user presses the view toggle or `v` in a project
- **THEN** the project is shown as columns, and the same project opens as a board on the next visit on that device only

#### Scenario: Keyboard navigation across columns
- **WHEN** the board is shown and the user presses `l` or Right
- **THEN** the selection moves to the first task of the next column, and `j`/`k` continue to move within a column

#### Scenario: Field badges on a card
- **WHEN** a card's task holds Cost 120, Status "Ordered", a checked "Paid" box and an empty Client
- **THEN** the card shows badges "Cost 120", "Status Ordered" and "Paid", and nothing for Client

#### Scenario: More than three values
- **WHEN** a card's task holds five non-empty values
- **THEN** the card shows the first three in definition order and a "+2" badge whose accessible name lists the rest
