## MODIFIED Requirements

### Requirement: Conditions
A condition SHALL be a set of predicates, all of which must hold: `project` (`{in: [ids], descendants?: bool}`, `{not_in: [ids], descendants?: bool}` or `"none"`), `section` (`{in: [ids]}`, `{not_in: [ids]}` or `"none"`), `labels` (`{any?: [ids], all?: [ids], none?: [ids]}`), `priority` (`{in: [1..4]}` or `{not_in: [1..4]}`), `due` (`"none"`, `"set"`, `"today"`, `"overdue"`, `{within_days: 0..365}`), `deadline` (`"none"`, `"set"`, `{within_days: 0..365}`), `start` (`"someday"`, `"deferred"`, `"none"`), `evening` (bool), `blocked` (bool: has at least one open blocker), `assignee` (`"me"`, `"none"`, `"anyone"`), `origin` (`{kind: ...}` from the origin kinds or `"none"`), `habit` (bool), `estimate` (`"none"`, `{min_minutes}`, `{max_minutes}`), `tracked` (`"none"`, `{min_minutes}`), `unchanged` (`{days: 1..365}`: none of the task's own fields changed in the last N days, read from the time of its newest winning field value; comments, time entries and attachments do not count). A `not_in` predicate SHALL hold when the task's value is none of the listed ones; a task without a project or section is in none of them, and `descendants` leaves out the listed projects' sub-projects as well. A predicate SHALL carry exactly one of `in` and `not_in`, with at least one entry. Lists SHALL hold at most 32 ids. Predicates SHALL read only fields and field times the server stores in plaintext for every account, so a condition evaluates the same for an encrypted account. "Today", "overdue", "within N days" and "deferred" SHALL use the user's time zone and day start. The device and the server SHALL evaluate a condition identically, pinned by shared test vectors, and the editor SHALL show how many open tasks match now, computed on the device. A condition is part of the rule's `condition` value: it is edited offline, applied on the device at once and converges as one whole value by last-writer-wins.

#### Scenario: Project with sub-projects
- **WHEN** a condition is `project: {in: ["<Work>"], descendants: true}` and a task sits in "Client A" under "Work"
- **THEN** the task matches on the device and on the server

#### Scenario: Project is not
- **WHEN** a condition is `project: {not_in: ["<Work>"], descendants: true}`
- **THEN** a task in "Home" and a task without a project match, and a task in "Client A" under "Work" does not, on the device and on the server

#### Scenario: No project
- **WHEN** a routine "When a task is created, if it has no project, move it to Triage" has the condition `project: "none"`
- **THEN** a task created without a project moves to Triage, and a task created in "Home" stays there

#### Scenario: Priority is not
- **WHEN** a condition is `priority: {not_in: [1, 2]}`
- **THEN** tasks of priority 3 and 4 match and tasks of priority 1 and 2 do not

#### Scenario: In and not_in together
- **WHEN** a client saves a condition `project: {in: ["a"], not_in: ["b"]}` through `PATCH /api/v1/rules/{id}`, or a `not_in` with no ids
- **THEN** the route answers 400 `invalid_input` naming `condition.project`, and nothing is written

#### Scenario: Within days respects the day start
- **WHEN** the user's day starts at 03:00, it is 01:30 on Tuesday, a task is due Monday, and a rule's condition is `due: "overdue"`
- **THEN** the task does not match yet, and matches from 03:00

#### Scenario: Vectors agree
- **WHEN** the shared vectors file is run by the Go matcher and the TypeScript matcher
- **THEN** every vector gives the same result on both sides, the `not_in` forms included

#### Scenario: Live count in the editor
- **WHEN** the user builds the condition "label errand, due within 3 days" in the editor on a device with eleven such open tasks
- **THEN** the editor reads "11 open tasks match now", from local data, offline as well

#### Scenario: Not changed for 30 days
- **WHEN** today is 2026-11-01, task A's newest field change was on 2026-09-20 and it got a comment on 2026-10-31, task B's newest field change was on 2026-10-25, and a condition is `unchanged: {days: 30}`
- **THEN** A matches and B does not, on the device and on the server, for an encrypted account as well

#### Scenario: A change resets it
- **WHEN** the user renames task A offline on 2026-11-01 and the device syncs
- **THEN** A no longer matches `unchanged: {days: 30}` on any device or on the server

## ADDED Requirements

### Requirement: Older clients and the not_in forms
A value using `not_in` SHALL never make an older client act on more tasks than the condition names. An older server refuses it, so the rule is left out and never runs. An older device's matcher fails on it or does not match, so its device run fails and writes nothing. No `not_in` form SHALL be written as a flag on an `in` form, which an older client would read as its opposite.

#### Scenario: A stale device meets "is not"
- **WHEN** a device of a release before this change, still open on an encrypted account, is sent a device run of a routine whose condition is `priority: {not_in: [1]}`
- **THEN** the device's plan fails, nothing is written, and the run waits for another device or ends as the waiting rule says
