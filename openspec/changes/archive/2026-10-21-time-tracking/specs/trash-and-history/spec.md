# Spec Delta

## MODIFIED Requirements

### Requirement: Permanent purge
The user SHALL be able to permanently delete one trashed item or empty the Trash, after confirmation. The API SHALL expose `DELETE /api/v1/{tasks|projects}/{id}/purge` and `POST /api/v1/trash/purge`, requiring authentication, accepting only entities whose deletion time is set, removing their operations and current values, and recording a purge marker. Purging a project SHALL purge the tasks referencing it. Purging a task SHALL purge its attachments and delete their stored files, and SHALL purge its time entries with markers, so they leave every device, total and export.

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

#### Scenario: Time entries go with the task
- **WHEN** a trashed task with four time entries, one of them another member's, is purged
- **THEN** the four entries are purged with markers, the purge counts report `timeEntries: 4`, the entries are absent from the export and the CSV, and devices drop them on their next sync
