## ADDED Requirements

### Requirement: Recurring term
`recurring` SHALL match tasks that have a repeat rule, habits and rules that repeat after completion included. An occurrence record of a series has no rule of its own and SHALL NOT match. Like every keyword it combines with the other terms, and the server and the device SHALL evaluate it alike.

#### Scenario: Every repeating task in one view
- **WHEN** the user saves `recurring & open` as a view
- **THEN** the view lists every open task with a repeat rule across projects, habits included, and no plain task

#### Scenario: Combined with a project
- **WHEN** the user enters `recurring & #Home`
- **THEN** only the repeating tasks of "Home" are listed
