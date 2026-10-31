# op-log-compaction Specification

## Purpose
Defines how the server removes superseded note history from the operation log: which operations go and when (the 30-day grace window from receipt, the daily thinning of note revisions), the background job that does it in small steps, returning freed space to the file system (incremental vacuum and the one-time conversion), and the report the owner sees in the Database storage card.

## Requirements

### Requirement: Superseded note documents are compacted
The server SHALL delete from the operation log every operation of a mergeable document field (a task's, a project's or any later entity's `notes_doc`) that is no longer the current winner of its field in its scope and that the server received more than 30 days ago, in every sharing scope, shared projects included. It SHALL never delete the current winner of any field, SHALL never delete an operation it received in the last 30 days, measured by its own receipt time and never by the author's timestamp, and SHALL never delete operations of other fields except as the note revision thinning of this capability allows. Sequence numbers SHALL never be reused, so every device's cursor stays valid. Compaction SHALL change nothing on devices: offline devices keep editing and queuing as before, and every device SHALL converge on the same note after compaction as it would have without it, because the winner and every operation a device may still need to merge stay in the log for 30 days after receipt.

#### Scenario: Old superseded versions removed
- **WHEN** a task's note was saved 300 times more than 30 days ago and the compaction job runs
- **THEN** the log keeps only the winning `notes_doc` operation of that task, and a new device that signs in receives that one document and shows the same note as the other devices

#### Scenario: Winner kept however old
- **WHEN** a project's note was last edited a year ago and the compaction job runs
- **THEN** the project's winning `notes_doc` and `description` operations are still in the log and the note reads the same everywhere

#### Scenario: Shared project
- **WHEN** members of a shared project edited its tasks' notes more than 30 days ago and the job runs
- **THEN** the superseded documents of the project's scope are deleted, the winners stay, and a member who joins afterwards receives the current notes in the catch-up replay

#### Scenario: Concurrent edits converge after compaction
- **WHEN** device A and device B edit the same note offline, both sync, the merged note is published, and 31 days later the job deletes their superseded documents
- **THEN** both devices and a newly signed-in device show the note with both edits, identically

#### Scenario: Pushed and not yet pulled
- **WHEN** device A pushes a note document, device B pushes a later document of the same note without having pulled A's, and the job runs 10 days later
- **THEN** A's superseded document is not deleted, and device C, signing in on day 12, merges both documents and publishes the union

#### Scenario: Late arrival gets the full window
- **WHEN** a device that edited a note offline 60 days ago reconnects and pushes that edit today, and the edit loses to a newer document
- **THEN** its operation stays in the log for 30 days from today, and the other devices merge its text into the note in the meantime

#### Scenario: Long-offline device
- **WHEN** a device that was offline for 45 days, holding a note edited locally, syncs after compaction removed the superseded documents it never pulled
- **THEN** it pushes its pending edit, receives the winner, merges it with its local document and publishes the union, and every device ends with both its edit and the others'

### Requirement: Note revisions thinned to one per day
For entities with a mergeable document field, the server SHALL delete superseded `description` operations received more than 30 days ago except the one with the greatest timestamp (and device) of each calendar day in UTC per entity, so at least one readable revision per day of editing remains. The winning `description` SHALL always be kept and counts as its day's revision. Thinning SHALL not affect any device's state or convergence, since only superseded values are removed, and SHALL happen whether or not devices are online.

#### Scenario: A busy day becomes one revision
- **WHEN** a task's note was edited 40 times on 2 September (UTC) and the job runs on 31 October
- **THEN** the history of that task lists one revision for 2 September, the last of that day

#### Scenario: Recent revisions untouched
- **WHEN** the same note was edited 20 times yesterday
- **THEN** all 20 revisions are still listed in its history

### Requirement: Compaction runs in the background in small steps
Compaction SHALL be a background job of the server's one job model, due at most once a day and only after data changed since its last complete run, first due no sooner than one hour after the server starts. It SHALL delete in short transactions with a bounded amount of work per run, resuming where it stopped, so a sync push or a REST write never waits for more than a moment. An idle server SHALL run no compaction, and on a host an idle tenant SHALL never be opened for it. A deletion SHALL re-check its conditions at the moment it runs, so an operation that became the winner after it was selected is never deleted. Devices SHALL keep syncing while it runs, offline devices are unaffected, and every device SHALL converge as usual.

#### Scenario: Sync during compaction
- **WHEN** the job is deleting old note versions and a phone pushes 50 operations
- **THEN** the push is applied and acknowledged without a timeout, and the job resumes afterwards

#### Scenario: Idle server
- **WHEN** nothing was written for two days after the last complete run
- **THEN** the job does not run in those two days

#### Scenario: Large backlog
- **WHEN** a server upgraded with two years of note history runs the job for the first time
- **THEN** each run stops after its work budget and the next one continues, until every eligible operation is gone

#### Scenario: Demo instance
- **WHEN** the server runs as a public demo
- **THEN** the job finds nothing to delete, because sandboxes never reach the 30-day window, and it makes no outbound request

### Requirement: Freed space returns to the file system
After a run that deleted operations, the server SHALL return the freed pages of the database file to the file system in bounded steps (incremental vacuum). A database created by this version SHALL be created in the mode that allows it. An existing database SHALL be converted once by rewriting the file, only when no operation was received for 10 minutes (or at the next run once 7 days passed without such a moment) and only when the file system has free space of at least the database's size plus 10 %; otherwise the server SHALL log a warning, keep compacting without shrinking the file, and try again at the next run. While the file is being rewritten, writes SHALL wait and, if they time out, fail as busy so devices retry without losing anything; reads SHALL continue. Offline behaviour and convergence are unaffected.

#### Scenario: File shrinks after compaction
- **WHEN** compaction removes 200 MB of old note versions from a converted database
- **THEN** the database file is about 200 MB smaller after the run or the next few runs

#### Scenario: New database
- **WHEN** a new server creates its database
- **THEN** the database is in incremental vacuum mode from the start and never needs the conversion

#### Scenario: One-time conversion at a quiet moment
- **WHEN** an upgraded server with a 300 MB database and 2 GB free has received no operation for 10 minutes and the job runs
- **THEN** the database is rewritten once, the log says so with the time it took, and later runs only reclaim in small steps

#### Scenario: Not enough disk
- **WHEN** the database is 3 GB and the data directory has 1 GB free
- **THEN** the conversion is not attempted, the log warns with the space needed, compaction still deletes old versions, and the file stops growing

### Requirement: Compaction report and the Database storage card
Each run SHALL log the operations removed, the value bytes removed and the file bytes reclaimed, and SHALL store the last complete run's report with the conversion state on the server. `GET /api/v1/settings/storage` SHALL return the database file size, the free space inside it, the write-ahead log size, the last report and the conversion state, only to the owner, and SHALL be refused on a public demo instance. Settings › Server › Backups SHALL show a Database storage card with those values in words; offline it SHALL say it needs a connection and show nothing stale.

#### Scenario: Owner reads the card
- **WHEN** the owner opens Settings › Server › Backups after a run that removed 12,400 old note versions and reclaimed 210 MB
- **THEN** the Database storage card shows the database size, the free space inside it and "Last compacted" with the date, 12,400 old note versions removed and 210 MB reclaimed

#### Scenario: Waiting for disk space
- **WHEN** the conversion is waiting for free disk space
- **THEN** the card says how much free space the one-time conversion needs, and that old versions are still being removed

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials asks `GET /api/v1/settings/storage`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Member or admin request
- **WHEN** a signed-in member or admin who is not the owner asks for it
- **THEN** the response is 403 `forbidden` and the Database storage card is not shown to them

#### Scenario: Demo instance
- **WHEN** a visitor of the public demo asks for it
- **THEN** the response is 403 `demo_restricted` and nothing about the server's storage is returned

#### Scenario: Offline card
- **WHEN** the owner opens the Backups page without a network
- **THEN** the card says it needs a connection to the server and shows no numbers
