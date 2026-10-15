# Spec Delta

## MODIFIED Requirements

### Requirement: Sections in the list view
A project's list view SHALL group open tasks under section headings ordered by section position, with tasks that have no section listed first under a "No section" heading shown only when sections exist and that group has open tasks. Each heading SHALL use the shared group header with the count of open tasks beneath it, a collapse control and a quick-add action that creates tasks in that section. A section with no open tasks SHALL show its header only, with "n completed" and a reveal control when it holds completed tasks. Sections SHALL be collapsible per device.

#### Scenario: Grouped list
- **WHEN** a project has sections "Backlog" and "Doing" with 3 and 1 open tasks, and 2 tasks without a section
- **THEN** the view shows "No section 2", then "Backlog 3", then "Doing 1", each followed by its tasks

#### Scenario: No unsectioned tasks
- **WHEN** every open task of a project sits in a section
- **THEN** no "No section" heading is shown

#### Scenario: Quick add under a heading
- **WHEN** the user activates the quick-add action of "Doing", types a title and presses Enter
- **THEN** a task with that title appears under "Doing" immediately, with no network round trip

### Requirement: Board view
Every project SHALL offer a board view with one column per section ordered by section position, preceded by a "No section" column only when it has open tasks, each listing the section's open tasks as cards ordered by position with a per-column count and quick-add. The board SHALL be the content column's own scroller: columns fill the available height and each column scrolls alone, the page does not. Below 640 px columns SHALL be 88 % of the screen width with snapping and a dot pager, and the current column's name SHALL be in the page bar. The list/board choice SHALL be remembered per project per device and SHALL not be synced. The board SHALL render from local data and SHALL be navigable by keyboard.

#### Scenario: Switch to board
- **WHEN** the user presses the view toggle or `v` in a project
- **THEN** the project is shown as columns, and the same project opens as a board on the next visit on that device only

#### Scenario: Keyboard navigation across columns
- **WHEN** the board is shown and the user presses `l` or Right
- **THEN** the selection moves to the first task of the next column, and `j`/`k` continue to move within a column

#### Scenario: Tall column
- **WHEN** a column holds more cards than fit the screen height
- **THEN** that column scrolls inside itself and the page header stays in place

#### Scenario: Board on a phone
- **WHEN** a project with three sections opens as a board on a 390 px screen
- **THEN** the first column with open tasks fills most of the width, swiping snaps to the next column and the pager shows three dots

#### Scenario: Card content
- **WHEN** a task with a date, three labels, an estimate and two comments is shown as a card
- **THEN** the card shows the title, the date, up to three chips and a footer with the comment count, and nothing else
