## ADDED Requirements

### Requirement: Standalone notes in the Trash and history
A deleted standalone note SHALL be listed in the Trash with tasks and projects, restorable, and purged permanently by the user, by Empty Trash and by the retention job like a task, and purged with its project. The API SHALL expose `GET /api/v1/notes/{id}/history` and `DELETE /api/v1/notes/{id}/purge`, requiring authentication, with the rules of task history and purge: history lists the note's operations except its document, showing the projection's revisions; purge accepts only a deleted note and leaves a purge marker so devices drop it and late operations are discarded. Deleting and restoring SHALL work offline as operations and converge by last-writer-wins; purging SHALL need a connection.

#### Scenario: Delete and restore
- **WHEN** the user deletes the note "Trip" and later restores it from the Trash
- **THEN** the note is back on the Notes page with its text, on every device after sync

#### Scenario: Retention
- **WHEN** a note has been in the Trash for 31 days with the default retention
- **THEN** it is purged and devices drop it on their next sync

#### Scenario: Purge a project with notes
- **WHEN** a trashed project with two notes is purged
- **THEN** the two notes are purged with it

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials asks for `GET /api/v1/notes/{id}/history` or `DELETE /api/v1/notes/{id}/purge`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Purge a note that is not deleted
- **WHEN** an authenticated client asks to purge a note that is not in the Trash
- **THEN** the response is 409 `not_deleted` and nothing is removed

#### Scenario: Unknown note history
- **WHEN** an authenticated user asks for the history of a note id that does not exist for their account
- **THEN** the response is 404 `not_found`
