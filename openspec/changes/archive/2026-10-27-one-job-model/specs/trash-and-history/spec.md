## MODIFIED Requirements

### Requirement: Automatic purge after retention
The server SHALL permanently purge trashed tasks and projects, and removed attachments, whose deletion time is older than the retention period, by default 30 days, configurable with the optional `OPENTODO_TRASH_RETENTION_DAYS` variable where `0` disables automatic purge. The job SHALL run at startup and, while the server runs, within a minute of the oldest trashed item passing the retention; it SHALL use the same purge path and markers, SHALL delete the files of purged attachments, and the Trash view SHALL show each item's remaining days.

#### Scenario: Default retention
- **WHEN** a task has been in the Trash for 31 days with default configuration
- **THEN** it is purged within a minute of passing the retention and devices drop it on their next sync

#### Scenario: Disabled retention
- **WHEN** `OPENTODO_TRASH_RETENTION_DAYS=0` is set
- **THEN** no item is purged automatically and the Trash view shows no countdown

#### Scenario: Invalid value
- **WHEN** `OPENTODO_TRASH_RETENTION_DAYS=soon` is set
- **THEN** the process exits non-zero with a message naming the variable

#### Scenario: Removed attachment after retention
- **WHEN** an attachment was removed 31 days ago with default configuration
- **THEN** it is purged within a minute of passing the retention: its metadata with a marker and its file, and a device that restores it offline afterwards has its operations discarded like any purged entity
