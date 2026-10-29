## ADDED Requirements

### Requirement: Urgency score is derived from a fixed table
Every open task SHALL have an urgency score, a number with two decimals, derived on demand and never stored or written as an operation. It SHALL be the sum of these components, each rounded to two decimals (half away from zero) before summing, where `ramp(d)` is 1.0 for `d <= -7`, 0.2 for `d >= 14` and `0.2 + 0.8 × (14 − d) / 21` otherwise, and `d` is the number of days from the viewer's logical today to a date:
- due: `12.0 × ramp(d)` of the due day in the viewer's zone, 0 without a due date;
- deadline: `8.0 × ramp(d)` of the deadline, 0 without one;
- priority: 6.0 for priority 1, 3.9 for 2, 1.8 for 3, 0 for 4;
- blocks others: 8.0 when the task is in the `blocked_by` of at least one open, not deleted task known on the device;
- age: `2.0 × min(days since created, 365) / 365`;
- running timer: 4.0 while the viewer has a running time entry on the task;
- blocked: −5.0 while the task is blocked (OpenSpec `task-dependencies`);
- deferred: −3.0 while its start date is after the logical today;
- someday: −6.0 while it is parked.
The score SHALL read no user-written content, SHALL be computed from local data so it is available offline, and SHALL be the same on every device holding the same operations, preferences and clock date. Completed and deleted tasks SHALL have no score.

#### Scenario: Due today, priority 1, blocking, a month old
- **WHEN** today is 2026-11-02 and an open priority-1 task is due 2026-11-02, was created 30 days earlier and is a blocker of two open tasks
- **THEN** its score is 22.96, from due 8.80, priority 6.00, blocks others 8.00 and age 0.16

#### Scenario: Nothing set
- **WHEN** an open priority-4 task without due date, deadline, start or blockers is created today
- **THEN** its score is 0.00

#### Scenario: Ramp clamps
- **WHEN** one task is due ten days ago and another is due in thirty days
- **THEN** their due components are 12.00 and 2.40

#### Scenario: Parked and blocked
- **WHEN** an open priority-4 task created today is parked in Someday and blocked by an open task
- **THEN** its score is −11.00

#### Scenario: Blocker completed on another device
- **WHEN** a task's only blocker is completed on another device and this device syncs
- **THEN** the task's blocked component disappears and its score rises by 5.00 without any write

#### Scenario: Day start moves the day
- **WHEN** the day start is 04:00, the local time is 01:30 on Thursday and a task is due on Wednesday
- **THEN** its due component is that of a task due today, 8.80

#### Scenario: Encrypted account
- **WHEN** the account is end-to-end encrypted and the device is locked
- **THEN** every open task still has the same score as when unlocked, because no input is content

### Requirement: Same score in Go and TypeScript
The web client and the server SHALL compute the score with one shared definition each (`web/src/lib/urgency.ts`, `internal/urgency`), and both SHALL pass the shared vectors in `web/src/lib/urgency.vectors.json`, which cover every component, both ramp clamps and its interior, zoned due values across midnight, rounding of a half, a completed blocker and a deleted blocker. Each result SHALL carry its components as stable keys (`due`, `deadline`, `priority`, `blocks`, `age`, `timer`, `blocked`, `deferred`, `someday`) with their values, omitting zero components.

#### Scenario: Vectors agree
- **WHEN** `go test ./internal/urgency/...` and `npm test -- urgency` run on the same vectors file
- **THEN** both pass, with identical scores and component lists for every case

#### Scenario: A change to one side only
- **WHEN** a contributor changes a weight in the TypeScript function without changing Go and the vectors
- **THEN** the vector test fails

### Requirement: Urgency order in agent tools
The MCP and assistant tool `list_tasks` SHALL accept an optional `sort` argument, `default` or `urgency`. With `urgency` it SHALL return the matching tasks ordered by score, highest first, equal scores by due date, priority, position and id, and each result SHALL carry `urgency` and `urgency_parts`. The logical today SHALL be taken in the tool's `timezone` argument with the account's day start. Any other `sort` value SHALL be refused as an invalid argument. Authentication and the read permission rules of the tool are unchanged.

#### Scenario: Most urgent first
- **WHEN** an agent token calls `list_tasks` with `{"view":"all","sort":"urgency"}`
- **THEN** the first result is the open task with the highest score, and its `urgency_parts` list its components

#### Scenario: Invalid sort
- **WHEN** a call sets `sort` to `"random"`
- **THEN** the tool answers with an invalid-argument error naming `sort`, and no tasks are returned

#### Scenario: Without a token
- **WHEN** a request to the MCP endpoint carries no token
- **THEN** it is refused as unauthenticated, as every MCP call

### Requirement: Urgency order in the CLI
`ot list` SHALL accept `--sort urgency`, ordering the fetched tasks with the shared Go definition and printing the score as a column in human output and as `urgency` in `--json`. Without the flag the order is unchanged. An unknown `--sort` value SHALL exit with code 2 and name the allowed values.

#### Scenario: Today by urgency
- **WHEN** the user runs `ot today --sort urgency`
- **THEN** today's and earlier open tasks are printed highest score first, with a score column

#### Scenario: Unknown value
- **WHEN** the user runs `ot list --sort colour`
- **THEN** the command exits with code 2 and lists `default` and `urgency`
