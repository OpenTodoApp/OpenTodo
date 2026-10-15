# Spec Delta

## ADDED Requirements

### Requirement: Dependency terms
`blocked` SHALL match tasks that have at least one open blocker (OpenSpec `task-dependencies`) and `unblocked` SHALL match tasks that have none, both evaluated from local data with the same open-only default as every other term. Both SHALL be keywords in the published grammar.

#### Scenario: Waiting-for list offline
- **WHEN** the device is offline and the user enters `blocked`
- **THEN** every open task with an open blocker is listed, and tasks whose blockers are all completed are not

#### Scenario: What can be done today
- **WHEN** the user enters `unblocked & today`
- **THEN** only today's open tasks without an open blocker are listed

#### Scenario: Blocker completed on another device
- **WHEN** `unblocked` is displayed, another device completes a task's last open blocker, and this device syncs
- **THEN** the task appears in the results without a reload
