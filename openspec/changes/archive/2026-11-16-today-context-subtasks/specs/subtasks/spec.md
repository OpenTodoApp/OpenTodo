## MODIFIED Requirements

### Requirement: Flat display in cross-project and date views
Views that span projects or filter by date SHALL list each matching task once, flat, with a breadcrumb naming its parent; a parent that does not itself match SHALL not be shown. Today and Upcoming with their Nest subtasks display option on (OpenSpec `builtin-view-options` "Nest subtasks in Today and Upcoming") SHALL instead list a subtask under its parent when both are listed in the same group, and keep the flat row with its breadcrumb otherwise. In Today only, the same option can also show undated and future-dated direct subtasks beneath a regular task in a day group, following the eligibility and action rules in that requirement.

#### Scenario: Flat in Today
- **WHEN** only "Compare prices" is due today
- **THEN** Today lists "Compare prices" once with a breadcrumb "Hotel" and does not list "Plan trip" or "Hotel"

#### Scenario: Nested in Today
- **WHEN** Nest subtasks is on in Today and "Hotel" and its subtask "Compare prices" are both due today
- **THEN** Today lists "Hotel" with "Compare prices" indented under it, and does not list "Plan trip"

#### Scenario: Context in Today

- **WHEN** Nest subtasks is on in Today and "Hotel" is a regular Today row while its direct subtask "Compare prices" has no date
- **THEN** "Compare prices" renders as one contextual child and "Hotel" opens and collapses it with the existing tree controls
