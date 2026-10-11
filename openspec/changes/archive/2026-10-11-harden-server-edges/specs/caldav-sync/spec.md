# Spec Delta

## ADDED Requirements

### Requirement: Resource names go with purged tasks
When a task is purged, by a single purge, as part of a purged project, by emptying the Trash or by the retention job, the server SHALL remove any resource name or UID a calendar app chose for it in the same transaction. A database upgraded from an earlier version SHALL lose names of tasks purged before. This is server state outside the op log; offline devices are unaffected and nothing needs to converge.

#### Scenario: Purge a task created by a calendar app
- **WHEN** a task that a calendar app created under its own resource name is deleted and then purged
- **THEN** no resource name for that task remains on the server

#### Scenario: Project purge cascades
- **WHEN** a trashed project whose tasks have client-chosen names is purged
- **THEN** the names of all its tasks are removed together with the tasks

#### Scenario: Retention
- **WHEN** the retention job purges an old trashed task with a client-chosen name
- **THEN** its name is removed in the same transaction

#### Scenario: Upgrade
- **WHEN** a server whose database holds names of already purged tasks starts on the new version
- **THEN** those names are removed and names of existing tasks are kept
