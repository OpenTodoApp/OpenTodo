## MODIFIED Requirements

### Requirement: Flat display in cross-project and date views
Views that span projects or filter by date SHALL list each matching task once, flat, with a breadcrumb naming its parent; a parent that does not itself match SHALL not be shown. Today and Upcoming with their Nest subtasks display option on (OpenSpec `builtin-view-options` "Nest subtasks in Today and Upcoming") SHALL instead list a subtask under its parent when both are listed in the same group, and keep the flat row with its breadcrumb otherwise.

#### Scenario: Flat in Today
- **WHEN** only "Compare prices" is due today
- **THEN** Today lists "Compare prices" once with a breadcrumb "Hotel" and does not list "Plan trip" or "Hotel"

#### Scenario: Nested in Today
- **WHEN** Nest subtasks is on in Today and "Hotel" and its subtask "Compare prices" are both due today
- **THEN** Today lists "Hotel" with "Compare prices" indented under it, and does not list "Plan trip"
