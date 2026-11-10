## ADDED Requirements

### Requirement: App budgets at 10,000 tasks
The app SHALL meet, with the 10,000-task fixture on the iOS simulator of the nightly job, at most:
- cold start with local data to Today drawn: 1,000 ms;
- opening Inbox: 300 ms;
- applying a 500-op pull page: 400 ms, with no frame on the UI thread longer than 50 ms;
- completing a task to the next frame: 16 ms at the 95th percentile;
- resident memory after the scripted session: 180 MB.

The budgets SHALL be kept as data beside the web budgets in `scripts/perf/budgets.json` and published in `docs/performance.md`. A budget SHALL only be raised in a change that states the reason.

#### Scenario: Nightly measurement
- **WHEN** the nightly `app-perf` job runs
- **THEN** it reports each app metric against its budget and fails the run when one is exceeded

#### Scenario: Storage choice
- **WHEN** the storage spike measures both candidates
- **THEN** the numbers of both candidates are recorded in the change's design, and the storage the app uses (a candidate that meets the cold start, Inbox and pull-page budgets, or else the fallback adapter of the design) meets them when `app-perf` measures it
