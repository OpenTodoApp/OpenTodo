## MODIFIED Requirements

### Requirement: Compaction runs in the background in small steps
Compaction SHALL be a background job of the server's one job model, due at most once a day and only after data changed since its last complete run, first due no sooner than one hour after the server starts. It SHALL delete in short transactions with a bounded amount of work per run, resuming where it stopped, so a sync push or a REST write never waits for more than a moment: a deletion transaction SHALL hold the database's write access for about 20 milliseconds at most before it lets waiting writes go first. Its work SHALL grow in proportion to the size of the log (each operation's metadata read a bounded number of times per pass, never once per other revision of the same note), and it SHALL make progress on a log of any size, finishing a pass over a year of heavy note history in minutes. An idle server SHALL run no compaction, and on a host an idle tenant SHALL never be opened for it. A deletion SHALL re-check its conditions at the moment it runs, so an operation that became the winner after it was selected, or that is no longer superseded by a later revision of its day, is never deleted. Devices SHALL keep syncing while it runs, offline devices are unaffected, and every device SHALL converge as usual.

#### Scenario: Sync during compaction
- **WHEN** the job is deleting old note versions and a phone pushes 50 operations
- **THEN** the push is applied and acknowledged without a timeout, and the job resumes afterwards

#### Scenario: Writes wait only a moment
- **WHEN** a device pushes one operation every 50 milliseconds while the job compacts a year of history of 500 notes saved 300 times each
- **THEN** no push waits more than about a tenth of a second behind the job

#### Scenario: Idle server
- **WHEN** nothing was written for two days after the last complete run
- **THEN** the job does not run in those two days

#### Scenario: Large backlog
- **WHEN** a server upgraded with two years of note history runs the job for the first time
- **THEN** each run stops after its work budget and the next one continues from where it stopped, also after a restart, until every eligible operation is gone

#### Scenario: Heavily edited note
- **WHEN** one note was saved 300 times on 20 days more than 30 days ago
- **THEN** the job reads that note's revisions once per pass to decide what goes, keeps the winner and the last revision of each of the 20 days, and deletes the rest

#### Scenario: Demo instance
- **WHEN** the server runs as a public demo
- **THEN** the job finds nothing to delete, because sandboxes never reach the 30-day window, and it makes no outbound request

### Requirement: Freed space returns to the file system
After deleting operations, the server SHALL return the freed pages of the database file to the file system in bounded steps (incremental vacuum), each step sized to hold the database's write access for about 20 milliseconds, alternating with the deletions of the same run so the free space inside the file stays small while it works. A database created by this version SHALL be created in the mode that allows it. An existing database SHALL be converted once by rewriting the file, only when no operation was received for 10 minutes (or at the next run once 7 days passed without such a moment) and only when the file system has free space of at least the database's size plus 10 %; otherwise the server SHALL log a warning, keep compacting without shrinking the file, and try again at the next run. While the file is being rewritten, writes SHALL wait and, if they time out, fail as busy so devices retry without losing anything; reads SHALL continue. Offline behaviour and convergence are unaffected.

#### Scenario: File shrinks after compaction
- **WHEN** compaction removes 200 MB of old note versions from a converted database
- **THEN** the database file is about 200 MB smaller after the run or the next few runs

#### Scenario: A year of history
- **WHEN** compaction removes 2 GB of old note versions from a 2.6 GB database
- **THEN** the file shrinks to about the size of what remains within the same runs, and no write waits more than about a tenth of a second for it

#### Scenario: New database
- **WHEN** a new server creates its database
- **THEN** the database is in incremental vacuum mode from the start and never needs the conversion

#### Scenario: One-time conversion at a quiet moment
- **WHEN** an upgraded server with a 300 MB database and 2 GB free has received no operation for 10 minutes and the job runs
- **THEN** the database is rewritten once, the log says so with the time it took, and later runs only reclaim in small steps

#### Scenario: Not enough disk
- **WHEN** the database is 3 GB and the data directory has 1 GB free
- **THEN** the conversion is not attempted, the log warns with the space needed, compaction still deletes old versions, and the file stops growing
