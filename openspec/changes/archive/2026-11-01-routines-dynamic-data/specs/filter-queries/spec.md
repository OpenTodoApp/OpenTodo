## MODIFIED Requirements

### Requirement: Evaluation on the server for routines
The server SHALL evaluate a filter query, or a saved view's query, for a routine's Find tasks step with the same results as the device for the same data, time zone and day start, pinned by evaluation vectors shared by the Go and TypeScript evaluators. Terms that read user-written text (search words, `notes: text`) SHALL make the step a content step, which the server does not run for an encrypted account. An invalid query SHALL fail the step with the parser's error. Find tasks SHALL apply the rule of open, completed and deleted tasks to the query: open tasks only unless the query names `completed` or `open` or compares the completion date, deleted tasks never.

#### Scenario: Same answer on both sides
- **WHEN** the shared evaluation vectors are run by the Go and the TypeScript evaluators
- **THEN** every query lists the same tasks on both sides

#### Scenario: Saved view
- **WHEN** a routine's Find tasks step uses the saved view "Errands" whose query is `#Errands & !assigned`
- **THEN** the step's output is the open tasks the view lists on the device

#### Scenario: Query invalid after an edit
- **WHEN** the saved view's query was changed to `due before:` and the routine runs
- **THEN** the run fails at Find tasks with the parser's error and nothing is written

#### Scenario: Completed tasks
- **WHEN** a routine's Find tasks step uses the query `completed = last week` and the user completed four tasks last week, one of them since deleted
- **THEN** the step's output is the three live completed tasks, the same list the device shows for the query
