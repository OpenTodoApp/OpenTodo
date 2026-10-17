## ADDED Requirements

### Requirement: Backups check free space first
Before a backup run takes its snapshot, the server SHALL check that there is room for the snapshot (about the database and its write-ahead log) and for the archive (the snapshot plus attachments, uncompressed), plus a 64 MiB margin, on the filesystem each is written to. A run without room SHALL fail at once with an error that says there is not enough free disk space for a backup and how much is needed.

#### Scenario: Disk nearly full
- **WHEN** a scheduled or manual backup starts and the disk cannot hold the snapshot and the archive
- **THEN** the run is recorded as failed with "not enough free disk space for a backup" and the space needed, and nothing is written

#### Scenario: Local destination on another disk
- **WHEN** the local destination folder is on another filesystem than the data directory
- **THEN** the data directory only needs room for the snapshot

### Requirement: Backup temporary files
For the local destination the archive SHALL be written in the destination directory and renamed into place there, never staged in the data directory and copied. Snapshots and archive files left behind by an interrupted run SHALL be removed when the server starts.

#### Scenario: Crash during a backup
- **WHEN** the server crashed during a backup and starts again
- **THEN** the snapshot and the partial archive it left are removed, and archives already complete are kept

### Requirement: Restore extraction is bounded by the manifest
A restore (command line or web) SHALL check, before extracting anything, that the staging directory's filesystem has room for every file the archive's manifest lists, plus the margin. Every listed entry SHALL have exactly the size its manifest entry gives, and at most that many bytes SHALL be written for it; a manifest with a negative size, or an entry whose size differs, SHALL fail the integrity check.

#### Scenario: Entry larger than its manifest entry
- **WHEN** an archive's database or attachment entry is larger than the size in its manifest
- **THEN** the restore stops with an integrity error and nothing beyond the listed size is written

#### Scenario: Manifest larger than the disk
- **WHEN** the files a manifest lists do not fit on the disk
- **THEN** the restore is refused with the space it needs before any file is extracted
