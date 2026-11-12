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

### Requirement: Step catalogue
The catalogue SHALL offer these steps, grouped as listed, with the inputs and outputs of the designs' catalogues:
- **Tasks:** Find tasks (a filter query, a saved view or a rule condition, at most 500, live; a condition finds open tasks, and a query or view follows the filter rule of open tasks unless it names `completed` or `open` or compares the completion date), Create tasks (one per line of a Text or Lines, each line read with quick-add syntax, or from fields; in a project, or as subtasks of a parent task), Change tasks (priority, due, start, deadline, energy, assignee, labels added and removed, project and section, complete or reopen, move to the Trash), Add a comment, Get a specific task.
- **Projects:** Find project (by name), Get the project of a task, Create project, Update project (name, colour, icon, archived), Create sections, Create labels, Favourite, Create a project from a template of the library.
- **Notes and text:** Get note text, Add to a note and Clear a note (of a task, of a project from an earlier step, or of a project chosen in the picker), Split into lines (optionally only the open checkboxes), Join, Format text (placeholders for earlier outputs), Find and replace (plain text).
- **Lists and logic:** Pick (first, last, first N, last N, all, or where), Sort, Count, If/Otherwise, Repeat for each, Stop.
- **Time and focus:** Get the date (today, tomorrow, in N days or a date), Start timer, Stop timer, Tracked time for a period (minutes), Set today's focus (three tasks, or Bento slots by estimate, by the same rules as the Daily check).
- **Communication:** Notify me, Send a webhook, Email me, Email project members (shared routines only).

Steps with a counterpart in the agent tool registry SHALL be validated and planned by the registry's planning for that tool, so a change a routine plans is the change an agent or the assistant would plan with the same arguments. Every write SHALL follow the user's own action rules (a recurring completion rolls the series forward; a date on a parked task un-parks it; a reminder follows a moved due; a project change clears a section of another project). Steps SHALL never purge, delete permanently, change sharing or membership, or create, edit, enable or run a routine.

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

