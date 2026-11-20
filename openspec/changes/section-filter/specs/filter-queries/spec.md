# Spec Delta

## ADDED Requirements

### Requirement: Section terms
The grammar SHALL accept `section: name` (quotes allowed; the task is in a live section of its own project whose name equals the name, ignoring case, in any project) and `no section` (the task is in no such section: it has none, or its section is deleted or belongs to another project). `section:` with nothing after it SHALL be a syntax error. `section` SHALL be a reserved word, so a custom field of that name is reachable only through its quoted name. Sections of different projects with the same name SHALL all match. A name no live section has SHALL match no task and the device SHALL warn, as it does for an unknown label; the server SHALL still accept the query as a saved view. The terms SHALL be accepted by the server when it validates a saved view and evaluated on the device from local data with the same open-only default as every other term, offline included. They match a section, not the task's text, so they SHALL NOT make a routine's Find tasks step a content step. The TypeScript and Go parsers SHALL share their test queries, and the two evaluators SHALL list the same tasks for them.

#### Scenario: Several sections
- **WHEN** the user enters `section: Review | section: Backlog`
- **THEN** the open tasks in a section named "Review" or "Backlog", in any project, are listed

#### Scenario: Same name in two projects
- **WHEN** two projects each have a section named "Review" and the user enters `section: review`
- **THEN** open tasks in either section are listed

#### Scenario: Not in a section
- **WHEN** the user enters `section: Backlog | no section`
- **THEN** open tasks in a "Backlog" section and open tasks in no section are listed, and a task whose section was deleted or belongs to another project counts as in none

#### Scenario: Unknown name
- **WHEN** no live section is named Nowhere and the user enters `section: Nowhere`
- **THEN** no task is listed and the device warns that no section has that name

#### Scenario: Missing value
- **WHEN** the user enters `section:`
- **THEN** the query is not run, the error names the missing name, and the server refuses the query when it is saved as a view

#### Scenario: Both evaluators
- **WHEN** the shared section queries are run by the Go and the TypeScript evaluators
- **THEN** every query lists the same tasks on both sides

#### Scenario: Condition builder
- **WHEN** the user adds a Section condition and picks "Review" from the list
- **THEN** the query gains `section: Review`, and the condition shows as "Section is Review"
