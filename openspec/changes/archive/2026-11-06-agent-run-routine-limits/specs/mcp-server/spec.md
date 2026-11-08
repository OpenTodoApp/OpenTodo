## ADDED Requirements

### Requirement: Routine runs within the agent write limits
A `run_routine` call that may write (not a test) SHALL run only within what is left of the calling token's changed items for the UTC day. Before the run, the server SHALL hold the rest of that budget. When nothing is left, it SHALL answer `rate_limited` with `retry_after_seconds` and SHALL NOT run the routine. A run that plans more writes than were held SHALL write nothing and SHALL be logged as failed with the reason. After the run, the items it did not write SHALL go back to the budget. A run on the person's device, which the server cannot cap before it writes, SHALL book what it wrote. A test SHALL NOT be limited by the daily items. The counters SHALL stay in server memory; runs write through the operation log as before, so offline devices converge on what a run wrote and a refused run writes nothing to sync.

#### Scenario: Budget spent
- **WHEN** an `agent` token has changed 1,000 items today and calls `run_routine` without `test`
- **THEN** the answer is `rate_limited` with `retry_after_seconds`, the routine does not run and nothing is written

#### Scenario: Run larger than what is left
- **WHEN** an `agent` token has 2 items left today and calls `run_routine` on a routine that would create 3 tasks
- **THEN** the run writes nothing, its log entry is failed with the reason naming the 2 items left, and the 2 items are still left

#### Scenario: Unused items go back
- **WHEN** an `agent` token has 5 items left and runs a routine that writes 3
- **THEN** the run is applied and the token has 2 items left

#### Scenario: Test past the limit
- **WHEN** an `agent` token has no items left and calls `run_routine` with `test: true`
- **THEN** the test runs and nothing is written or counted
