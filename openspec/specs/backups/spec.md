# backups Specification

## Purpose
Defines scheduled, verifiable backups of the server's data directory to local disk, S3-compatible storage or WebDAV, including snapshot consistency, retention, optional encryption, owner-managed configuration, status reporting, the restore procedure and how devices stay convergent after a restore.

## Requirements

### Requirement: Consistent snapshot
A backup SHALL contain a transactionally consistent copy of the database as of one point in time, taken without stopping the server or blocking writers longer than one checkpoint, then every attachment file in the data directory, streamed from disk, with a manifest giving the application and schema versions, creation time, each part's size and checksum, and whether content is encrypted. Secrets under the data directory SHALL be excluded.

#### Scenario: Backup during activity
- **WHEN** a backup runs while devices are syncing and the API is accepting writes
- **THEN** the archive's database opens cleanly, contains every operation committed before the snapshot began, and the manifest checksum matches the content

#### Scenario: Secrets excluded
- **WHEN** an archive is inspected
- **THEN** it contains no destination credentials and no encryption passphrase

#### Scenario: Attachment files included
- **WHEN** a backup runs on a server holding 3 GB of attachment files
- **THEN** the archive carries each file under `attachments/` after the database, the manifest lists each with its size and SHA-256, and the run's memory use stays at a few megabytes

#### Scenario: File added during the backup
- **WHEN** an attachment is uploaded after the database snapshot was taken but before the archive is complete
- **THEN** the archive is still valid: the file is either absent (its row is absent from the snapshot too) or present as an extra file that a restore keeps and the orphan sweep ignores for seven days

### Requirement: Destinations
Backups SHALL be writable to a local directory (default `<data>/backups`), to an S3-compatible bucket (endpoint, region, bucket, prefix, access key, secret key, path-style option) and to a WebDAV collection (URL, username, password). Uploads SHALL stream so that memory use does not grow with the archive size. A "test destination" action SHALL write and delete a small probe object and report the outcome. No network request SHALL be made to any destination until the owner configured it.

#### Scenario: Test an S3-compatible destination
- **WHEN** the owner saves S3 settings and runs the destination test
- **THEN** a probe object is written under the configured prefix, deleted again, and the result shows success or the destination's error message

#### Scenario: Unreachable WebDAV server
- **WHEN** a scheduled backup cannot reach the configured WebDAV URL
- **THEN** the run is recorded as `failed` with the connection error, the local snapshot is removed, and the next run happens at the next scheduled time

### Requirement: Schedule and retention
The owner SHALL be able to enable a schedule (hourly, daily or weekly at a chosen time, evaluated in the server's time zone) and a retention policy (keep the last N backups, N at least 1 and default 7, and optionally delete backups older than D days). Retention SHALL be applied at the destination after a successful run and SHALL never delete the backup just written. A missed run (server stopped) SHALL execute once at startup when the schedule was due.

#### Scenario: Retention after a run
- **WHEN** the policy keeps 7 backups, 7 exist and a new one succeeds
- **THEN** the oldest is deleted and the newest remains

#### Scenario: Missed schedule
- **WHEN** a daily backup was due while the server was stopped and the server starts again
- **THEN** a backup runs shortly after startup and the schedule continues from the configured time

### Requirement: Optional encryption at rest
When the owner sets a passphrase, archives SHALL be encrypted with an authenticated symmetric cipher using a key derived from the passphrase with a memory-hard function, in a documented streaming format, so that a restore needs only the binary, the archive and the passphrase. The manifest SHALL state that the archive is encrypted. Changing the passphrase SHALL affect future backups only.

#### Scenario: Encrypted archive without passphrase
- **WHEN** a restore is attempted on an encrypted archive without the passphrase
- **THEN** the restore fails before touching the data directory, naming the missing passphrase

#### Scenario: Tampered archive
- **WHEN** a byte of an encrypted archive is modified and a restore is attempted
- **THEN** the restore fails with an integrity error and the current database is unchanged

### Requirement: Owner-managed configuration and secrets
Backup settings SHALL be manageable by the owner from Settings and through `GET`/`PUT /api/v1/backups/settings`; members SHALL be refused. Credentials and the passphrase SHALL live only in a secrets file under the data directory readable by the server alone, SHALL never be returned by the API (only their presence) and SHALL never be logged. Optional `OPENTODO_BACKUP_*` variables MAY preset settings; UI changes take precedence. With nothing set, no backup runs.

#### Scenario: Member is refused
- **WHEN** a signed-in member requests any `/api/v1/backups/*` route
- **THEN** the response is a 403 `forbidden` error

#### Scenario: Anonymous request
- **WHEN** a request without credentials reaches `/api/v1/backups/settings`
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Invalid settings
- **WHEN** the owner submits an S3 destination without a bucket or a retention count of 0
- **THEN** the response is a 400 `invalid_input` error naming the field and the previous settings remain active

### Requirement: Status and manual run
`GET /api/v1/backups` SHALL report the enabled state, next scheduled run, the last run (time, outcome, size, duration, error) and the recent history; `POST /api/v1/backups/run` SHALL start a backup immediately and return 202. Settings SHALL show the same information. Because backups run on the server, the screen SHALL show the last fetched status while offline and disable actions until the connection returns.

#### Scenario: Back up now
- **WHEN** the owner triggers a manual backup
- **THEN** the status shows a run in progress, then its outcome and size without a page reload

#### Scenario: Run already in progress
- **WHEN** a manual run is requested while a backup is running
- **THEN** the response is a 409 `conflict` error and no second run starts

### Requirement: Restore procedure
The binary SHALL offer `restore <archive>`, which verifies the manifest checksum, decrypts when needed, refuses newer schema versions, keeps a timestamped safety copy of the database, replaces it, writes each attachment file after checking its size and checksum (renamed into place) while keeping files the archive lacks, and migrates on the next start. It SHALL refuse to run while a server holds the database. The web app restore SHALL do the same. `docs/backups.md` SHALL document both.

#### Scenario: Successful restore
- **WHEN** the operator stops the server, runs `opentodo restore backup.tar` and starts the server
- **THEN** accounts, tokens, projects, tasks, attachments with their files and the operation log match the archive and a safety copy of the previous database exists

#### Scenario: Newer archive
- **WHEN** an archive produced by a newer schema version is restored with an older binary
- **THEN** the command exits non-zero naming both versions and changes nothing

#### Scenario: Same result from the web app and the CLI
- **WHEN** the same archive is restored once with `opentodo restore` and once from Settings → Backups on identical servers
- **THEN** both servers end with the same accounts, projects, tasks, attachments and operation log, each with a safety copy and a new log generation

#### Scenario: Corrupt attachment file
- **WHEN** an attachment entry's checksum does not match the manifest
- **THEN** the restore fails with an integrity error before replacing the database and the data directory is unchanged

#### Scenario: Archive without attachments
- **WHEN** an archive made before attachments existed is restored
- **THEN** the database is restored as before and the attachment directory is left as it is

### Requirement: Devices stay convergent after a restore
The server SHALL carry a log generation identifier that changes on every restore and SHALL include it in sync responses. A client that sees a generation other than the one it stored SHALL reset its cursor, keep its outbox, re-emit every local field with its stored timestamp and device as new operations, then re-pull, so post-backup edits win by the ordinary last-writer-wins rule. Offline clients SHALL do this on their next successful exchange.

#### Scenario: Edits after the backup survive
- **WHEN** a task was created on a device after the backup, the server is restored from that backup, and the device syncs
- **THEN** the task exists on the server again and on every other device after their next sync, and no duplicate task is created

#### Scenario: Two devices re-seed concurrently
- **WHEN** two devices with different local edits both detect the new generation and re-seed
- **THEN** every field ends with the value carrying the greatest stored timestamp on the server and on both devices

### Requirement: Archives can be read back from destinations
Every destination kind (local directory, S3-compatible bucket, WebDAV collection) SHALL support reading an archive back by name as a stream, so that a restore never holds the whole archive in memory. Reading SHALL only accept names of OpenTodo archives, never paths, and SHALL report the destination's error without exposing credentials.

#### Scenario: Read back from S3
- **WHEN** the owner restores an archive that lives in the configured S3 bucket
- **THEN** the server downloads it by streaming into its data directory, and memory use does not grow with the archive size

#### Scenario: Path in an archive name
- **WHEN** a request names `../opentodo.db` or any name that is not an OpenTodo archive
- **THEN** it is refused with 400 `invalid_input`, and no destination is contacted

### Requirement: One archive format for hosted and self-hosted data
A tenant export from a host, and the owner's download of a hosted tenant, SHALL be the same backup archive format as a self-hosted backup, readable by `opentodo restore` and by tenant creation from an archive, in both directions. A restored archive SHALL get a fresh log generation, so devices re-send their local changes and converge as after any restore.

#### Scenario: Self-hosted to hosted
- **WHEN** a self-hosted owner's backup archive is used to create a hosted tenant
- **THEN** the tenant contains the same data, and encrypted archives ask for their passphrase as in a restore

#### Scenario: Hosted to self-hosted
- **WHEN** a hosted tenant's archive is restored with `opentodo restore` into an empty data directory
- **THEN** the self-hosted server starts with the tenant's accounts and data, and its owner signs in with the same credentials
