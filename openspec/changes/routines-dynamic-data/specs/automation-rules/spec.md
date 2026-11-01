## MODIFIED Requirements

### Requirement: Rule validation
The sync and API write paths SHALL accept a `trigger` only when it is an object with a `kind` from the closed set `task.created`, `task.completed`, `task.reopened`, `label.added`, `label.removed`, `assigned.to_me`, `task.moved`, `due.reached`, `overdue`, `schedule`, `manual`, with exactly the members that kind takes: `label.added` and `label.removed` a `label_id`; `task.moved` a `project_id` and an optional `section_id`; `schedule` an `at` (`HH:MM`, whole minutes) and exactly one of `weekdays` (a non-empty list of 1 to 7, Monday first) or `month_days` (a non-empty list of distinct days from 1 to 31 and `"last"`); every other kind, `manual` included, no further member. A `condition` SHALL be `null` or an object of at most one predicate per key from the closed set in "Conditions", each with values of the stated shape. `actions` SHALL be an object with at least one key from the closed set in "Actions" and no other key, with enumerations and bounds as stated there, or `null` when `steps` is a list. `steps` SHALL be `null` or a list valid by `routines` "Routine steps" and "Step types": known kinds, unique ids, references only to visible outputs, accepted types, at most 20 steps and 32 KB. The sync path checks shape only; the API additionally resolves every id (labels and projects exist and are not deleted, a section belongs to its project, a webhook belongs to the user, the project of a project action is not shared), the same for every id inside `steps`, and reports unavailable steps as warnings (`routines` "Step availability"). Anything else SHALL be refused as invalid and change nothing.

#### Scenario: Unknown trigger kind
- **WHEN** a client submits `trigger: {kind: "task.starred"}`
- **THEN** the write is rejected as invalid and the rule is unchanged

#### Scenario: Schedule with no weekday
- **WHEN** a client submits `trigger: {kind: "schedule", at: "18:00", weekdays: []}` or `at: "6pm"`
- **THEN** the write is rejected as invalid

#### Scenario: Empty actions
- **WHEN** a client submits `actions: {}` or `actions: {colour: "red"}`
- **THEN** the write is rejected as invalid

#### Scenario: Days of the month
- **WHEN** a client submits `trigger: {kind: "schedule", at: "09:00", month_days: [1, 15]}` or `month_days: ["last"]`
- **THEN** the rule is saved; and `month_days: [0]`, `month_days: []`, `month_days: [1, 1]` or both `weekdays` and `month_days` are rejected as invalid

#### Scenario: Unknown label through the API
- **WHEN** a script PATCHes `actions: {add_labels: ["<deleted label id>"]}` on `/api/v1/rules/{id}`
- **THEN** the response is 400 `invalid_input` naming the id and nothing is written

#### Scenario: Project action on a shared project
- **WHEN** a script POSTs a rule whose actions move tasks into a project shared with other accounts
- **THEN** the response is 400 `invalid_input` saying rules act only on personal projects, and nothing is written

#### Scenario: Manual trigger
- **WHEN** a client submits `trigger: {kind: "manual"}`
- **THEN** the rule is saved and fires only when run by hand

#### Scenario: Neither actions nor steps
- **WHEN** a client submits a rule with `actions: null` and `steps: null`
- **THEN** the write is rejected as invalid

### Requirement: Conditions
A condition SHALL be a set of predicates, all of which must hold: `project` (`{in: [ids], descendants?: bool}` or `"none"`), `section` (`{in: [ids]}` or `"none"`), `labels` (`{any?: [ids], all?: [ids], none?: [ids]}`), `priority` (`{in: [1..4]}`), `due` (`"none"`, `"set"`, `"today"`, `"overdue"`, `{within_days: 0..365}`), `deadline` (`"none"`, `"set"`, `{within_days: 0..365}`), `start` (`"someday"`, `"deferred"`, `"none"`), `evening` (bool), `blocked` (bool: has at least one open blocker), `assignee` (`"me"`, `"none"`, `"anyone"`), `origin` (`{kind: ...}` from the origin kinds or `"none"`), `habit` (bool), `estimate` (`"none"`, `{min_minutes}`, `{max_minutes}`), `tracked` (`"none"`, `{min_minutes}`), `unchanged` (`{days: 1..365}`: none of the task's own fields changed in the last N days, read from the time of its newest winning field value; comments, time entries and attachments do not count). Lists SHALL hold at most 32 ids. Predicates SHALL read only fields and field times the server stores in plaintext for every account, so a condition evaluates the same for an encrypted account. "Today", "overdue", "within N days" and "deferred" SHALL use the user's time zone and day start. The device and the server SHALL evaluate a condition identically, pinned by shared test vectors, and the editor SHALL show how many open tasks match now, computed on the device.

#### Scenario: Project with sub-projects
- **WHEN** a condition is `project: {in: ["<Work>"], descendants: true}` and a task sits in "Client A" under "Work"
- **THEN** the task matches on the device and on the server

#### Scenario: Within days respects the day start
- **WHEN** the user's day starts at 03:00, it is 01:30 on Tuesday, a task is due Monday, and a rule's condition is `due: "overdue"`
- **THEN** the task does not match yet, and matches from 03:00

#### Scenario: Vectors agree
- **WHEN** the shared vectors file is run by the Go matcher and the TypeScript matcher
- **THEN** every vector gives the same result on both sides

#### Scenario: Live count in the editor
- **WHEN** the user builds the condition "label errand, due within 3 days" in the editor on a device with eleven such open tasks
- **THEN** the editor reads "11 open tasks match now", from local data, offline as well

#### Scenario: Not changed for 30 days
- **WHEN** today is 2026-11-01, task A's newest field change was on 2026-09-20 and it got a comment on 2026-10-31, task B's newest field change was on 2026-10-25, and a condition is `unchanged: {days: 30}`
- **THEN** A matches and B does not, on the device and on the server, for an encrypted account as well

#### Scenario: A change resets it
- **WHEN** the user renames task A offline on 2026-11-01 and the device syncs
- **THEN** A no longer matches `unchanged: {days: 30}` on any device or on the server

### Requirement: Time triggers
The server SHALL fire `due.reached` at a task's due time (09:00 in the user's time zone for a date-only due; a zoned due at its instant), `overdue` at the user's day start on the day after the due date, and `schedule` at the rule's time on its weekdays, or on its days of the month, in the user's time zone, each against a per-rule watermark kept on the server so that a restart, a slow pass or a missed minute fires each occurrence exactly once and never again. The user's time zone SHALL be the offset the user's devices last reported, UTC until then. A scheduled rule SHALL act on every open, live task matching its condition at that moment, at most 500 per firing; more SHALL be recorded as a partial run and the rest left for the next firing. A day of the month past the end of a month SHALL not fire in that month, `last` SHALL fire on the month's last day, and a schedule SHALL fire at most once a day. A due or overdue trigger whose task is completed, deleted or re-dated before the time SHALL not fire for the old date.

#### Scenario: Sunday evening sweep
- **WHEN** a rule is scheduled on Sunday at 18:00 with the condition "overdue" and the actions "due tomorrow", and at 18:00 on Sunday in the user's zone eleven open tasks are overdue
- **THEN** all eleven get Monday's date in one run and each task's history shows the rule

#### Scenario: Server down at the time
- **WHEN** the server is stopped from 17:50 to 18:20 on that Sunday
- **THEN** the rule fires once on the next pass after 18:20, and not again at 18:00 on Monday

#### Scenario: Due date moved before the time
- **WHEN** a `due.reached` rule exists and a task due today at 15:00 is moved to Friday at 14:00
- **THEN** nothing fires at 15:00 today and the rule fires on Friday at 15:00

#### Scenario: Overdue once per due date
- **WHEN** an `overdue` rule "add label slipped" exists and a task due Monday is not done by Tuesday's day start, is moved to Wednesday, and is still not done by Thursday's day start
- **THEN** the rule fires on Tuesday and again on Thursday, once each, and never twice for the same due date

#### Scenario: Large sweep is partial
- **WHEN** a scheduled rule matches 700 tasks
- **THEN** 500 are changed in that firing, the run is marked partial with the count, and the remaining 200 are handled by the next firing if they still match

#### Scenario: First and last of the month
- **WHEN** a scheduled rule has `month_days: [1, "last"]` at 09:00 and runs through February 2027
- **THEN** it fires on 1 February and 28 February at 09:00 in the user's zone, once each

#### Scenario: A day the month lacks
- **WHEN** a scheduled rule has `month_days: [31]`
- **THEN** it fires on 31 March and 31 May and not in April
