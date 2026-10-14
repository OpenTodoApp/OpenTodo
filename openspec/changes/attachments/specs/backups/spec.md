# Spec Delta

## MODIFIED Requirements

### Requirement: Consistent snapshot
A backup SHALL contain a transactionally consistent copy of the database as of a single point in time, taken without stopping the server or blocking writers for longer than a single checkpoint, followed by every attachment file present in the data directory, streamed from disk without being loaded into memory, together with a manifest stating the application version, schema version, creation time and, for the database and each file, size and checksum, and whether the content is encrypted. Secrets stored under the data directory SHALL be excluded from the archive.

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

### Requirement: Restore procedure
The binary SHALL offer a `restore <archive>` subcommand that verifies the manifest checksum, decrypts when needed, refuses archives from a newer schema version, keeps a timestamped safety copy of the current database beside it, replaces the database, writes every attachment file of the archive into the data directory after verifying its size and checksum (streamed, each file renamed into place), keeps files already on disk that the archive does not hold, and applies pending migrations on next start. It SHALL refuse to run while a server process holds the database. The procedure SHALL be documented in `docs/backups.md`.

#### Scenario: Successful restore
- **WHEN** the operator stops the server, runs `opentodo restore backup.tar` and starts the server
- **THEN** accounts, tokens, projects, tasks, attachments with their files and the operation log match the archive and a safety copy of the previous database exists

#### Scenario: Newer archive
- **WHEN** an archive produced by a newer schema version is restored with an older binary
- **THEN** the command exits non-zero naming both versions and changes nothing

#### Scenario: Corrupt attachment file
- **WHEN** an attachment entry's checksum does not match the manifest
- **THEN** the restore fails with an integrity error before replacing the database and the data directory is unchanged

#### Scenario: Archive without attachments
- **WHEN** an archive made before attachments existed is restored
- **THEN** the database is restored as before and the attachment directory is left as it is
