## ADDED Requirements

### Requirement: Reads do not wait for writes
The server SHALL answer pure reads (lists, records, pulls, exports) from read-only connections while a write is in progress, SHALL keep every transaction that reads then writes on the single writer, and SHALL take the write lock when a write transaction begins. A read started after a commit SHALL see it. Offline behaviour and convergence are unchanged.

#### Scenario: List during a long write
- **WHEN** a large import or purge holds the database's write transaction and a user opens a task list or syncs
- **THEN** the list and the pull answer without waiting for that write to finish

#### Scenario: Own write is visible
- **WHEN** a client saves a change and then lists the same kind of record
- **THEN** the list includes the change

#### Scenario: Two processes write
- **WHEN** a newer server process writes to the data directory while the old one is in a write transaction during a rolling update
- **THEN** the second write waits and succeeds once the first commits, and neither fails with "database is locked"

#### Scenario: Restore
- **WHEN** a confirmed restore is applied and the server opens the restored database
- **THEN** reads come from the restored database, not from connections opened on the previous file

### Requirement: Read cost bounded by the visible data
Listing records and pulling ops SHALL read only the scopes the user can see (their personal data and the shared projects they are a member of), whatever the number of other users on the server. The server SHALL refresh the database's query planner statistics at startup and at least daily. Offline behaviour and convergence are unchanged.

#### Scenario: Member of a shared project lists tasks
- **WHEN** a user who joined one shared project lists their tasks on a server with many other users
- **THEN** the query reads that user's personal rows and the project's rows only, not other users' rows

#### Scenario: First pull after joining
- **WHEN** a member's device pulls its first page from cursor 0
- **THEN** the server reads at most one page of op positions per visible scope before reading the ops, and returns every visible op exactly once in sequence order over the following pages

#### Scenario: Statistics
- **WHEN** the server starts, and once a day while it runs
- **THEN** it refreshes the planner statistics of tables whose size changed a lot, reading a bounded sample
