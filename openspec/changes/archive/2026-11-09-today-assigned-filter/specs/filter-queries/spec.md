# Spec Delta

## ADDED Requirements

### Requirement: Assignee terms
The grammar SHALL accept `assigned` (the task has an assignee), `unassigned` and `!assigned` (it has none), `assigned: me` (the assignee is the viewer) and `assigned: name` (quotes allowed; the assignee's name or email equals the name, ignoring case). `assigned:` with nothing after it SHALL be a syntax error. `assigned` SHALL be a reserved word, so a custom field of that name is reachable only through its quoted name. Two members with the same name SHALL both match. A name no member has SHALL match no task and the device SHALL warn, as it does for an unknown label; the server SHALL still accept the query as a saved view. The terms SHALL be keywords of the published grammar, accepted by the server when it validates a saved view, and evaluated on the device from the local task and the local membership cache, with the same open-only default as every other term, offline included. They match an assignee, not the task's text, so they SHALL NOT make a routine's Find tasks step a content step, and the server SHALL run them for an encrypted account. The TypeScript and Go parsers SHALL share their test queries, and the two evaluators SHALL list the same tasks for them.

#### Scenario: Anyone assigned
- **WHEN** the user enters `assigned & #Home`
- **THEN** the open tasks of "Home" that have an assignee are listed, and `unassigned & #Home` and `!assigned & #Home` list the open tasks of "Home" with none

#### Scenario: Mine or nobody
- **WHEN** the user enters `today & (assigned: me | unassigned)`
- **THEN** today's open tasks assigned to the viewer, and today's open tasks with no assignee, are listed, and a task assigned to someone else is not

#### Scenario: By name
- **WHEN** two members are named Sam and the user enters `assigned: sam`
- **THEN** open tasks assigned to either Sam are listed, and `assigned: "Sam"` lists the same tasks

#### Scenario: Unknown name
- **WHEN** no member is named Rowan and the user enters `assigned: Rowan`
- **THEN** no task is listed and the device warns that no member has that name

#### Scenario: Missing value
- **WHEN** the user enters `assigned:`
- **THEN** the query is not run, the error names the missing name, and the server refuses the query when it is saved as a view

#### Scenario: Reserved word
- **WHEN** a project defines a custom field named "assigned" and the user enters `assigned`
- **THEN** the term is the assignee keyword, and the field is reachable only through its quoted name

#### Scenario: Saved view offline
- **WHEN** the user saves `assigned: me | unassigned` as a view and opens it later on an offline device
- **THEN** the server accepts the view, and the device lists the matching open tasks from local data

#### Scenario: Both evaluators
- **WHEN** the shared assignee queries are run by the Go and the TypeScript evaluators
- **THEN** every query lists the same tasks on both sides

#### Scenario: Condition builder
- **WHEN** the user adds an Assignee condition and chooses Me
- **THEN** the query gains `assigned: me`, and choosing Unassigned gains `unassigned`
