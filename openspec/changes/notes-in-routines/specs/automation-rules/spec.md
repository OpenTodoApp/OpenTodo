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

### Requirement: Event triggers
After a batch commits, the server SHALL derive rule events from the winning changes it contains, for the batch author's enabled rules only: `task.created` when a live task is created; `task.completed` and `task.reopened` on the completion field; `label.added` and `label.removed` when the named label enters or leaves the task's labels; `assigned.to_me` when the assignee becomes the author; `task.moved` when the task's project (and section, when the trigger names one) becomes the named one. A rule SHALL fire once per matching event when the task also matches the rule's condition at evaluation time, is live and, for every trigger but `task.completed`, open. Events from a batch written by a rule SHALL never fire that same rule; a batch written by an import or its undo SHALL produce no rule events. Operations that lost under last-writer-wins SHALL produce no event. Edits made offline SHALL fire when the device syncs them.

#### Scenario: Label added on a phone
- **WHEN** the user adds the label waiting to a task on their phone and the phone syncs
- **THEN** the rule "Label waiting → move to Waiting" fires once, the task is in the Waiting section on every device after sync, and the rule's history lists the run with the task

#### Scenario: Condition fails at the time
- **WHEN** a rule "task created in Inbox with priority 1 → due today" exists and a priority 4 task is created in the Inbox
- **THEN** the rule does not fire and nothing is logged for it

#### Scenario: Import does not fire rules
- **WHEN** an import creates 500 tasks for a user with a `task.created` rule
- **THEN** the rule does not fire for them, and a task created by hand afterwards fires it

#### Scenario: Stale operation
- **WHEN** a device syncs a label change older than the one already stored
- **THEN** no rule event is produced

#### Scenario: Shared project edit by another member
- **WHEN** Bob completes a task in a project Alice shares with him, and Alice has a `task.completed` rule
- **THEN** Alice's rule does not fire, because rules fire for their author's own batches only

