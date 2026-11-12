## MODIFIED Requirements

### Requirement: Step types
Each step kind SHALL declare the types its inputs accept and the type of its output, from Text, Task, Tasks, Note, Notes, Project, Date, Number and Lines (a list of Text). A Note SHALL be a standalone note and Notes a list of them. A reference whose type an input does not accept SHALL be a type error naming the step, the input and both types. The only conversions SHALL be: a Task where Tasks is accepted, a Note where Notes is accepted, a Number or a Date where Text is accepted. One task SHALL count as a list of one, and so SHALL one note. A Note SHALL never be accepted where Text is: its title and text are read by Get note text. A step that takes one item and receives a list SHALL run once per item, in the list's order, and output a list. At most one input of a step SHALL receive a list for each of its items. The device and the server SHALL type-check a routine identically, pinned by shared test vectors, so a type error is shown offline and the API refuses the same routine.

#### Scenario: Wrong type
- **WHEN** a routine's Notify step reads the Tasks output of a Find tasks step as its text
- **THEN** the API refuses the routine with 400 `invalid_input` naming step and input ("Notify: text expects Text, got Tasks"), and the editor shows the same error on the device, offline as well

#### Scenario: For each
- **WHEN** a Get note text step receives the Tasks output of a Find tasks step that found three tasks
- **THEN** it runs three times and its output is Lines with three entries, one per task's note

#### Scenario: A comment on each task
- **WHEN** an Add a comment step's task input reads the Tasks output of a Pick step that picked two tasks
- **THEN** the routine type-checks on both sides and a run adds the comment to each of the two tasks

#### Scenario: Two lists into one step
- **WHEN** an Add a comment step reads a list of tasks as its task and a list of lines as its text
- **THEN** the checker refuses it with the for-each error, and the editor's fix wraps the step in Repeat for each over the tasks

#### Scenario: Vectors agree
- **WHEN** the shared step vectors are run by the Go and the TypeScript checkers
- **THEN** every vector gives the same types and the same errors on both sides

#### Scenario: Each note
- **WHEN** an Add to a note step's note input reads the Notes output of a Find notes step that found four notes
- **THEN** the routine type-checks on both sides and a run adds the text to each of the four notes

#### Scenario: A note is not text
- **WHEN** a Notify me step reads the Note output of a Create note step as its text
- **THEN** the checker refuses it on both sides with "Notify: text expects Text, got Note", and the editor's fix inserts Get note text between them

### Requirement: Step catalogue
The catalogue SHALL offer these steps, grouped as listed, with the inputs and outputs of the designs' catalogues:
- **Tasks:** Find tasks (a filter query, a saved view or a rule condition, at most 500, live; a condition finds open tasks, and a query or view follows the filter rule of open tasks unless it names `completed` or `open` or compares the completion date), Create tasks (one per line of a Text or Lines, each line read with quick-add syntax, or from fields; in a project, or as subtasks of a parent task), Change tasks (priority, due, start, deadline, energy, assignee, labels added and removed, project and section, complete or reopen, move to the Trash), Add a comment, Get a specific task.
- **Projects:** Find project (by name), Get the project of a task, Create project, Update project (name, colour, icon, archived), Create sections, Create labels, Favourite, Create a project from a template of the library.
- **Notes and text:** Find notes (standalone notes by project, sub-projects included, by labels, by when they last changed and by words read like the Notes page search, at most 500, newest change first), Get a specific note, Create note (a title, a text, a project and labels; outputs the Note), Change notes (project, labels added and removed, pin or unpin for the run-as person, move to the Trash), Turn into task (outputs the Task), Get note text (of a task, of a project, or of a note; the text or the title), Add to a note and Clear a note (of a task, of a project or of a note, from an earlier step or chosen in the picker), Split into lines (optionally only the open checkboxes), Join, Format text (placeholders for earlier outputs, a note's title included), Find and replace (plain text).
- **Lists and logic:** Pick (first, last, first N, last N, all, or where), Sort (tasks, or notes by title, last change or creation), Count, If/Otherwise, Repeat for each, Stop; each takes Tasks, Notes or Lines alike.
- **Time and focus:** Get the date (today, tomorrow, in N days or a date), Start timer, Stop timer, Tracked time for a period (minutes), Set today's focus (three tasks, or Bento slots by estimate, by the same rules as the Daily check).
- **Communication:** Notify me, Send a webhook, Email me, Email project members (shared routines only).

Steps with a counterpart in the agent tool registry SHALL be validated and planned by the registry's planning for that tool, so a change a routine plans is the change an agent or the assistant would plan with the same arguments. Every write SHALL follow the user's own action rules (a recurring completion rolls the series forward; a date on a parked task un-parks it; a reminder follows a moved due; a project change clears a section of another project). Steps SHALL never purge, delete permanently, change sharing or membership, or create, edit, enable or run a routine. Other requirements of this specification MAY add steps to a group.

#### Scenario: Groceries from a note
- **WHEN** the routine "Groceries" runs (Get the note text of the project Groceries, chosen in the picker → Split into lines → Create tasks in Errands) and the note reads "- oat milk\n- [ ] bread tomorrow\n\n- apples"
- **THEN** three tasks are created in Errands, "oat milk", "bread" due tomorrow and "apples", in one run whose history entries read "Routine (Groceries)"

#### Scenario: If and Otherwise
- **WHEN** a routine counts the open tasks labelled waiting, and If the count is more than 10 notifies "Too much waiting", Otherwise stops
- **THEN** with 12 such tasks the user gets the notification, and with 4 the run ends at the If step with outcome `ended` and nothing else happens

#### Scenario: Repeat for each
- **WHEN** a routine finds the tasks due today in Work and repeats for each: Add comment "Carried over" and Change tasks (due tomorrow)
- **THEN** each found task gets the comment and tomorrow's date, and the run lists one comment and one change per task

#### Scenario: Waiting since today
- **WHEN** a routine triggered by the label waiting gets the date today and comments "Waiting since {the date}" on the task that triggered, on 2026-11-03
- **THEN** the task gets the comment "Waiting since 2026-11-03"

#### Scenario: Meeting notes into the task's project
- **WHEN** a manual routine is run on the task "Planning meeting" in Work, whose note reads "- [ ] book room\n- notes\n- [x] done already\n- [ ] send agenda", and it gets the note text of the task it runs on, splits it into lines keeping only open checkboxes, gets the project of the task and creates tasks from the lines in that project
- **THEN** "book room" and "send agenda" are created in Work

#### Scenario: Subtasks from a note
- **WHEN** a manual routine run on the task "Move house" creates subtasks of that task from the lines of its note "pack\nbook van"
- **THEN** "pack" and "book van" are created as subtasks of "Move house", in its project

#### Scenario: What I finished this week
- **WHEN** on Friday a routine finds tasks with the query `completed = this week` and counts them, and the user completed five tasks since Monday
- **THEN** the count is 5

#### Scenario: Recurring completion
- **WHEN** a Change tasks step completes an occurrence of "every Monday"
- **THEN** the occurrence is completed and the next Monday's occurrence exists, as when the user ticks it

#### Scenario: Today's focus
- **WHEN** a weekday 07:00 routine finds the tasks due today, sorts them by priority, picks the first 3 and sets today's focus to them, for a user whose focus style is three tasks
- **THEN** the Daily check shows those three as today's focus on every device after sync

#### Scenario: From a template
- **WHEN** a routine on the first of each month creates a project from the library template "Weekly review" starting the day
- **THEN** the project, its sections and tasks are created with the dates the library's own instantiation gives for that start day

#### Scenario: A note from the week's work
- **WHEN** the routine "Weekly review note" runs on Friday at 16:00 (Find tasks `completed = this week` → Join their titles → Create note "Week {the date}" with the joined text in Reviews, label review) and the user completed four tasks this week
- **THEN** one standalone note "Week 2026-11-13" exists in Reviews with the label review and the four titles, on every device after sync

#### Scenario: Stale reference notes
- **WHEN** a monthly routine finds the notes in Reference that have not changed for 90 days and changes them: add label review
- **THEN** each such note gets the label review in one run, and notes changed within 90 days are untouched

### Requirement: Manual runs
A routine SHALL accept a trigger of kind `manual`, which fires only when run by hand, and every routine SHALL be runnable by hand: `POST /api/v1/rules/{id}/run` with `{run_id, task_id?, note_id?, test?}` SHALL run it now and answer with the run record, where `run_id` is a client-generated UUID that makes a repeated request answer the first run without running again, `task_id` is the task given to steps that read the trigger, `note_id` is the standalone note given to them instead for a routine whose trigger outputs a Note, at most one of the two being sent, and `test: true` plans and records a test run without writing. A disabled routine SHALL be runnable by hand; one paused by the server SHALL not be until turned on. The run SHALL record its source (`event`, `schedule`, `due`, `manual`, `mcp`, `test`). Manual runs need a connection; offline the app SHALL say so.

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


#### Scenario: Note needed
- **WHEN** a routine triggered by "a note gets the label todo" is run by hand without a `note_id`, or with a `task_id`
- **THEN** the response is 400 `note_required` and nothing runs

#### Scenario: Task and note together
- **WHEN** a client posts a run with both `task_id` and `note_id`
- **THEN** the response is 400 `invalid_input` and nothing runs

## ADDED Requirements

### Requirement: Notes in routines
A routine SHALL reach standalone notes only through the note triggers of `automation-rules` and the note steps of the catalogue. Find notes SHALL find live standalone notes the run-as person can read, never task notes or project notes (those are reached through their task or project), at most 500, and SHALL match words with the grammar and the accent and case rules of the Notes page search, by the shared note search vectors. Create note SHALL write the note's title, its document and Markdown projection together, as the device writes a new note, in one batch. Add to a note SHALL append and never replace text, so an edit on a device at the same time is kept. Clear a note SHALL delete the content inside the document, as clearing a task's note does. Change notes SHALL write labels whole from the current list, and a project change across sharing scopes SHALL copy the note into the target and move the original to the Trash, as the device does. Pin and unpin SHALL change the run-as person's favourites only. Turn into task SHALL do what the note's menu does, in one batch. Steps with an agent tool counterpart (`create_note`, `update_note`, `append_to_note`, `trash_note`, `note_to_task`) SHALL be validated and planned by the registry's planning for that tool; `trash_note`'s rule that an agent trashes only notes it created SHALL not apply to a routine, which acts as its run-as person. Every note write SHALL go through the operation log with device `rule:<rule-id>`, applied on the server like any batch, so an offline device receives it on its next sync and a concurrent edit of the same note merges with it; a note deleted before the run writes SHALL be counted as refused and the run marked partial. History SHALL show the note's change as made by the routine, and Undo a run SHALL undo note writes like task writes.

#### Scenario: Append while editing
- **WHEN** the user is writing in the note "Journal" on a phone, offline, while a routine adds "Completed: 4 tasks" to it, and the phone then syncs
- **THEN** every device shows the user's new paragraph and the routine's line

#### Scenario: Only standalone notes
- **WHEN** a routine finds notes with the word "invoice" and a task's note and a standalone note both contain it
- **THEN** only the standalone note is found

#### Scenario: Undo a run
- **WHEN** the user undoes a run that created a note and added the label review to two others
- **THEN** the created note is in the Trash and the two notes lose the label, on every device after sync

#### Scenario: Note deleted in between
- **WHEN** a run planned to add text to three notes and one of them was moved to the Trash on another device before the run wrote
- **THEN** the two others get the text and the run is recorded as partial with one refused

### Requirement: Note steps on encrypted accounts
On an encrypted account, Create note, Get note text, Add to a note, Clear a note and Turn into task, and Find notes with words, SHALL be content steps, and a routine holding one SHALL run on one of the user's opted-in devices as `routines` "Routines run on devices for encrypted accounts" states, the device planning it with the planner pinned by the shared vectors of every note step. Find notes without words, Change notes and the note triggers SHALL be content-free: they read only ids, projects, labels and change times, which the server holds in plaintext, and a routine of only such steps SHALL run on the server. A note's title SHALL never reach the server in a run record.

#### Scenario: Labels on the server
- **WHEN** an encrypted account's routine finds the notes in Reference unchanged for 90 days and adds the label review to them
- **THEN** the server runs it without any device, reading only ids, labels and change times

#### Scenario: Text on the device
- **WHEN** an encrypted account's routine appends the day's completed tasks to the note "Journal" at 18:00 and the user's laptop, opted in, is unlocked
- **THEN** the laptop plans the run on its decrypted copy, the server applies ciphertext operations, and the phone shows the line after sync

#### Scenario: No device
- **WHEN** the same routine is due and no opted-in device is online
- **THEN** the occurrence waits for a device as "Waiting for a device" states, and nothing is written meanwhile

### Requirement: Notes in shared and workspace routines
A shared routine SHALL find, read and write only the standalone notes of its project, and SHALL be refused at save when a note step names a note of another project or moves notes out of it; pin and unpin SHALL be unavailable in a shared routine with reason `not_in_shared`. A note trigger of a shared routine SHALL fire on any member's changes to the project's notes, with the exceptions of task triggers. A routine of a workspace SHALL see only that workspace's notes, create notes without a project in that workspace, and fail a run whose planned changes reach a note of another workspace with `other_workspace`, writing nothing. A note of a shared project that the run-as person may only view SHALL never be written: the run SHALL fail before writing, naming the note's project.

#### Scenario: Household notes
- **WHEN** the shared routine "Weekly chores", running as Alice, finds notes with the label chores
- **THEN** it finds only Household's notes, never Alice's personal ones

#### Scenario: Another project's note
- **WHEN** an editor saves a shared routine whose Add to a note step names a personal note
- **THEN** saving is refused as invalid with "a shared routine acts only in its project"

#### Scenario: Viewer's note
- **WHEN** a personal routine of Alice's adds text to every note labelled weekly, and one such note is in a project where Alice is a viewer
- **THEN** the run fails before writing, naming that project, and no note is changed

#### Scenario: Workspace
- **WHEN** a routine of Work creates a note without a project
- **THEN** the note is created in Work and listed on the Notes page only while Work is the current workspace

### Requirement: Notes in the routine editor
The editor SHALL offer the note steps under Notes and text in Add step. A note input SHALL open a picker offering, as for tasks, the enclosing Repeat's item ("each note"), earlier outputs ("the notes", "the note") and the trigger's output ("the note that triggered", or "the note you run it on" for a manual routine on a note), then "Find notes…", which inserts a Find notes step above, then "A specific note…", which only then lists notes with the Combobox. Find notes SHALL show a live count of the matching notes from local data ("7 notes match now"), offline included. Run now on a routine whose trigger outputs a Note SHALL ask for the note with the same picker. A standalone note's menu SHALL offer **Run routine…** listing the user's manual routines that take a note, and the command palette SHALL offer it while a note is open; both need a connection and say so offline. No new shortcut and no new row of chrome SHALL be added.

#### Scenario: Run on this note
- **WHEN** the user opens the note "Planning meeting", chooses Run routine… in its menu and picks "Checkboxes to tasks"
- **THEN** the routine runs with that note as its trigger's output and the run is in the history with source `manual`

#### Scenario: Live count
- **WHEN** the user builds Find notes "in Reference, not changed for 90 days" on a device with 12 such notes, offline
- **THEN** the card reads "12 notes match now"

#### Scenario: Offline
- **WHEN** the device is offline and the user chooses Run routine… in a note's menu
- **THEN** the list says a connection is needed and nothing is sent

### Requirement: Note use cases
The shared use-case file SHALL hold, as buildable cases with seeded data, a clock and the expected writes: "Weekly review note" (schedule, Find tasks, Join, Create note), "Todo label to task" (`note.label.added` todo → Turn into task), "Checkboxes to tasks" (manual on a note → Get note text → Split into lines, open checkboxes → Create tasks in the note's project), "Stale reference notes" (schedule → Find notes unchanged 90 days → Change notes add label review) and "Journal line" (schedule → Find tasks completed today → Count → Format text → Add to a note). The server SHALL run each with exactly the expected writes, the TypeScript checker and device planner SHALL give the same, and "Checkboxes to tasks" SHALL be built through the editor from an empty draft with no note chosen by hand.

#### Scenario: Todo label to task
- **WHEN** the user adds the label todo to the note "Call the bank about the card" on a phone and the phone syncs
- **THEN** the note becomes a task with that title in the note's project, the note is in the Trash, and the run is in the routine's history

#### Scenario: Checkboxes to tasks
- **WHEN** "Checkboxes to tasks" is run on a note in Work reading "- [ ] book room\n- [x] done\n- [ ] send agenda"
- **THEN** "book room" and "send agenda" are created in Work

### Requirement: Notes in the routine CLI
`ot routine run <id|name> --note <id|title>` SHALL run a routine on a standalone note, resolving a title as `ot notes` does and failing on an ambiguous one before anything is sent; `--task` and `--note` SHALL not be given together. Routine files for `create` and `edit` SHALL accept notes by id or by title wherever a note is chosen, and note triggers with a `label` by name.

#### Scenario: Run from the CLI
- **WHEN** the user runs `ot routine run "Checkboxes to tasks" --note "Planning meeting"`
- **THEN** the routine runs on that note and the command prints the run record

#### Scenario: Ambiguous title
- **WHEN** two notes start with "Planning" and the user passes `--note Planning`
- **THEN** the command fails naming both notes and nothing is sent
