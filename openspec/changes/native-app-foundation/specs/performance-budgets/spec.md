## ADDED Requirements

### Requirement: App budgets at 10,000 tasks
The app SHALL meet, with the 10,000-task fixture, at most:
- cold start with local data to Today drawn: 1,000 ms on a phone;
- from the app's JavaScript starting to Today drawn: 800 ms on the iOS simulator of the nightly job, where the launch before the first line of JavaScript takes one to two seconds whatever the app does;
- opening Inbox: 300 ms;
- applying a 500-op pull page: 400 ms, with no frame on the JavaScript thread longer than 50 ms;
- completing a task, from the tap's write to the frame that shows the list without it: 50 ms at the 95th percentile;
- resident memory after the scripted session: 180 MB on a phone, and at most 60 MB over the empty app on the simulator, where an empty app already takes about 245 MB.

The phone's limits SHALL be recorded by hand before the app replaces the shells; the simulator's SHALL be measured every night.

The budgets SHALL be kept as data beside the web budgets in `scripts/perf/budgets.json` and published in `docs/performance.md`. A budget SHALL only be raised in a change that states the reason.

#### Scenario: Nightly measurement
- **WHEN** the nightly `app-perf` job runs
- **THEN** it reports each app metric against its simulator budget and fails the run when one is exceeded or was not measured

#### Scenario: Storage choice
- **WHEN** the storage spike measures both candidates
- **THEN** the numbers of both candidates are recorded in the change's design, and the storage the app uses (a candidate that meets the cold start, Inbox and pull-page budgets, or else the fallback adapter of the design) meets them when `app-perf` measures it
