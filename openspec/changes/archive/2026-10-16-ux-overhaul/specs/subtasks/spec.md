# Spec Delta

## MODIFIED Requirements

### Requirement: Nested display in lists
Project and Inbox views SHALL render subtasks indented beneath their parent, ordered by position within each level, with a per-device collapse toggle in the row's leading slot on parents (Left collapses, Right expands on the selected row). Every list SHALL reserve the same leading slot, so checkboxes align across tree and flat views. Views that span projects or filter by date SHALL list each matching task once, flat, with a breadcrumb naming its parent; a parent that does not itself match SHALL not be shown.

#### Scenario: Indented tree
- **WHEN** "Plan trip" has subtasks "Flights" and "Hotel", and "Hotel" has subtask "Compare prices"
- **THEN** the project view shows "Plan trip", then "Flights" and "Hotel" indented one level, then "Compare prices" indented two levels

#### Scenario: Flat in Today
- **WHEN** only "Compare prices" is due today
- **THEN** Today lists "Compare prices" once with a breadcrumb "Hotel" and does not list "Plan trip" or "Hotel"

#### Scenario: Aligned across views
- **WHEN** the user switches from Today to the Inbox
- **THEN** the checkboxes of top-level tasks sit at the same horizontal position in both
