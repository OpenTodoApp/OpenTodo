# Spec Delta

## MODIFIED Requirements

### Requirement: Restore procedure
The binary SHALL offer a `restore <archive>` subcommand that verifies the manifest checksum, decrypts when needed, refuses archives from a newer schema version, keeps a timestamped safety copy of the current database beside it, replaces the database and applies pending migrations on next start. It SHALL refuse to run while a server process holds the database. The owner SHALL also be able to restore from the web app (see the `backup-restore` capability); both paths SHALL use the same verification, safety copy and generation change. The procedure SHALL be documented in `docs/backups.md`.

#### Scenario: Successful restore
- **WHEN** the operator stops the server, runs `opentodo restore backup.tar` and starts the server
- **THEN** accounts, tokens, projects, tasks and the operation log match the archive and a safety copy of the previous database exists

#### Scenario: Newer archive
- **WHEN** an archive produced by a newer schema version is restored with an older binary
- **THEN** the command exits non-zero naming both versions and changes nothing

#### Scenario: Same result from the web app and the CLI
- **WHEN** the same archive is restored once with `opentodo restore` and once from Settings → Backups on identical servers
- **THEN** both servers end with the same accounts, projects, tasks and operation log, each with a safety copy and a new log generation

## ADDED Requirements

### Requirement: Archives can be read back from destinations
Every destination kind (local directory, S3-compatible bucket, WebDAV collection) SHALL support reading an archive back by name as a stream, so that a restore never holds the whole archive in memory. Reading SHALL only accept names of OpenTodo archives, never paths, and SHALL report the destination's error without exposing credentials.

#### Scenario: Read back from S3
- **WHEN** the owner restores an archive that lives in the configured S3 bucket
- **THEN** the server downloads it by streaming into its data directory, and memory use does not grow with the archive size

#### Scenario: Path in an archive name
- **WHEN** a request names `../opentodo.db` or any name that is not an OpenTodo archive
- **THEN** it is refused with 400 `invalid_input`, and no destination is contacted
