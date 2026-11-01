# routines Specification

## Purpose
Routines are automation rules of one or more typed steps: the steps and their types, the sentence-card editor and its previews, fixes and Add step, the run history, the step catalogue and its availability, the run that plans every step before it writes, its limits, manual and test runs, run records per step, undoing a run, encrypted accounts, the routes, the CLI, demo instances and host mode.

## Requirements

### Requirement: Routine steps
A routine SHALL be a rule (`automation-rules` "Rule entity") whose optional `steps` field holds an ordered list of steps. A step SHALL have an `id` of 1 to 8 characters `[a-z0-9]`, unique in the routine (`trigger` and `item` reserved), a `kind` from the step catalogue, and named inputs, each a literal or a reference to the trigger's output, to an earlier step's output visible from it, or to the current item of an enclosing Repeat. `if` SHALL carry `then` and `otherwise` blocks and `repeat` a `do` block; blocks SHALL nest at most 3 deep. A routine SHALL hold at most 20 steps counted across all blocks, and its `steps` value at most 32 KB encoded. `steps` SHALL be one whole value, written as an operation applied locally first, so a routine is edited offline, and SHALL converge by last-writer-wins like `actions`. A device that does not know a step kind SHALL keep the value unchanged and show the routine as "Made with a newer version".

#### Scenario: Saved offline, runs after sync
- **WHEN** the device is offline and the user saves the routine "Groceries" (Friday 17:00: get the note text of Groceries, split it into lines, create tasks in Errands) and the device syncs at 16:00 on Friday
- **THEN** the routine is listed at once on this device, and at 17:00 the server runs it and every device shows the new tasks after sync

#### Scenario: Concurrent edits of the steps
- **WHEN** device A adds a Count step and device B removes the Split lines step of the same routine, both offline, and both sync
- **THEN** every device shows the steps written with the greater timestamp, whole, and the other list is absent everywhere

#### Scenario: Reference to a later step
- **WHEN** a client submits steps where step `b` reads `{ref: "c"}` and `c` comes after `b`
- **THEN** the write is rejected as invalid and the routine is unchanged

#### Scenario: Too many steps
- **WHEN** a client submits 21 steps, or 15 steps of which 7 are inside blocks
- **THEN** the write is rejected as invalid naming the limit of 20 steps

### Requirement: Every rule is a one-step routine
A rule whose `steps` is `null` SHALL run as one Change tasks step whose input is the trigger's output and whose changes are its `actions`, with exactly the behaviour of `automation-rules`, including the partial sweep of a scheduled rule. A rule whose `steps` is a list SHALL run its steps and ignore its `actions`, which stay stored. No existing rule SHALL be rewritten, migrated or changed by this change on any device or on the server. A routine with one plain Change tasks card SHALL be saved with `actions` and `steps: null`; adding a second card SHALL write `steps` and `actions: null` in one batch.

#### Scenario: An existing rule after the upgrade
- **WHEN** the server and the web app are upgraded while the rule "Label waiting → move to Waiting" exists, and the user then adds the label waiting to a task
- **THEN** the rule runs as before, its row and history are unchanged, and no operation was written to the rule by the upgrade

#### Scenario: Two fields written concurrently
- **WHEN** an older device edits a rule's `actions` while a newer device adds a second step to it, both offline, and both sync
- **THEN** every device runs and shows the routine's `steps`, and the older device lists it as "Made with a newer version"

#### Scenario: Back to one card
- **WHEN** the user removes the second step of a two-step routine whose first step is a plain Change tasks card
- **THEN** the saved routine carries the card's changes in `actions` and `steps: null`, and a device without this change edits it again

### Requirement: Step types
Each step kind SHALL declare the types its inputs accept and the type of its output, from Text, Task, Tasks, Project, Date, Number and Lines (a list of Text). A reference whose type an input does not accept SHALL be a type error naming the step, the input and both types. The only conversions SHALL be: a Task where Tasks is accepted, a Number or a Date where Text is accepted. A step that takes one item and receives a list SHALL run once per item and output a list. The device and the server SHALL type-check a routine identically, pinned by shared test vectors, so a type error is shown offline and the API refuses the same routine.

#### Scenario: Wrong type
- **WHEN** a routine's Notify step reads the Tasks output of a Find tasks step as its text
- **THEN** the API refuses the routine with 400 `invalid_input` naming step and input ("Notify: text expects Text, got Tasks"), and the editor shows the same error on the device, offline as well

#### Scenario: For each
- **WHEN** a Get note text step receives the Tasks output of a Find tasks step that found three tasks
- **THEN** it runs three times and its output is Lines with three entries, one per task's note

#### Scenario: Vectors agree
- **WHEN** the shared step vectors are run by the Go and the TypeScript checkers
- **THEN** every vector gives the same types and the same errors on both sides

### Requirement: Step catalogue
The catalogue SHALL offer these steps, grouped as listed, with the inputs and outputs of the design's catalogue:
- **Tasks:** Find tasks (a filter query, a saved view or a rule condition, at most 500, open and live), Create tasks (one per line of a Text or Lines, each line read with quick-add syntax, or from fields), Change tasks (priority, due, start, deadline, energy, assignee, labels added and removed, project and section, complete or reopen, move to the Trash), Add comment, Get one task.
- **Projects:** Find project (by name), Create project, Update project (name, colour, icon, archived), Create sections, Create labels, Favourite, Create a project from a template of the library.
- **Notes and text:** Get note text (a task's or project's note as Markdown), Append to note, Clear note, Split into lines, Join, Format text (placeholders for earlier outputs), Find and replace (plain text).
- **Lists and logic:** Filter, Sort, Take first N, Count, If/Otherwise, Repeat for each, Stop.
- **Time and focus:** Start timer, Stop timer, Tracked time for a period (minutes), Set today's focus (three tasks, or Bento slots by estimate, by the same rules as the Daily check).
- **Communication:** Notify me, Send a webhook, Email me, Email project members (shared routines only).

Steps with a counterpart in the agent tool registry SHALL be validated and planned by the registry's planning for that tool, so a change a routine plans is the change an agent or the assistant would plan with the same arguments. Every write SHALL follow the user's own action rules (a recurring completion rolls the series forward; a date on a parked task un-parks it; a reminder follows a moved due; a project change clears a section of another project). Steps SHALL never purge, delete permanently, change sharing or membership, or create, edit, enable or run a routine.

#### Scenario: Groceries from a note
- **WHEN** the routine "Groceries" runs (Get note text of project Groceries → Split into lines → Create tasks in Errands) and the note reads "- oat milk\n- [ ] bread tomorrow\n\n- apples"
- **THEN** three tasks are created in Errands, "oat milk", "bread" due tomorrow and "apples", in one run whose history entries read "Routine (Groceries)"

#### Scenario: If and Otherwise
- **WHEN** a routine counts the open tasks labelled waiting, and If the count is more than 10 notifies "Too much waiting", Otherwise stops
- **THEN** with 12 such tasks the user gets the notification, and with 4 the run ends at the If step with outcome `ended` and nothing else happens

#### Scenario: Repeat for each
- **WHEN** a routine finds the tasks due today in Work and repeats for each: Add comment "Carried over" and Change tasks (due tomorrow)
- **THEN** each found task gets the comment and tomorrow's date, and the run lists one comment and one change per task

#### Scenario: Recurring completion
- **WHEN** a Change tasks step completes an occurrence of "every Monday"
- **THEN** the occurrence is completed and the next Monday's occurrence exists, as when the user ticks it

#### Scenario: Today's focus
- **WHEN** a weekday 07:00 routine finds the three highest-priority tasks due today and sets today's focus to them, for a user whose focus style is three tasks
- **THEN** the Daily check shows those three as today's focus on every device after sync, and a fourth task found would be left out as the Daily check leaves it out

#### Scenario: From a template
- **WHEN** a routine on the first of each month creates a project from the library template "Weekly review" starting today
- **THEN** the project, its sections and tasks are created with the dates the library's own instantiation gives for that start day

### Requirement: Steps that are not offered
The catalogue SHALL NOT offer: email to an address typed into the routine (it would make the server relay mail its owner did not write, risking spam and the owner's sender reputation, to a target no one configured); fetching a URL or reading an RSS, iCal or other feed; creating calendar events; running scripts or code. A routine's only outbound effects SHALL be deliveries to the user's own webhooks, messages through the user's delivery channels, and email through the owner's SMTP server to the account's own verified address or to a shared project's members.

#### Scenario: Email to another address
- **WHEN** a client submits an Email me step carrying a `to` address
- **THEN** the write is rejected as invalid, naming the input as unknown

#### Scenario: Network audit
- **WHEN** a user's routines run for a day on a server with no webhook, no channel and no outgoing email configured
- **THEN** the server makes no outbound request on their account

### Requirement: Step availability
A step SHALL be available only when what it needs is configured and switched on: every step only while `automations.enabled` is on; Email me only while the owner has configured outgoing email, the account has a verified address and is not encrypted; Email project members additionally only in a routine of a shared project; Send a webhook only while the user has an enabled webhook; Notify me always in app, and through delivery channels only while the owner switch `notifications.channels` is on and the user has a channel with the routine event; energy changes only while the user's Energy levels switch is on; time tracking and focus steps only while those features are on for the account; AI steps only while an assistant provider is configured and the user has consented (`routines-ai-step`); on a demo instance, email and webhook steps never. Availability SHALL be computed by one function on the server and reported with a reason and the setting that fixes it. Saving a routine that holds an unavailable step SHALL succeed with a warning naming each such step. When a run reaches an unavailable step, the run SHALL fail at that step with the reason; no later step SHALL run and, because a run writes only after its whole plan succeeded, nothing SHALL be written. The run log and the run's failure notice SHALL carry the reason and the setting.

#### Scenario: Email not configured
- **WHEN** the owner has not configured outgoing email and a user asks for the step catalogue
- **THEN** Email me is reported with `available: false`, reason `email_not_configured` and the Outgoing email setting

#### Scenario: SMTP removed later
- **WHEN** a routine "Friday digest" (Find tasks → Format text → Email me) ran every week, and the owner removes the outgoing email configuration before the next Friday
- **THEN** that Friday's run fails at the Email me step with "Not available: outgoing email is not set up on this server", the Format text step's output is not sent anywhere, nothing is written, and the run is in the log with the reason

#### Scenario: Unverified address
- **WHEN** a user whose address is not verified saves a routine with Email me
- **THEN** the routine is saved, the answer warns that step 3 is not available until the address is verified, and runs fail at that step until it is

#### Scenario: Webhook deleted
- **WHEN** the only webhook a routine's Send a webhook step names is deleted
- **THEN** the step is reported unavailable with reason `no_webhook`, and the next run fails at that step and writes nothing

#### Scenario: Energy switch off
- **WHEN** a user turns the Energy levels switch off while a routine sets energy Low on found tasks
- **THEN** the next run fails at that Change tasks step with reason `energy_off` and the Energy levels setting

#### Scenario: Channels without the owner switch
- **WHEN** the owner switch `notifications.channels` is off and a routine's Notify me step runs
- **THEN** the in-app notification is delivered and nothing is queued for any channel, and the step is available

#### Scenario: Automations off
- **WHEN** the owner turns automations off
- **THEN** every step is reported unavailable with reason `automations_off`, and no routine runs

### Requirement: A run plans, then writes
A run SHALL first plan every step in order against the current data and the changes the earlier steps planned, and SHALL write only when every step planned without error and within the limits. The writes SHALL go through the operation log as batches with device `rule:<rule-id>` and the run-as user as author, one batch per affected entity, followed by the wake-up of the user's devices. A step that fails while planning SHALL fail the run at that step, and nothing of the run SHALL be written. A batch refused when writing (an entity deleted in between) SHALL be counted, the others written, and the run marked partial with the counts. Each run SHALL be keyed by (routine, occurrence) as rule runs are, so a replayed or overlapping attempt never runs it twice. A routine SHALL never fire on its own batches, and the chain depth of `automation-rules` "Loop protection" SHALL apply to routines, a manual run's batches having depth 2.

#### Scenario: Failure at step 4
- **WHEN** a routine creates tasks in step 2 and its step 4 moves them into a project deleted since the routine was saved
- **THEN** the run fails at step 4 with `not_found`, no task is created, and the run log shows steps 1 to 3 planned and step 4 failed

#### Scenario: Later steps see earlier changes
- **WHEN** step 1 creates two tasks in Errands and step 2 counts the open tasks of Errands, which held five
- **THEN** step 2's output is 7

#### Scenario: Offline edits arrive later
- **WHEN** a device offline since Thursday completes a task on Friday at 16:00 and syncs at 18:00, after a Friday 17:00 routine that found that task open
- **THEN** the 17:00 run acted on the data the server held at 17:00, and the completion syncs and converges like any edit

### Requirement: Routine limits
A run SHALL plan and write within 60 seconds of server time, SHALL write at most 500 entities (each created or changed entity, comment, notification, delivery and email counting one), SHALL handle lists of at most 500 items and texts of at most 64 KB, and SHALL repeat at most 500 times in total. A step routine over a limit SHALL fail with the limit's code and write nothing; a rule read as one Change tasks step SHALL keep its partial sweep of 500. Email steps SHALL send at most 10 messages per routine and 20 per account per day. A run SHALL count once toward the account's 60 runs per minute and 2,000 per day whatever its number of steps; the runaway pause and the limit of 50 routines SHALL apply unchanged. These bounds SHALL be fixed and documented.

#### Scenario: Too many writes
- **WHEN** a routine's plan would create 300 tasks and comment on each
- **THEN** the run fails with `write_limit` naming 600 of 500, and nothing is written

#### Scenario: Long note
- **WHEN** Get note text reads a 90 KB note
- **THEN** the output is its first 64 KB cut on a character boundary, and the step is recorded as `truncated`

#### Scenario: Time limit
- **WHEN** a run is still planning after 60 seconds
- **THEN** it fails with `time_limit` and nothing is written

### Requirement: Manual runs
A routine SHALL accept a trigger of kind `manual`, which fires only when run by hand, and every routine SHALL be runnable by hand: `POST /api/v1/rules/{id}/run` with `{run_id, task_id?, test?}` SHALL run it now and answer with the run record, where `run_id` is a client-generated UUID that makes a repeated request answer the first run without running again, `task_id` is the task given to steps that read the trigger, and `test: true` plans and records a test run without writing. A disabled routine SHALL be runnable by hand; one paused by the server SHALL not be until turned on. The run SHALL record its source (`event`, `schedule`, `due`, `manual`, `mcp`, `test`). Manual runs need a connection; offline the app SHALL say so.

#### Scenario: Run now
- **WHEN** the user runs "Groceries" by hand on Tuesday
- **THEN** it runs at once, the answer lists each step's status and counts, and its run is in the history with source `manual`

#### Scenario: Retried request
- **WHEN** the phone sends the same run request twice because the first answer was lost
- **THEN** the routine runs once and both answers carry the same run

#### Scenario: Task needed
- **WHEN** a routine triggered by "a task gets the label waiting" is run by hand without a `task_id`
- **THEN** the response is 400 `task_required` and nothing runs

#### Scenario: Run route requires authentication
- **WHEN** a request without credentials posts to `/api/v1/rules/{id}/run`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Read token
- **WHEN** a `read` token posts to `/api/v1/rules/{id}/run`
- **THEN** the response is 403 `insufficient_scope` and nothing runs

#### Scenario: Rate
- **WHEN** a user starts a 61st run within one minute
- **THEN** the response is 429 `rate_limited` and the run is not queued

### Requirement: Test a routine
`POST /api/v1/rules/{id}/test` SHALL keep its answer for rules and SHALL add, per step, its status, its output's type and count, a preview of the output, the planned changes and the number of entities that would be written. `POST /api/v1/rules/test` SHALL take an unsaved draft (`trigger`, `condition`, `actions` or `steps`, optional `task_id`), validate it as a create would, and answer the same way. Neither SHALL write anything or add a run to the log; the preview is sent only to the user who asked and SHALL never be stored. The data steps (text, lists and logic) and Change tasks SHALL also be planned on the device by a planner that gives the same result as the server's, pinned by shared vectors, so a preview of them works offline.

#### Scenario: Test before saving
- **WHEN** the user tests the unsaved draft of "Groceries"
- **THEN** the answer shows the three lines, the three tasks that would be created and "3 items would be written", and no task exists afterwards

#### Scenario: Offline preview
- **WHEN** the device is offline and the draft splits a note into lines and counts them
- **THEN** the device shows the lines and the count from local data

#### Scenario: Draft route requires authentication
- **WHEN** a request without credentials posts to `/api/v1/rules/test`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Invalid draft
- **WHEN** a draft's steps hold an unknown kind
- **THEN** the response is 400 `invalid_input` naming the step, and nothing is planned

### Requirement: Step catalogue route
`GET /api/v1/me/rules/catalogue` SHALL list every step kind with its group, inputs, output type, whether it is content, `available`, and when not available its `reason` and `setting`. The device SHALL cache the answer and use the cached copy offline, refreshing it after each sync.

#### Scenario: Catalogue
- **WHEN** a user with one webhook and no verified email address asks for the catalogue
- **THEN** Send a webhook is available, Email me is not with reason `email_not_verified`, and every step lists its inputs and output

#### Scenario: Catalogue route requires authentication
- **WHEN** a request without credentials asks for the catalogue
- **THEN** the response is 401 `unauthorized`

### Requirement: Run records per step
Every run SHALL be recorded with its run id, time, source, the user it ran as, whether it was a test, its outcome (`applied`, `ended`, `already_matched`, `skipped` with a reason, `stopped`, `failed` with the step and reason, `partial` with counts), its number of steps, its writes, its duration, and per step its kind, status (`ok`, `skipped`, `ended`, `failed`, `unavailable`, `truncated`), duration, item count, output type, the ids of at most 50 entities it read or wrote, and an error code. The server SHALL store ids, counts and status only, never titles, text or other content; devices SHALL render titles from local data. Runs SHALL be kept like rule runs (the most recent 100 per routine for 30 days), runs that failed for 90 days. `GET /api/v1/rules/{id}/runs/{run}` SHALL return one run with its steps, and `GET /api/v1/me/rules/runs` all of the user's runs newest first, paginated, filterable by outcome and source.

#### Scenario: Step by step
- **WHEN** the user opens a run of "Groceries" that created three tasks
- **THEN** each of the three steps is listed with its duration and count, the created tasks by their titles from local data, and the server's record holds only their ids

#### Scenario: Deleted since
- **WHEN** a task a run created was deleted and purged since
- **THEN** the run shows it by its id as "Deleted task"

#### Scenario: All runs
- **WHEN** a user with five routines asks for `GET /api/v1/me/rules/runs?outcome=failed`
- **THEN** the failed runs of every routine are listed newest first, each naming its routine

#### Scenario: All-runs route requires authentication
- **WHEN** a request without credentials asks for `/api/v1/me/rules/runs`
- **THEN** the response is 401 `unauthorized`

#### Scenario: Another user's run
- **WHEN** a user requests a run id of another account's routine
- **THEN** the response is 404 `not_found`

### Requirement: Undo a run
`POST /api/v1/rules/{id}/runs/{run}/undo` SHALL take a whole run back once: every field the run wrote whose current value is still the run's SHALL be set back to its value before the run, entities it created and comments it wrote SHALL be moved to the Trash unless changed since, tasks it moved to the Trash SHALL be restored, and a timer it started SHALL be stopped. A value changed after the run SHALL be kept and counted. Notifications, webhook deliveries and emails SHALL not be undone, and the answer SHALL say so. The undo SHALL be written as operations with device `rule:<rule-id>`, SHALL produce no rule events, SHALL show in history as "Routine (<name>) undone", and SHALL converge on every device like any edit.

#### Scenario: Undo a sweep
- **WHEN** the user undoes a run that moved eleven overdue tasks to Monday, after having moved one of them to Friday by hand
- **THEN** ten tasks get their old dates back, the one on Friday stays, and the answer reads "10 restored, 1 kept because it changed after the run"

#### Scenario: Created tasks
- **WHEN** the user undoes a run of "Groceries" that created three tasks
- **THEN** the three tasks are in the Trash on every device after sync

#### Scenario: Twice
- **WHEN** the user undoes a run that was already undone
- **THEN** the response is 409 `already_undone` and nothing is written

#### Scenario: Undo route requires authentication
- **WHEN** a request without credentials posts to the undo route
- **THEN** the response is 401 `unauthorized`

### Requirement: Routines on encrypted accounts
On an encrypted account, the device SHALL encrypt a routine's name and every text literal inside its steps; ids, kinds, dates, numbers and conditions SHALL stay plaintext. A routine without content steps (no step that reads or writes user-written text) SHALL run on the server as for any account. Until device runs exist (`routines-ai-step`), the server SHALL not run a routine with a content step for an encrypted account and SHALL record each occurrence as skipped with reason `encrypted`. Email steps SHALL never be available to an encrypted account.

#### Scenario: Content-free routine
- **WHEN** an encrypted account's routine finds overdue tasks by condition, counts them, and If more than 5 moves them to tomorrow
- **THEN** the server runs it, having read only ids, dates and numbers

#### Scenario: Content routine
- **WHEN** an encrypted account's routine reads a note's text
- **THEN** the server records the occurrence as skipped with reason `encrypted` and writes nothing

### Requirement: Routine CLI
`ot routine` (alias `ot routines`) SHALL offer `list`, `show <id|name>`, `runs <id|name>`, `run <id|name> [--task id] [--test]`, `enable`, `disable`, `create --file <path>`, `edit <id|name> --file <path>`, `rm <id|name>` and `undo <id|name> <run-id>`, each with table output and `--json` described by `ot schema`. `create` and `edit` SHALL read the routine from a JSON or YAML file holding the name, trigger, condition, steps and enabled flag, with projects, sections, labels, views and webhooks given by id or by name; a name that does not resolve SHALL fail naming it, before anything is sent. The server validates as for any write. A `read` token SHALL be refused on every write subcommand with exit code 5; `run` SHALL exit 6 when the run failed. The existing `ot rules` subcommands SHALL keep working.

#### Scenario: Create from YAML
- **WHEN** the user runs `ot routine create --file groceries.yaml` with `project: Groceries` in its first step
- **THEN** the CLI resolves the project, the routine is created, and `ot routine show Groceries` prints its three steps as sentences

#### Scenario: Test from the CLI
- **WHEN** the user runs `ot routine run Groceries --test --json`
- **THEN** the output is the versioned run record with each step's status and counts and `test: true`, and nothing is written

#### Scenario: Unknown name
- **WHEN** the file names `project: Erands`
- **THEN** the command fails with "project Erands not found" and nothing is sent

#### Scenario: Read token
- **WHEN** a profile with a `read` token runs `ot routine disable Groceries`
- **THEN** the command exits with code 5 and the routine is unchanged

### Requirement: Routines on a demo and in host mode
On a demo instance every routine route SHALL be refused with 403 `demo_restricted`, nothing SHALL run, and the availability function SHALL report email and webhook steps unavailable with reason `demo`. In host mode, routines SHALL run in each tenant's existing rules job and manual runs in their request, within the tenant's limits; a run refused by a tenant limit SHALL fail with `tenant_limit` and write nothing.

#### Scenario: Demo
- **WHEN** a sandbox on a demo instance posts to `/api/v1/rules/{id}/run` or asks for the catalogue
- **THEN** the response is 403 `demo_restricted`

#### Scenario: Tenant over its limit
- **WHEN** a tenant has used its write allowance and a routine's run would write
- **THEN** the run fails with `tenant_limit`, nothing is written, and other tenants' routines run as usual

### Requirement: Sentence-card editor
The routine editor SHALL show a routine as cards stacked in one column, phone first: a When card (the trigger and its conditions) and one card per step, each read as a sentence in the user's language whose inputs are buttons ("Create tasks from **the lines** in **Errands**"). If/Otherwise and Repeat for each SHALL show their blocks indented under them. On a phone the editor SHALL be a page and on a computer a wide dialog with the same content. A rule written before routines SHALL open as a When card and one Change tasks card holding the rule's action controls, and saving it with one card SHALL keep it in the rule form so older devices can edit it. Saving SHALL write the routine as operations, offline included, converging like any rule edit.

#### Scenario: Reading a routine
- **WHEN** the user opens "Groceries" on a 390 px phone
- **THEN** the page shows "Every Friday at 17:00", "Get the task Groceries", "Get the note text of Groceries", "Split the note text into lines", "Create tasks from the lines in Errands", one under the other, without sideways scrolling

#### Scenario: An old rule
- **WHEN** the user opens the rule "Label waiting → move to Waiting" and saves it without a change
- **THEN** the editor showed a When card and a Change tasks card, and nothing was written

#### Scenario: Saved offline
- **WHEN** the device is offline and the user adds a Count step and saves
- **THEN** the routine shows the new card at once, and every device shows it after sync

### Requirement: Pickers and output chips
Tapping an input word SHALL open its picker: the Combobox for projects, sections, labels, views, tasks and webhooks (from local data), a text field with an Insert menu of chips for text, date and number fields, the condition rows with their live count, and the filter field for queries. Each card SHALL end with its output, and pickers SHALL offer the outputs of earlier visible steps of an accepted type as chips, nearest first, with outputs of other types listed separately with their conversion. Inside a Repeat block the current item SHALL be offered as a chip.

#### Scenario: A chip from an earlier step
- **WHEN** the user taps the text word of a Notify me card after a Count step
- **THEN** the Insert menu offers "the count" and inserting it shows the chip in the text

#### Scenario: Only fitting outputs
- **WHEN** the user taps the "from" word of Create tasks after Find tasks and Split into lines
- **THEN** "the lines" is offered first, and "the tasks" is listed under "Needs conversion" with "Insert Format text"

### Requirement: Live preview per step
Each card SHALL show a preview of its output, refreshed shortly after every change: computed on the device from local data for text, list, logic and Change tasks steps (offline and on encrypted accounts included), and through the draft test route for the other steps while online, with "Preview needs a connection" otherwise. A preview SHALL show at most five items and the remaining count, or the number, date or the effect ("Would create 3 tasks in Errands", "Would email you"). A preview SHALL never write, send or log anything. A preview over a limit SHALL say so on the card.

#### Scenario: Preview offline
- **WHEN** the device is offline and the user adds Split into lines after Get note text of Groceries
- **THEN** the card previews the note's first five lines and "+ 2 more" from local data

#### Scenario: Nothing sent
- **WHEN** a card is Email me and its preview reads "Would email you"
- **THEN** no message is sent and no run is logged

#### Scenario: Over a limit
- **WHEN** the preview of Create tasks would create 620 tasks
- **THEN** the card reads "Would write 620 of 500" in the danger colour

### Requirement: Type errors with fixes
The editor SHALL type-check the routine on every change with the shared checker and show each error on its card, naming the input and both types, with a one-tap fix where one exists (insert Format text, Join, Count or Split into lines, wrap in Repeat for each, choose another value for a removed step). Applying a fix SHALL be one undoable edit. A routine with a type error SHALL not be saved until it is fixed.

#### Scenario: Fix in one tap
- **WHEN** Notify me reads the tasks of Find tasks and the card says "Notify expects Text, got Tasks"
- **THEN** tapping "Insert Format text" adds a Format text step (the tasks' titles, one per line) between them and the error is gone

#### Scenario: Removed step
- **WHEN** the user deletes the step whose output a later card uses
- **THEN** the later card shows "the lines no longer exists · Choose another value" and Save says "Fix step 3 first"

### Requirement: Add step
"+ Add step" SHALL open a search field over the step catalogue, matching names, descriptions and synonyms in the user's language and in English, with at most six suggestions of steps that accept the output type of the step above, and the catalogue's groups below. Steps that are not available SHALL be left out of the suggestions and groups and SHALL appear in search results dimmed with their hint and a link to the setting. The chosen step SHALL be inserted below the current card with its inputs pre-filled from the step above where the type fits.

#### Scenario: Suggestions after lines
- **WHEN** the user taps "+ Add step" under Split into lines
- **THEN** Create tasks, Filter, Count, Join, Sort and Take first are suggested

#### Scenario: Search for an unavailable step
- **WHEN** outgoing email is not set up and the user types "mail"
- **THEN** Email me is listed dimmed with "Set up email to use this" and a link, and is not in the Communication group

#### Scenario: Synonym in Italian
- **WHEN** an Italian user types "ripeti"
- **THEN** "Ripeti per ogni elemento" (Repeat for each) is found

### Requirement: Unavailable steps in the editor
A saved routine's card whose step is not available SHALL show "Not available: <reason>" with a link to the setting that fixes it, and the routine's row on the Routines page SHALL say how many steps are not available. The editor SHALL use the device's cached catalogue offline.

#### Scenario: Provider removed
- **WHEN** the owner removed outgoing email after the user saved a routine with Email me
- **THEN** that card reads "Not available: outgoing email is not set up on this server" with a link, and the row reads "1 step not available"

### Requirement: Test and save
The editor SHALL offer Test, which runs the draft as a logged test run that writes nothing and shows it step by step under the editor's header, Save, and for a saved routine Run now. Test and Run now need a connection and SHALL say so offline; Save SHALL not.

#### Scenario: Test a routine
- **WHEN** the user taps Test on "Groceries"
- **THEN** the run detail appears with each step's status and preview, marked "Test", and no task is created

### Requirement: Routine history and all runs
Each routine SHALL have a History tab and the Routines page a Runs tab listing all runs newest first, filterable by routine, outcome and source, 50 at a time with Show more. Each run SHALL show its time, source, who it ran as, test or real, outcome, writes and duration, and open a detail with the routine's cards as run: per step its status, duration, count, the items touched as links with titles resolved on the device ("Deleted task" by id when gone), the error with its fix and a link to the setting, tokens when an AI step ran, and Undo run. Offline the last fetched page SHALL be shown with its age.

#### Scenario: Run detail
- **WHEN** the user opens a failed run of "Weekly digest"
- **THEN** steps 1 and 2 are Done with counts, step 3 reads "Not available: outgoing email is not set up" with a link, and step 4 reads "Not run"

#### Scenario: Undo from the detail
- **WHEN** the user taps Undo run on a run that moved eleven tasks
- **THEN** the engine's answer is shown ("10 restored, 1 kept because it changed after the run") and the run is marked Undone

#### Scenario: Offline history
- **WHEN** the user opens History without a connection
- **THEN** the runs fetched earlier are listed with "Updated 2 h ago" and Undo is disabled with "Needs a connection"

### Requirement: Editor keyboard and accessibility
Every card SHALL be a group named by its sentence and every input word a button whose accessible name gives the input and its value; pickers SHALL be the labelled Combobox and fields of `web/src/ui`; test results SHALL be announced politely. The editor SHALL be usable by keyboard alone with shortcuts registered in the registry and checked for conflicts: `Alt+↑` and `Alt+↓` move the focused card, `Ctrl+Enter` saves, `Ctrl+Shift+Enter` tests, `a` adds a step below the focused card, arrow keys move between words of a card, Escape closes a picker and then the editor. Touch targets SHALL be at least 44 px. Every string SHALL be in the six languages, and the editor SHALL load only when opened.

#### Scenario: Keyboard only
- **WHEN** a user tabs to the Count card and presses `Alt+↑`
- **THEN** the card moves above the previous step, focus stays on it, and the move is announced

#### Scenario: Screen reader
- **WHEN** a screen reader reaches the project word of Create tasks
- **THEN** it reads "Project: Errands, button"

#### Scenario: Lazy
- **WHEN** a user opens Today
- **THEN** none of the editor's code is loaded until the user opens Routines or a routine
