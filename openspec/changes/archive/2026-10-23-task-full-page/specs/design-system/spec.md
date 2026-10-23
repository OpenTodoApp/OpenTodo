## MODIFIED Requirements

### Requirement: Interface budget
Every change that touches a screen SHALL state in its design how it stays within the interface budget: at most two rows of chrome above the first item of a list, at most seven properties with a value shown by default on an empty task, the task page's facts in at most four named groups of at most six rows (unset facts read as quiet actions, never as empty fields), at most six primary sidebar destinations, at most three vertical scroll regions per screen, and every new shortcut registered without conflict. The measurable limits SHALL be enforced by tests.

#### Scenario: A feature adds a banner
- **WHEN** a change renders a banner between the page header and the first task
- **THEN** the budget test fails naming the view

#### Scenario: The facts column grows
- **WHEN** a change adds a seventh row to one of the task page's fact groups
- **THEN** the budget test fails naming the group
