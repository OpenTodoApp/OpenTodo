# Spec Delta

## MODIFIED Requirements

### Requirement: Permanent purge
The user SHALL be able to permanently delete one trashed item or empty the Trash, after confirmation. The API SHALL expose `DELETE /api/v1/{tasks|projects}/{id}/purge` and `POST /api/v1/trash/purge`, requiring authentication, accepting only entities whose deletion time is set, removing their operations and current values, and recording a purge marker. Purging a project SHALL purge the tasks referencing it. Purging a task SHALL purge its attachments and delete their stored files.

#### Scenario: Purge one task
- **WHEN** the user permanently deletes a trashed task and confirms
- **THEN** the task disappears from the Trash and from the export, and its history endpoint returns 404

#### Scenario: Purge requires the item to be in the Trash
- **WHEN** an authenticated client requests the purge of a task that is not deleted
- **THEN** the response is 409 `not_deleted` and nothing is removed

#### Scenario: Unauthenticated purge
- **WHEN** a request without credentials asks to empty the Trash
- **THEN** the response is 401 `unauthorized`

#### Scenario: Attachments go with the task
- **WHEN** a trashed task with three attachments is purged
- **THEN** the three attachments are purged with markers, their files are deleted from the data directory, the account's usage drops accordingly, and devices drop the attachments on their next sync

### Requirement: Automatic purge after retention
The server SHALL permanently purge trashed tasks and projects, and removed attachments, whose deletion time is older than the retention period, by default 30 days, configurable with the optional `OPENTODO_TRASH_RETENTION_DAYS` variable where `0` disables automatic purge. The job SHALL run at startup and daily, SHALL use the same purge path and markers, SHALL delete the files of purged attachments, and the Trash view SHALL show each item's remaining days.

#### Scenario: Default retention
- **WHEN** a task has been in the Trash for 31 days with default configuration
- **THEN** the next retention run purges it and devices drop it on their next sync

#### Scenario: Disabled retention
- **WHEN** `OPENTODO_TRASH_RETENTION_DAYS=0` is set
- **THEN** no item is purged automatically and the Trash view shows no countdown

#### Scenario: Invalid value
- **WHEN** `OPENTODO_TRASH_RETENTION_DAYS=soon` is set
- **THEN** the process exits non-zero with a message naming the variable

#### Scenario: Removed attachment after retention
- **WHEN** an attachment was removed 31 days ago with default configuration
- **THEN** the next retention run purges its metadata with a marker and deletes its file, and a device that restores it offline afterwards has its operations discarded like any purged entity
