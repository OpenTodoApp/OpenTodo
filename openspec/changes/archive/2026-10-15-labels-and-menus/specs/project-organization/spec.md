# Spec Delta

## MODIFIED Requirements

### Requirement: Move a project
The user SHALL be able to move a project under another project or to the top level from the project header's "Move to" action, reachable by keyboard. The picker SHALL be searchable by name, show each candidate's parent path, and SHALL exclude the project itself, its descendants and archived or deleted projects. A move SHALL set the parent field, place the project last among its new siblings, and SHALL apply locally at once, work offline, and converge on other devices through the operation log.

#### Scenario: Move under another project
- **WHEN** the user opens "Move to" on "Q4 launch" and picks "Marketing"
- **THEN** "Q4 launch" appears as the last sub-project of "Marketing" and its tasks keep their project reference

#### Scenario: Descendants are not offered
- **WHEN** the user opens "Move to" on "Work", which contains "Client A"
- **THEN** "Client A" and "Work" are absent from the list of possible parents and "Top level" is offered

#### Scenario: Search the picker
- **WHEN** the user opens "Move to" on "Q4 launch" and types "mark"
- **THEN** only matching candidates are listed, each with its parent path such as "Work › Marketing", and Enter on the first one moves the project there

#### Scenario: Move offline
- **WHEN** the device is offline and the user moves a project
- **THEN** the sidebar reflects the move immediately and the move is uploaded when the network returns
