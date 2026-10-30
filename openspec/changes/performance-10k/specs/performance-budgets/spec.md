## ADDED Requirements

### Requirement: Deterministic 10,000-task fixture
The repository SHALL provide a command, never linked into the server, that builds from a fixed seed a data directory holding one account with 10,000 tasks (6,000 open, 3,500 completed, 500 in the Trash), 60 projects of which one holds 2,000 open tasks and 3 are shared with a second member, 150 sections, 40 labels, 1,500 subtasks, 2,000 tasks with notes, 3,000 due dates, 400 recurring tasks, 600 reminders, 2,000 comments, 1,000 time entries and 8 saved views, plus a variant of the same account with end-to-end encryption on. Every row SHALL be written through the operation log. Two runs with the same seed SHALL produce the same entity ids, field values and counts, and the command SHALL write a summary of the counts and the ids the benchmarks use.

#### Scenario: Same seed, same data
- **WHEN** the fixture command runs twice with the default seed into two empty directories
- **THEN** both summaries are identical and a sync pull from cursor 0 returns the same entity ids and values in both

#### Scenario: Data arrives through ops
- **WHEN** a device signs in to the fixture account
- **THEN** it receives all 10,000 tasks by ordinary sync pulls, because every row has its ops in the log

### Requirement: Notes fixture and storage budgets
The repository SHALL provide, through the same fixture command, a nightly-only notes fixture on top of the 10,000-task account: 500 notes growing to about 10 KB of text each, half standalone notes (task notes until standalone notes exist) and half task notes, each saved about 300 times over twelve months, with 50 of them edited within the last 30 days, written through the operation log with real mergeable documents and receipt times spread over the year. After the server's compaction has run to completion, the nightly benchmark SHALL measure and gate: the database file at most 250 MB, of which the notes' share at most 100 MB; a full compaction of the fixture within 120 s with no write waiting more than 100 ms behind it; the first sync of a new device within 45 s on desktop, 110 s in the phone profile and 120 s on the reference phones; IndexedDB usage after that sync at most 120 MB on desktop; opening the Notes page within 400 ms and 1,200 ms and a note search keystroke at the 95th percentile within 50 ms and 150 ms once the Notes page exists; and the JavaScript heap after the notes session at most 170 MB. It SHALL also report, ungated, the database size before compaction, the operations and bytes compaction removed and the bytes the first sync pulled. Every device of the benchmark SHALL end with identical notes, so compaction is shown not to break convergence. A failing phone first-sync or IndexedDB budget SHALL lead to a separate change for loading note bodies on demand rather than to a raised budget.

#### Scenario: Compaction shrinks the notes fixture
- **WHEN** the nightly run generates the notes fixture (about 2 GB of log) and the compaction job completes
- **THEN** the database file is at most 250 MB, and the report shows the size before and the operations and bytes removed

#### Scenario: Phone first sync with notes
- **WHEN** a new device in the phone profile signs in to the compacted notes account
- **THEN** all tasks and notes are local within 110 s, and the device shows the same notes as the desktop device

#### Scenario: Compaction regresses
- **WHEN** a change makes compaction keep every superseded note version
- **THEN** the nightly benchmark fails naming "database file after compaction" with its size and the 250 MB budget

#### Scenario: Phone budget missed
- **WHEN** the reference phone's first sync of the notes account takes 160 s
- **THEN** the record links an issue proposing note bodies on demand, and the budget is not raised

### Requirement: Published performance budgets
The repository SHALL publish `docs/performance.md` with the budgets kept as data in `scripts/perf/budgets.json`, and the repository checks SHALL fail when the two differ. With the 10,000-task fixture, the budgets SHALL be at most: cold start with local data to the Today list ready 1,200 ms on desktop and 3,000 ms in the phone profile (4× CPU throttling, 412×915 viewport); opening the 2,000-task project 400 ms and 1,200 ms; search keystroke to updated results at the 95th percentile 50 ms and 150 ms; evaluating an 8-clause saved view 100 ms and 300 ms; completing a task in the 2,000-row list to the next paint at the 95th percentile 50 ms and 150 ms; a cursor move to the next paint at the 95th percentile 16 ms and 50 ms; first sync of a new device 30 s and 75 s, with no main-thread task longer than 200 ms on desktop; a remote edit painted on another device within 1,000 ms over the live channel; JavaScript heap after the scripted session 150 MB; IndexedDB usage 80 MB. Server budgets SHALL be at most: start to healthy 2 s; idle resident memory 60 MB; peak resident memory 150 MB during one device's full first pull and 200 MB during the JSON export; a 1,000-operation pull page 80 ms and a 100-operation push 100 ms at the 95th percentile; listing the 2,000-task project over REST 150 ms and reading one task 10 ms at the 95th percentile; the full JSON export 3 s; the MCP `search_tasks` tool 200 ms at the 95th percentile; database file 150 MB. A budget SHALL only be raised in a change that states the reason.

#### Scenario: Reading the budgets
- **WHEN** a self-hoster opens `docs/performance.md`
- **THEN** it lists every metric with its limit per setting, the fixture's composition, and the latest reference-device results

#### Scenario: Budget file and page disagree
- **WHEN** a change raises the search budget in `budgets.json` without updating the docs page
- **THEN** the repository check fails naming the metric

### Requirement: Count checks at 10,000 tasks on every pull request
CI SHALL run, on every pull request that changes code, deterministic scale tests at 10,000 tasks that assert counts rather than times: opening Today reads the tasks table at most once; a search keystroke performs no IndexedDB read; completing a task in a 2,000-row list re-renders at most 3 rows; each pulled page is applied in one local transaction; a pull page runs a number of database queries independent of the account size; a push of 100 operations runs a bounded number of statements per operation; and the export's allocations per task stay below a fixed bound. Offline behaviour and convergence SHALL be unchanged by any optimisation these tests guard: the scale tests SHALL also assert that two devices applying the fixture's ops in different orders end with identical rows.

#### Scenario: A search reads the database per keystroke
- **WHEN** a change makes the palette query IndexedDB on every keystroke
- **THEN** the web scale tests fail naming the search test and the read count

#### Scenario: A pull page query grows with the account
- **WHEN** a change makes the pull page query once per project
- **THEN** the Go scale test fails with the query count at 60 projects against the bound

#### Scenario: Convergence at scale
- **WHEN** the scale test applies the fixture's ops to two local stores in two different orders
- **THEN** the two stores hold identical rows

### Requirement: Nightly time benchmark
A nightly workflow SHALL build the server, generate the fixture, and measure every desktop, phone-profile and server budget five times, failing when a median exceeds its budget and reporting the failure through the nightly alert with the metric, the median and the budget. `make perf` SHALL run the same benchmark locally. The app SHALL expose its measurement points only as entries in the browser's own performance timeline and SHALL NOT send them anywhere.

#### Scenario: Slower first sync
- **WHEN** a merged change makes the desktop first sync take a median of 41 s
- **THEN** the nightly benchmark fails and the alert names "first sync, desktop, 41 s, budget 30 s"

#### Scenario: No telemetry
- **WHEN** the benchmark runs the app with network logging
- **THEN** no request carries the measurement marks and the only requests go to the local server

### Requirement: Reference device results before every minor release
Before every minor release, the budgets marked for reference devices SHALL be measured on a 2022 mid-range Android phone in the Android shell, an iPhone 12 in the iOS shell, and the server metrics on a Raspberry Pi 4 with 4 GB, and recorded in `docs/performance/results-<version>.md` with the device, OS version, app version and each value. Device budgets SHALL be at most: cold start 3,000 ms; opening the 2,000-task project 1,200 ms; search keystroke 150 ms and completing a task 150 ms at the 95th percentile; first sync 90 s; app process memory 350 MB; Raspberry Pi server values at most four times the CI server budgets. `make release-prepare` SHALL refuse a minor release without the record or with a value over budget that does not link an issue.

#### Scenario: Releasing without device results
- **WHEN** a maintainer runs `make release-prepare VERSION=1.1.0` and `docs/performance/results-1.1.0.md` does not exist
- **THEN** the command fails naming the missing record

#### Scenario: Over budget with an issue
- **WHEN** the record shows first sync on the iPhone at 97 s with a link to an open issue
- **THEN** the release may proceed and `docs/performance.md` shows the value as over budget with the issue
