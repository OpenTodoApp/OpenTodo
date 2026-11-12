## MODIFIED Requirements

### Requirement: Rule validation
The sync and API write paths SHALL accept a `trigger` only when it is an object with a `kind` from the closed set `task.created`, `task.completed`, `task.reopened`, `label.added`, `label.removed`, `assigned.to_me`, `task.moved`, `due.reached`, `overdue`, `schedule`, `manual`, `note.created`, `note.edited`, `note.label.added`, with exactly the members that kind takes: `label.added`, `label.removed` and `note.label.added` a `label_id`; `manual` an optional `on` of `"task"` (the default when absent) or `"note"`; `task.moved` a `project_id` and an optional `section_id`; `schedule` an `at` (`HH:MM`, whole minutes) and exactly one of `weekdays` (a non-empty list of 1 to 7, Monday first) or `month_days` (a non-empty list of distinct days from 1 to 31 and `"last"`); every other kind no further member. A `condition` SHALL be `null` or an object of at most one predicate per key from the closed set in "Conditions", each with values of the stated shape; for a note trigger (`note.created`, `note.edited`, `note.label.added`, or `manual` with `on: "note"`) only the `project` and `labels` predicates SHALL be accepted, read from the note's project and labels. A note trigger SHALL be accepted only with `steps`, never with `actions`, which act on tasks. `actions` SHALL be an object with at least one key from the closed set in "Actions" and no other key, with enumerations and bounds as stated there, or `null` when `steps` is a list. `steps` SHALL be `null` or a list valid by `routines` "Routine steps" and "Step types": known kinds, unique ids, references only to visible outputs, accepted types, at most 20 steps and 32 KB. The sync path checks shape only; the API additionally resolves every id (labels and projects exist and are not deleted, a section belongs to its project, a webhook belongs to the user, the project of a project action is not shared), the same for every id inside `steps`, and reports unavailable steps as warnings (`routines` "Step availability"). Anything else SHALL be refused as invalid and change nothing.

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

#### Scenario: Note trigger with a task condition
- **WHEN** a client submits `trigger: {kind: "note.created"}` with `condition: {priority: {in: [1]}}`
- **THEN** the write is rejected as invalid naming `condition.priority`

#### Scenario: Note trigger with actions
- **WHEN** a client submits `trigger: {kind: "note.label.added", label_id: "<todo>"}` with `actions: {priority: 1}` and `steps: null`
- **THEN** the write is rejected as invalid, saying a note trigger needs steps

#### Scenario: Manual on a note
- **WHEN** a client submits `trigger: {kind: "manual", on: "note"}` with valid steps, and an older client reads the routine
- **THEN** the routine is saved, and the older client lists it as "Made with a newer version" and leaves its trigger unchanged

### Requirement: Event triggers
After a batch commits, the server SHALL derive rule events from the winning changes it contains, for the batch author's enabled rules only: `task.created` when a live task is created; `task.completed` and `task.reopened` on the completion field; `label.added` and `label.removed` when the named label enters or leaves the task's labels; `assigned.to_me` when the assignee becomes the author; `task.moved` when the task's project (and section, when the trigger names one) becomes the named one; `note.created` when a live standalone note is created; `note.label.added` when the named label enters a standalone note's labels; `note.edited` when a standalone note's title or text changes. `note.edited` SHALL fire once the note has had no winning change to its title or text for 5 minutes, keyed by (rule, note, the time of its last such change), so a burst of saves fires once and a later edit fires again; the wait SHALL be kept by the server's jobs so a restart neither loses nor repeats it, and a note moved to the Trash before the wait ends SHALL not fire it. A note created and then edited within the wait SHALL fire `note.created` at creation and `note.edited` once after the wait. A rule SHALL fire once per matching event when the task also matches the rule's condition at evaluation time, is live and, for every trigger but `task.completed`, open; a note trigger SHALL fire when the note is live and matches the condition at evaluation time. Events from a batch written by a rule SHALL never fire that same rule; a batch written by an import or its undo SHALL produce no rule events. Operations that lost under last-writer-wins SHALL produce no event. Edits made offline SHALL fire when the device syncs them.

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


#### Scenario: Many saves, one event
- **WHEN** the user writes in the note "Journal" for 20 minutes, the device saving every few seconds, and stops at 10:20
- **THEN** a `note.edited` routine fires once, at about 10:25, and not while the user was writing

#### Scenario: Label on a note offline
- **WHEN** the user adds the label todo to a note offline and the phone syncs an hour later
- **THEN** the `note.label.added` routine fires once after the sync

#### Scenario: Import does not fire note triggers
- **WHEN** an import creates 40 notes for a user with a `note.created` routine
- **THEN** the routine does not fire for them

#### Scenario: Restart during the wait
- **WHEN** the server restarts two minutes after the last edit of a note watched by a `note.edited` routine
- **THEN** the routine fires once after the 5 minutes, and never twice
