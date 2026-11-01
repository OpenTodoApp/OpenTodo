## MODIFIED Requirements

### Requirement: Rule entity
A rule SHALL be an entity of the user's personal scope with a `name`, an `enabled` flag, one `trigger`, an optional `condition`, a non-empty `actions` set or, for a routine of more than one step, a `steps` list (`routines` "Routine steps"), a `position`, a creation time and an optional deletion time (a tombstone). It SHALL be created, edited, reordered and deleted as field-level operations applied locally first, so the editor works offline, and SHALL converge by per-field last-writer-wins; `trigger`, `condition`, `actions` and `steps` are each one whole value that converges as a whole. The interface SHALL call a rule a routine. A user SHALL have at most 50 live rules, routines of any number of steps included. A rule a device does not fully understand (a trigger kind, predicate, action key or step kind from a newer version, or a `steps` value on a device without routines) SHALL be kept in its data, shown as "Made with a newer version" and left unchanged by that device's edits of other fields.

#### Scenario: Saved offline, runs after sync
- **WHEN** the device is offline and the user saves the rule "Label waiting → move to Waiting" and then, still offline, adds the label waiting to a task
- **THEN** the rule is listed at once on this device with no run yet, and after the device syncs the server runs the rule once for that task and every device shows the task in the Waiting section and a run in the rule's history

#### Scenario: Concurrent edits to different fields
- **WHEN** device A renames a rule offline while device B turns it off offline, and both sync
- **THEN** every device shows the new name and the rule off

#### Scenario: Concurrent edits to the actions
- **WHEN** device A sets a rule's actions to "priority 1" and device B sets them to "add label errand", both offline, and both sync
- **THEN** every device shows the actions written with the greater timestamp, whole, and the other set is absent everywhere

#### Scenario: Too many rules
- **WHEN** a user with 50 live rules creates another through the editor or `POST /api/v1/rules`
- **THEN** the editor refuses with "You have 50 rules; delete one first" and the route answers 400 `invalid_input` naming the limit, and nothing is written

#### Scenario: Newer rule on an older device
- **WHEN** a device without this version's action keys syncs a rule carrying one
- **THEN** it lists the rule as "Made with a newer version", offers only its switch and deletion, and a rename from that device does not remove the unknown action

#### Scenario: A routine on an older device
- **WHEN** a device without routines syncs a rule carrying `steps`
- **THEN** it lists the rule as "Made with a newer version", offers only its switch and deletion, and a rename from that device leaves `steps` unchanged

### Requirement: Rule validation
The sync and API write paths SHALL accept a `trigger` only when it is an object with a `kind` from the closed set `task.created`, `task.completed`, `task.reopened`, `label.added`, `label.removed`, `assigned.to_me`, `task.moved`, `due.reached`, `overdue`, `schedule`, `manual`, with exactly the members that kind takes: `label.added` and `label.removed` a `label_id`; `task.moved` a `project_id` and an optional `section_id`; `schedule` an `at` (`HH:MM`, whole minutes) and `weekdays` (a non-empty list of 1 to 7, Monday first); every other kind, `manual` included, no further member. A `condition` SHALL be `null` or an object of at most one predicate per key from the closed set in "Conditions", each with values of the stated shape. `actions` SHALL be an object with at least one key from the closed set in "Actions" and no other key, with enumerations and bounds as stated there, or `null` when `steps` is a list. `steps` SHALL be `null` or a list valid by `routines` "Routine steps" and "Step types": known kinds, unique ids, references only to visible outputs, accepted types, at most 20 steps and 32 KB. The sync path checks shape only; the API additionally resolves every id (labels and projects exist and are not deleted, a section belongs to its project, a webhook belongs to the user, the project of a project action is not shared), the same for every id inside `steps`, and reports unavailable steps as warnings (`routines` "Step availability"). Anything else SHALL be refused as invalid and change nothing.

#### Scenario: Unknown trigger kind
- **WHEN** a client submits `trigger: {kind: "task.starred"}`
- **THEN** the write is rejected as invalid and the rule is unchanged

#### Scenario: Schedule with no weekday
- **WHEN** a client submits `trigger: {kind: "schedule", at: "18:00", weekdays: []}` or `at: "6pm"`
- **THEN** the write is rejected as invalid

#### Scenario: Empty actions
- **WHEN** a client submits `actions: {}` or `actions: {colour: "red"}`
- **THEN** the write is rejected as invalid

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

### Requirement: Attribution and undo
A rule's batch SHALL carry device `rule:<rule-id>` and the author's account as its author; the task's history SHALL label it "Routine (<name>)", the activity log SHALL show it as its own event by the rule, and a value changed by a rule SHALL be restorable from the task's history like any other change, as an ordinary operation by the restoring device. A comment written by a rule SHALL have the user as its author and carry the rule's device. A whole run SHALL also be undoable at once (`routines` "Undo a run"). Rules SHALL never purge, never delete a task permanently and never change membership.

#### Scenario: Restore after a rule
- **WHEN** a rule moved a task's due date and the user opens the task's history
- **THEN** the version reads "Routine (Sunday sweep)" with the old and new dates, and "Restore this value" puts the old date back on every device after sync

### Requirement: Run log
The server SHALL keep, per rule, its most recent 100 runs for 30 days: the time, the trigger occurrence, the task, the outcome (`applied` with the field changes, `already_matched`, `skipped` with a reason, `stopped`, `failed` with the refusal reason, `partial` with counts), and the chain depth, and for routines the per-step records of `routines` "Run records per step"; runs that failed SHALL be kept for 90 days. `GET /api/v1/rules/{id}/runs` SHALL list them newest first; the Rules page SHALL show them in the rule's history and the rule's row SHALL show its last run time and its run count for the last 7 days. Task titles in the log SHALL be resolved on the device from local data, never stored in the log.

#### Scenario: History of a rule
- **WHEN** the user opens the history of "Sunday sweep" after two firings
- **THEN** two runs are listed with their times, each expandable to the tasks it changed with their titles, and a task deleted since is shown by its id with "Deleted task"

#### Scenario: Runs route requires authentication
- **WHEN** a request without credentials asks for `/api/v1/rules/{id}/runs`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Another user's rule
- **WHEN** a user requests the runs of a rule id that belongs to another account
- **THEN** the response is 404 `not_found`

### Requirement: Rules routes
`GET|POST /api/v1/rules`, `GET|PATCH|DELETE /api/v1/rules/{id}` SHALL follow the collection conventions (authentication required, soft delete, write-through to the operation log, unknown fields rejected, `read` tokens on reads only, `agent` tokens refused on writes). `POST /api/v1/rules/{id}/test` with `{task_id}` SHALL evaluate the rule's condition against that task and return the planned changes without writing anything. `POST /api/v1/rules/test`, `POST /api/v1/rules/{id}/run`, `GET /api/v1/rules/{id}/runs/{run}`, `POST /api/v1/rules/{id}/runs/{run}/undo`, `GET /api/v1/me/rules/runs` and `GET /api/v1/me/rules/catalogue` SHALL be added as `routines` states, with the same authentication, `read` and `agent` token rules and demo refusal. Every rule representation SHALL carry `trigger`, `condition` (`null` when unset), `actions`, `steps` (`null` when unset) and `paused_reason` (`null`, or `runaway`). The export SHALL include a `rules` array with deleted rules, and the own-format import SHALL restore rules with their ids re-mapped.

#### Scenario: Create a rule through the API
- **WHEN** a script POSTs `{"name":"Waiting","trigger":{"kind":"label.added","label_id":"<waiting>"},"actions":{"section":{"project_id":"<Work>","section_id":"<Waiting>"}}}` with a `full` bearer token
- **THEN** the response is 201 with the rule, `enabled: true`, `condition: null`, `steps: null` and `paused_reason: null`, and devices list it after their next sync

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials lists or creates rules
- **THEN** the response is 401 `unauthorized`

#### Scenario: Agent token
- **WHEN** an `agent` token POSTs a rule
- **THEN** the response is 403 `insufficient_scope` and nothing is written

#### Scenario: Dry run
- **WHEN** a script POSTs `{"task_id":"<id>"}` to `/api/v1/rules/{id}/test` for a task that matches the condition
- **THEN** the response is 200 with `matches: true` and the planned field changes, and the task's history shows nothing new

#### Scenario: Export and re-import
- **WHEN** a user exports, deletes a rule, and imports the export
- **THEN** the rule is back with its trigger, condition and actions pointing at the re-mapped labels, projects and sections

#### Scenario: Create a routine through the API
- **WHEN** a script POSTs a rule with `trigger: {kind: "manual"}`, `actions: null` and three valid steps with a `full` bearer token
- **THEN** the response is 201 with the routine and its `steps`, and devices list it after their next sync

### Requirement: CLI commands
`ot rules list` SHALL list the user's rules with their switch and summary, `ot rules enable|disable <id>` SHALL flip the switch through `PATCH /api/v1/rules/{id}`, and `ot rules runs <id>` SHALL list the run log, each with `--json` output described by `ot schema`; these SHALL stay as aliases of `ot routine` (`routines` "Routine CLI"). A `read` token SHALL be refused on `enable` and `disable` with exit code 5.

#### Scenario: List rules
- **WHEN** the user runs `ot rules list --json`
- **THEN** the output is the versioned rule list with `trigger`, `condition`, `actions`, `enabled` and `paused_reason`

### Requirement: Rules contact nothing new
Rules SHALL make no outbound request of their own: a `webhook` action or Send a webhook step queues a delivery to one of the user's existing webhooks under the webhook rules, a Notify me step reaches the user's own delivery channels under their rules, an email step sends through the owner's configured SMTP server to the account's own verified address or a shared project's members under the mail rules, and nothing else leaves the server.

#### Scenario: Network audit
- **WHEN** a user's rules run for a day on a server with no webhook configured
- **THEN** the server makes no outbound request on their account
