# Spec Delta

## Purpose

Lets a user keep rules that act on their tasks without a device open: when something happens to a task, or at a time of day, the server applies a set of field changes, a comment, a notification or a webhook delivery, as ordinary operations attributed to the rule, within limits that keep a mistake small and visible.

## ADDED Requirements

### Requirement: Rule entity
A rule SHALL be an entity of the user's personal scope with a `name`, an `enabled` flag, one `trigger`, an optional `condition`, a non-empty `actions` set, a `position`, a creation time and an optional deletion time (a tombstone). It SHALL be created, edited, reordered and deleted as field-level operations applied locally first, so the editor works offline, and SHALL converge by per-field last-writer-wins; `trigger`, `condition` and `actions` are each one whole value that converges as a whole. A user SHALL have at most 50 live rules. A rule a device does not fully understand (a trigger kind, predicate or action key from a newer version) SHALL be kept in its data, shown as "Made with a newer version" and left unchanged by that device's edits of other fields.

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

### Requirement: Rule validation
The sync and API write paths SHALL accept a `trigger` only when it is an object with a `kind` from the closed set `task.created`, `task.completed`, `task.reopened`, `label.added`, `label.removed`, `assigned.to_me`, `task.moved`, `due.reached`, `overdue`, `schedule`, with exactly the members that kind takes: `label.added` and `label.removed` a `label_id`; `task.moved` a `project_id` and an optional `section_id`; `schedule` an `at` (`HH:MM`, whole minutes) and `weekdays` (a non-empty list of 1 to 7, Monday first); every other kind no further member. A `condition` SHALL be `null` or an object of at most one predicate per key from the closed set in "Conditions", each with values of the stated shape. `actions` SHALL be an object with at least one key from the closed set in "Actions" and no other key, with enumerations and bounds as stated there. The sync path checks shape only; the API additionally resolves every id (labels and projects exist and are not deleted, a section belongs to its project, a webhook belongs to the user, the project of a project action is not shared). Anything else SHALL be refused as invalid and change nothing.

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

### Requirement: Conditions
A condition SHALL be a set of predicates, all of which must hold: `project` (`{in: [ids], descendants?: bool}` or `"none"`), `section` (`{in: [ids]}` or `"none"`), `labels` (`{any?: [ids], all?: [ids], none?: [ids]}`), `priority` (`{in: [1..4]}`), `due` (`"none"`, `"set"`, `"today"`, `"overdue"`, `{within_days: 0..365}`), `deadline` (`"none"`, `"set"`, `{within_days: 0..365}`), `start` (`"someday"`, `"deferred"`, `"none"`), `evening` (bool), `blocked` (bool: has at least one open blocker), `assignee` (`"me"`, `"none"`, `"anyone"`), `origin` (`{kind: ...}` from the origin kinds or `"none"`), `habit` (bool), `estimate` (`"none"`, `{min_minutes}`, `{max_minutes}`), `tracked` (`"none"`, `{min_minutes}`). Lists SHALL hold at most 32 ids. Predicates SHALL read only fields the server stores in plaintext for every account, so a condition evaluates the same for an encrypted account. "Today", "overdue", "within N days" and "deferred" SHALL use the user's time zone and day start. The device and the server SHALL evaluate a condition identically, pinned by shared test vectors, and the editor SHALL show how many open tasks match now, computed on the device.

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

### Requirement: Actions
`actions` SHALL carry at most one choice per key: `add_labels` and `remove_labels` (label ids), `priority` (1 to 4), `due` (`today`, `tomorrow`, `next-week`, `{in_days: 0..365}`, `clear`), `start` (`someday`, `clear`), `section` (`{project_id, section_id | null}`), `state` (`complete`, `reopen`), `deadline` (`{in_days: 0..365}`, `clear`), `assignee` (`me`, `clear`), `comment` (`{text}`, at most 2,000 characters), `notify` (`true`), `webhook` (`{webhook_id}`). Applying actions to a task SHALL plan the same field changes a user's own action plans (a completion of a recurring task rolls the series forward and completes the subtree; a date on a parked task un-parks it; `due: clear` ends a recurrence; a project change clears the section unless the chosen section belongs to the new project; labels are written whole from the current list; a reminder follows a moved due or deadline), written as one batch per task. A change the task already has SHALL not be written; a batch with nothing left SHALL be recorded as "already matched". Order: labels removed then added, priority, due, start, deadline, assignee, state, then project and section, then the comment, the notification and the webhook.

#### Scenario: Several changes, one batch
- **WHEN** a rule's actions are "add label errand, priority 2, due tomorrow" and it fires on a parked task
- **THEN** the task gets the label, priority 2, tomorrow's date, leaves Someday, and the task's history shows one version by the rule with the four changes

#### Scenario: Completing a recurring task
- **WHEN** a rule with `state: complete` fires on an occurrence of "every Monday"
- **THEN** the occurrence is completed and the next Monday's occurrence exists, as when the user ticks it

#### Scenario: Nothing to change
- **WHEN** a rule "priority 1" fires on a task that already has priority 1
- **THEN** no operation is written and the run log shows "already matched"

#### Scenario: Comment and notification
- **WHEN** a rule's actions are `comment: {text: "Picked up by the waiting rule"}, notify: true` and it fires
- **THEN** the task gets a comment with that text authored by the user and attributed to the rule, and the user gets an in-app notification naming the rule and the task

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

### Requirement: Time triggers
The server SHALL fire `due.reached` at a task's due time (09:00 in the user's time zone for a date-only due; a zoned due at its instant), `overdue` at the user's day start on the day after the due date, and `schedule` at the rule's time on its weekdays in the user's time zone, each against a per-rule watermark kept on the server so that a restart, a slow pass or a missed minute fires each occurrence exactly once and never again. The user's time zone SHALL be the offset the user's devices last reported, UTC until then. A scheduled rule SHALL act on every open, live task matching its condition at that moment, at most 500 per firing; more SHALL be recorded as a partial run and the rest left for the next firing. A due or overdue trigger whose task is completed, deleted or re-dated before the time SHALL not fire for the old date.

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

### Requirement: Idempotent runs
Every run SHALL be keyed by (rule, task, occurrence): the committed batch for an event trigger, the due instant for `due.reached`, the due date for `overdue`, the scheduled minute for `schedule`. A key SHALL be recorded before the run's batch is written and SHALL make any later attempt with the same key a no-op, so a replayed event, a retried pass or two passes overlapping never apply a rule twice.

#### Scenario: Replayed event
- **WHEN** the worker restarts after writing a run's batch but before marking its event processed
- **THEN** the event is seen again, the key is found and nothing is written a second time

### Requirement: Loop protection
A rule SHALL never fire on a batch it wrote itself. A batch written by rule A MAY fire rule B; the chain depth of a run SHALL be one more than the depth of the batch that triggered it, starting at 1 for a user's batch, and a run at depth 4 or more SHALL not happen and SHALL be recorded as "stopped: too many rules in a row" on the rule that would have run.

#### Scenario: Two rules that undo each other
- **WHEN** rule A says "label x added → remove label x, add label y" and rule B says "label y added → remove label y, add label x", and the user adds label x
- **THEN** A runs (depth 2), B runs (depth 3), A is stopped at depth 4 with the reason in its log, and the task ends with label x; no further run happens

### Requirement: Limits and pauses
An account SHALL run at most 60 rule runs per minute and 2,000 per day (UTC), counted when a run applies changes; a run refused by a limit SHALL be recorded as "skipped: limit" and is not retried. A rule that is refused by the per-minute limit three times within an hour SHALL be paused by the server with the reason "runaway" shown on the Rules page, and the user SHALL be notified in app once; the user turns it back on. Each run SHALL change at most 500 tasks. These bounds SHALL be fixed and documented.

#### Scenario: Runaway rule paused
- **WHEN** a rule fires on more than 60 tasks per minute for several minutes
- **THEN** after its third refusal within the hour the rule is shown paused with "Paused: it ran too often", one notification tells the user, and turning the switch back on resumes it

### Requirement: Attribution and undo
A rule's batch SHALL carry device `rule:<rule-id>` and the author's account as its author; the task's history SHALL label it "Rule (<name>)", the activity log SHALL show it as its own event by the rule, and a value changed by a rule SHALL be restorable from the task's history like any other change, as an ordinary operation by the restoring device. A comment written by a rule SHALL have the user as its author and carry the rule's device. Rules SHALL never purge, never delete a task permanently and never change membership.

#### Scenario: Restore after a rule
- **WHEN** a rule moved a task's due date and the user opens the task's history
- **THEN** the version reads "Rule (Sunday sweep)" with the old and new dates, and "Restore this value" puts the old date back on every device after sync

### Requirement: Run log
The server SHALL keep, per rule, its most recent 100 runs for 30 days: the time, the trigger occurrence, the task, the outcome (`applied` with the field changes, `already_matched`, `skipped` with a reason, `stopped`, `failed` with the refusal reason, `partial` with counts), and the chain depth. `GET /api/v1/rules/{id}/runs` SHALL list them newest first; the Rules page SHALL show them in the rule's history and the rule's row SHALL show its last run time and its run count for the last 7 days. Task titles in the log SHALL be resolved on the device from local data, never stored in the log.

#### Scenario: History of a rule
- **WHEN** the user opens the history of "Sunday sweep" after two firings
- **THEN** two runs are listed with their times, each expandable to the tasks it changed with their titles, and a task deleted since is shown by its id with "Deleted task"

#### Scenario: Runs route requires authentication
- **WHEN** a request without credentials asks for `/api/v1/rules/{id}/runs`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Another user's rule
- **WHEN** a user requests the runs of a rule id that belongs to another account
- **THEN** the response is 404 `not_found`

### Requirement: Switches
The owner SHALL be able to turn automations off for the server in Settings → Server (`automations.enabled`, default on), with the optional environment variable `OPENTODO_AUTOMATIONS=off|on` overriding it and making the setting read-only; while off, no rule runs, events are not queued, and the Rules page says so. Each user SHALL be able to pause all their rules at once from the Rules page (`PUT /api/v1/me/rules/paused`), which is server state, not an operation. Each rule has its own `enabled` flag. On a demo instance nothing SHALL run and the rules routes SHALL be refused.

#### Scenario: Owner turns automations off
- **WHEN** the owner turns automations off and a user's rule would have fired
- **THEN** nothing is queued or written, the user's Rules page reads "Automations are off on this server", and turning them back on does not fire the missed events

#### Scenario: Variable wins
- **WHEN** the server runs with `OPENTODO_AUTOMATIONS=off`
- **THEN** the Server page shows the switch off and read-only, naming the variable, and `PUT /api/v1/settings/automations` answers 409 `set_by_environment`

#### Scenario: Invalid variable
- **WHEN** the server starts with `OPENTODO_AUTOMATIONS=sometimes`
- **THEN** it exits with an error naming the variable and the accepted values

#### Scenario: Member cannot change the policy
- **WHEN** a member calls `PUT /api/v1/settings/automations`
- **THEN** the response is 403 `forbidden`

#### Scenario: Demo
- **WHEN** a sandbox on a demo instance calls any `/api/v1/rules` route
- **THEN** the response is 403 `demo_restricted` and no engine runs for the sandbox

### Requirement: Rules routes
`GET|POST /api/v1/rules`, `GET|PATCH|DELETE /api/v1/rules/{id}` SHALL follow the collection conventions (authentication required, soft delete, write-through to the operation log, unknown fields rejected, `read` tokens on reads only, `agent` tokens refused on writes). `POST /api/v1/rules/{id}/test` with `{task_id}` SHALL evaluate the rule's condition against that task and return the planned changes without writing anything. Every rule representation SHALL carry `trigger`, `condition` (`null` when unset), `actions` and `paused_reason` (`null`, or `runaway`). The export SHALL include a `rules` array with deleted rules, and the own-format import SHALL restore rules with their ids re-mapped.

#### Scenario: Create a rule through the API
- **WHEN** a script POSTs `{"name":"Waiting","trigger":{"kind":"label.added","label_id":"<waiting>"},"actions":{"section":{"project_id":"<Work>","section_id":"<Waiting>"}}}` with a `full` bearer token
- **THEN** the response is 201 with the rule, `enabled: true`, `condition: null` and `paused_reason: null`, and devices list it after their next sync

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

### Requirement: Rules page
The app SHALL have a Rules page at `/rules`, listed in the sidebar's More group in every "How you work" mode and reachable through the command palette ("Go to Rules", "New rule"), using the page template (title "Rules", actions New rule and Help, an overflow menu with Pause all rules). It SHALL list the user's rules by position with a switch, a one-line summary of trigger, condition and actions, the last run time and the 7-day run count, a paused reason when set, and a menu with Edit, Duplicate, History, Move up, Move down and Delete (confirmed in a dialog). It SHALL render from local data offline; the run history and the live counts need the server and SHALL say so when offline. The page SHALL work with the keyboard throughout.

#### Scenario: Reading the list
- **WHEN** a user with three rules opens Rules
- **THEN** each row reads like "When a task gets the label waiting · if in Work → Move to Waiting, priority 3 · last ran 2 hours ago · 14 runs this week", with its switch, and `Enter` opens the editor

#### Scenario: Offline
- **WHEN** the page is opened without a connection
- **THEN** the rules are listed and editable, the history and counts show "Needs a connection", and a saved edit syncs later

### Requirement: Rule editor
The editor SHALL be one dialog with: a name; a trigger chooser with the fields its kind needs (a label picker, a project and section picker, a time and weekday picker); condition rows added from a menu, one per predicate, each with the picker its kind needs; the action controls of the board rule editor extended with deadline, assignee, comment, notification and webhook; a live "n open tasks match now" line computed on the device; and Save. Unavailable choices SHALL be disabled with a reason (the comment action for an encrypted account, shared projects in the project action, the webhook action without a webhook). Save SHALL write the rule as operations and work offline.

#### Scenario: Build a rule
- **WHEN** the user chooses "a task gets the label" waiting, adds the condition "in project Work (with sub-projects)", sets the action "section Waiting of Work", and saves
- **THEN** the Rules page lists "When a task gets the label waiting · if in Work → Move to Waiting", on every device after sync

#### Scenario: Encrypted account
- **WHEN** a user of an encrypted account opens the actions menu
- **THEN** "Add a comment" is disabled with "Not available for encrypted accounts", and the other actions work

### Requirement: Rule notifications
The server SHALL deliver two in-app notifications: "rule fired" when a rule with the `notify` action applies changes (naming the rule and the task), and "rule paused" when the server pauses a rule. They SHALL be listed and marked read through the notification routes like other kinds, and SHALL not contact any external service.

#### Scenario: Notification arrives
- **WHEN** a rule with `notify` fires on "Call the plumber"
- **THEN** the user sees an unread notification "Sunday sweep changed Call the plumber" that opens the task

### Requirement: CLI commands
`ot rules list` SHALL list the user's rules with their switch and summary, `ot rules enable|disable <id>` SHALL flip the switch through `PATCH /api/v1/rules/{id}`, and `ot rules runs <id>` SHALL list the run log, each with `--json` output described by `ot schema`. A `read` token SHALL be refused on `enable` and `disable` with exit code 5.

#### Scenario: List rules
- **WHEN** the user runs `ot rules list --json`
- **THEN** the output is the versioned rule list with `trigger`, `condition`, `actions`, `enabled` and `paused_reason`

### Requirement: Rules contact nothing new
Rules SHALL make no outbound request of their own: a `webhook` action queues a delivery to one of the user's existing webhooks under the webhook rules, and no other action leaves the server.

#### Scenario: Network audit
- **WHEN** a user's rules run for a day on a server with no webhook configured
- **THEN** the server makes no outbound request on their account
