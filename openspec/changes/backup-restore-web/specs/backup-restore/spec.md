# Spec Delta

## Purpose

Lets the owner restore the whole server from a backup archive inside the web app, with the same verification and safety copy as the `opentodo restore` command and without shell access to the host.

## ADDED Requirements

### Requirement: List restorable archives
`GET /api/v1/backups/archives` SHALL return the OpenTodo archives in the configured destination, newest first, each with name, size, creation time and whether it is encrypted. Settings → Backups SHALL show this list. Objects that are not OpenTodo archives SHALL be omitted. When the destination cannot be reached, the response SHALL be a 502 `destination_error` naming the destination without credentials.

#### Scenario: Archives from the destination
- **WHEN** the owner opens the restore section and the S3 destination holds three archives and an unrelated object
- **THEN** the three archives are listed newest first with date, size and an encrypted marker, and the unrelated object is not

#### Scenario: Destination unreachable
- **WHEN** the WebDAV destination is down while the owner opens the restore section
- **THEN** the list shows an error naming the destination, and uploading an archive remains possible

#### Scenario: Non-owner
- **WHEN** an admin or member calls `GET /api/v1/backups/archives`
- **THEN** the response is 403 `forbidden` and no destination is contacted

#### Scenario: Not signed in
- **WHEN** a request without a session or token calls `GET /api/v1/backups/archives`
- **THEN** the response is 401 `unauthorized`

### Requirement: Upload an archive
`POST /api/v1/backups/restore/uploads` SHALL accept an archive as the raw request body and stream it to the data directory without buffering it in memory. It SHALL return 201 with an upload id and the archive's manifest summary. It SHALL refuse a body larger than the free disk space can hold for a restore (archive size plus twice the current database size) with 507 `insufficient_storage`, and anything that is not an OpenTodo archive with 400 `integrity`.

#### Scenario: Upload from another server
- **WHEN** the owner uploads `opentodo-20261010-030000-4f1c0a9e.tar.gz` made on another host
- **THEN** the response is 201 with an upload id and the archive's creation date, schema version and encrypted flag

#### Scenario: Not an archive
- **WHEN** the owner uploads a photo by mistake
- **THEN** the response is 400 `integrity`, nothing is kept in the data directory, and the screen says the file is not an OpenTodo backup

#### Scenario: Disk too full
- **WHEN** the free space cannot hold the archive plus twice the current database
- **THEN** the response is 507 `insufficient_storage` stating the space needed, and the partial upload is removed

#### Scenario: Upload by a non-owner
- **WHEN** a member posts to `/api/v1/backups/restore/uploads`
- **THEN** the response is 403 `forbidden` and the body is not stored

### Requirement: Verify and preview before restoring
`POST /api/v1/backups/restore/prepare` SHALL take an archive from the destination list or an upload id, plus an optional passphrase. It SHALL run every check of the restore procedure without touching the live database and return a preview: creation time, app version, schema version, archive size, and counts of accounts, projects, live tasks and operations. Encrypted archives SHALL be tried with the stored backup passphrase when none is given.

#### Scenario: Preview of a valid archive
- **WHEN** the owner prepares last night's archive from the destination
- **THEN** the screen shows its date, versions, size and the numbers of accounts, projects and tasks, and the live database is unchanged

#### Scenario: Encrypted archive from this server
- **WHEN** the owner prepares an encrypted archive made with the passphrase stored in the backup settings
- **THEN** it is verified without asking for a passphrase

#### Scenario: Wrong or missing passphrase
- **WHEN** an encrypted archive from another server is prepared without the right passphrase
- **THEN** the response is 422 `passphrase_required` (none given) or `passphrase_invalid` (wrong one), and the screen asks for the passphrase

#### Scenario: Newer schema
- **WHEN** the archive was made by a newer schema version than this binary supports
- **THEN** the response is 409 `newer_schema` naming both versions, and the restore cannot continue

#### Scenario: Damaged archive
- **WHEN** the checksum or SQLite integrity check fails
- **THEN** the response is 400 `integrity` describing the failed check, and the staged files are removed

#### Scenario: Prepare without a session
- **WHEN** an unauthenticated request posts to `/api/v1/backups/restore/prepare`
- **THEN** the response is 401 `unauthorized`

### Requirement: Confirmed restore applies through a self-restart
`POST /api/v1/backups/restore` SHALL take a prepared restore id and the confirmation word `RESTORE`. It SHALL require a session that re-authenticated within the fresh window, answer 202, and then restart the server: shut down gracefully, apply the restore before the database reopens, and start again in the same process. The restore SHALL be refused with 409 `conflict` while a backup run is in progress.

#### Scenario: Successful web restore
- **WHEN** the owner re-authenticates, types `RESTORE` and confirms a prepared restore
- **THEN** the server restarts, its accounts, tokens, projects, tasks and operation log match the archive, a safety copy of the previous database exists, and the log generation is new

#### Scenario: Stale session
- **WHEN** the confirmation comes from a session that has not re-authenticated within the fresh window
- **THEN** the response is 403 `reauth_required`, the re-authentication dialog opens, and nothing is restored

#### Scenario: API token instead of a session
- **WHEN** a full-scope API token calls `POST /api/v1/backups/restore`
- **THEN** the response is 403 `session_required`, and nothing is restored

#### Scenario: Missing confirmation word
- **WHEN** the request omits the confirmation word or sends a different one
- **THEN** the response is 400 `invalid_input` with field `confirm`, and nothing is restored

#### Scenario: Unknown or expired prepared id
- **WHEN** the prepared id does not exist or has expired
- **THEN** the response is 404 `not_found`, and the screen asks the owner to prepare the archive again

#### Scenario: Backup running
- **WHEN** a scheduled backup is running at the moment the owner confirms
- **THEN** the response is 409 `conflict`, and the owner can retry once the run finishes

#### Scenario: Demo instance
- **WHEN** a visitor on the public demo instance calls any `/api/v1/backups/restore` route
- **THEN** the demo deny list refuses it, and the panel shows the demo note instead of the restore section

### Requirement: Restore state across the restart
The web app SHALL show restart progress after confirming, poll until the server answers again, and then reload. After the restart, the restore section SHALL report the outcome of the last restore: time, archive, who requested it, and success or the error. A restore that fails while applying SHALL leave the previous database in place, start the server normally and record the failure.

#### Scenario: Owner watches the restart
- **WHEN** the owner confirms a restore
- **THEN** the screen shows "Restoring and restarting…", then reloads into the restored data once the server answers

#### Scenario: Owner's session predates the restore
- **WHEN** the owner's session was created after the backup was taken
- **THEN** after the restart the sign-in screen opens with a note that the server was restored from a backup

#### Scenario: Apply fails
- **WHEN** the staged database fails its final check while being applied
- **THEN** the server starts on the previous database, and the restore section and the audit log show the failure and its reason

### Requirement: Undo the last restore
While the safety copy from the last restore exists, the restore section SHALL offer to put it back. Undoing SHALL follow the same confirmation, re-authentication and self-restart as a restore, keep a safety copy of the database it replaces, and give the log a new generation.

#### Scenario: Undo
- **WHEN** the owner restored the wrong archive and chooses "Undo last restore"
- **THEN** after confirmation and restart the server runs on the database as it was before that restore, and devices re-sync

#### Scenario: Safety copy deleted
- **WHEN** the safety copy of the last restore has been deleted
- **THEN** "Undo last restore" is not offered

### Requirement: Manage safety copies
The restore section SHALL list the `opentodo.db.pre-restore-<timestamp>` safety copies in the data directory with their time and size, and SHALL let the owner delete one after a confirmation. Deleting SHALL require a fresh re-authentication.

#### Scenario: Free disk space
- **WHEN** the owner deletes an old safety copy and confirms
- **THEN** the file is removed from the data directory and the list and free space update

#### Scenario: Delete by non-owner
- **WHEN** a member calls the delete route for a safety copy
- **THEN** the response is 403 `forbidden` and the file remains

### Requirement: Staged restores expire
A prepared or uploaded restore that is not confirmed within 30 minutes SHALL be discarded, and so SHALL any staged files left over when the server starts. The owner SHALL be able to cancel a prepared restore at any time.

#### Scenario: Owner walks away
- **WHEN** the owner prepares a restore and does not confirm for 30 minutes
- **THEN** the staged files are removed, and confirming afterwards answers 404 `not_found`

#### Scenario: Cancel
- **WHEN** the owner cancels a prepared restore
- **THEN** the staged files are removed immediately

### Requirement: Restore is audited
The audit log SHALL record a requested restore (actor, archive name), its outcome (`backup.restored` on success, a failure event with the reason otherwise), undoing a restore, and deleting a safety copy.

#### Scenario: Audit trail
- **WHEN** the owner restores an archive through the web app
- **THEN** the audit log shows the request with the owner and the archive name, followed by `backup.restored`

### Requirement: Offline and convergence behavior
Restore actions SHALL need a connection; offline, the restore section SHALL show the last fetched state with its actions disabled. A restore SHALL change the log generation, so every device, including ones offline during the restore, re-seeds on its next successful sync, as required by the `backups` capability.

#### Scenario: Offline owner
- **WHEN** the owner opens the restore section without a connection
- **THEN** the archive list and actions are disabled with a note that restore runs on the server

#### Scenario: Device offline during restore
- **WHEN** a phone was offline during a web restore and holds a task created after the backup
- **THEN** on its next sync it re-seeds, the task reappears on the server, and no duplicate is created
