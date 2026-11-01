## ADDED Requirements

### Requirement: Data flows by default
A routine SHALL work on the data its trigger and earlier steps produce, without a task chosen by hand. Every step input that acts on tasks (Add a comment, Start a timer, Notify me's task, Get note text, Add to a note, Clear a note, Change tasks, Set today's focus, Send a webhook's tasks, Create tasks' parent) SHALL accept the trigger's task, a list of tasks from an earlier step, or the current item of an enclosing Repeat for each. Where an input acts on one task and receives a list, the step SHALL run once for each task in the list's order, and one task SHALL count as a list of one. When the editor inserts a step, it SHALL fill the step's main input with the nearest value that fits: the enclosing Repeat's item first, then the output of the step above and earlier visible outputs nearest first, then the trigger's output. No default, suggestion or fix of the editor SHALL insert a task chosen by hand. Routines saved before this requirement, including those holding a task chosen by hand, SHALL run unchanged; nothing SHALL be migrated or rewritten. The editor works offline as before, and a routine edited on two devices converges as a whole `steps` value by last-writer-wins (`Routine steps`).

#### Scenario: Find, Pick the first, comment (the owner's first example)
- **WHEN** the user creates a routine "Only when I run it", adds Find tasks with the condition "due: overdue", then Pick, then Add a comment, and types "Still on it?"
- **THEN** the cards read "Find tasks where due is overdue", "Pick the first of the tasks" and "Comment on the picked task: Still on it?" with no input left to choose, no Get a task card, and no "choose which tasks" word; and Run now with four overdue tasks adds one comment, to the first of them

#### Scenario: Last or all of them
- **WHEN** the user switches that Pick card to "The last", then to "All"
- **THEN** a run comments on the last overdue task only, and then on each of the four, in one run each, and the Add a comment card stays unchanged in both

#### Scenario: Find, Repeat for each, comment (the owner's second example)
- **WHEN** the user adds Repeat for each under Find tasks and then adds Add a comment inside it
- **THEN** the comment card reads "Comment on ↳ each task: write a text" with the item already filled, the picker lists "↳ each task" first, and a run with four found tasks adds four comments, one per task

#### Scenario: The trigger's task
- **WHEN** a routine triggered by "a task gets the label waiting" gets an Add a comment step as its first step
- **THEN** the card reads "Comment on the task that triggered" without the user choosing anything

#### Scenario: A list into a one-task step
- **WHEN** Add a comment reads the four tasks of Find tasks directly
- **THEN** the routine type-checks on the device and the server, the preview reads "Would add 4 comments", and a run adds one comment to each task

#### Scenario: A routine saved before this change
- **WHEN** a routine saved before this change holds Get a task with a task chosen by hand and Add a comment reading it
- **THEN** it runs as before, its row is not rewritten by any device or the server, and its Get a task card reads "Always this task"

#### Scenario: Offline
- **WHEN** the device is offline and the user builds Find → Pick the first → Add a comment and saves
- **THEN** the routine is saved locally at once with the steps wired, and after sync every device shows the same three cards

### Requirement: Pick
The step catalogue SHALL offer Pick, which passes on some items of a list: the first, the last, the first N, the last N, all of them, or the ones that match a condition. It SHALL be stored as `take` (`from` one of `start`, `end`, `all`; `n` optional with default 1 and ignored with `all`) for the position modes and as `filter` for the condition mode. The condition rows SHALL be the same as Find tasks' for a list of tasks, and "contain" and "don't contain" for lines. Switching between modes SHALL keep the step's id, so later steps keep reading it. Pick's output SHALL have the type of its input list: picking one task gives a list of one, which any task step accepts. When the list Pick reads does not come through a Sort step, the card SHALL say "In list order", with "Sort first" inserting a Sort step before it. Routines saved with `take` and an `n`, or with `filter`, SHALL mean what they meant before.

#### Scenario: The three most overdue
- **WHEN** a routine finds the overdue tasks, sorts them by due date ascending, picks the first 3 and comments on the picked tasks, and seven tasks are overdue
- **THEN** the three with the earliest due dates get a comment and the other four don't

#### Scenario: Where
- **WHEN** the user opens Pick's mode menu and chooses "The ones where…", then the condition "labels: waiting"
- **THEN** the card becomes a Filter step with the same id, later cards still read it, and only the waiting tasks reach them

#### Scenario: Sort first
- **WHEN** a Pick card reads Find tasks directly and the user taps "Sort first"
- **THEN** a Sort step (by due, ascending) is inserted between them, Pick reads it, and the edit is undone with one Undo

#### Scenario: Pick all on a device without this change
- **WHEN** a device that predates this change syncs a routine whose Pick uses "All"
- **THEN** it lists the routine as "Made with a newer version" and leaves its steps unchanged

### Requirement: A specific task is secondary
A task chosen by hand SHALL be offered only as a folded "A specific task…" row at the end of a picker of a one-task input, and as the step Get a specific task, found by search and never suggested. A card holding one SHALL read "Always this task". Literal fixed targets SHALL stay first-class only where a fixed target is natural: a project, section, labels, a saved view, a template, a webhook, the user's own email address and a shared project's members. Starters SHALL hold no task chosen by hand. The CLI and MCP SHALL keep accepting a task literal and SHALL describe it as for rare fixed targets.

#### Scenario: Picker order
- **WHEN** the user opens the task word of Add a comment inside a Repeat over Find tasks, in a routine triggered by a label
- **THEN** the picker lists "↳ each task", then "the tasks", then "the task that triggered", then "Find tasks…", and "A specific task…" folded last

#### Scenario: Not in suggestions
- **WHEN** the user opens Add step under any card
- **THEN** Get a specific task is not among the suggestions or at the top of a group, and searching "specific task" finds it

### Requirement: Use cases
The change SHALL be accepted against the use-case matrix of its design: every routine marked buildable SHALL be a case of a shared use-case file that names the routine, the seeded data, the clock and the expected writes. The server SHALL run every case through a real run against a seeded store and produce exactly the expected writes, and the TypeScript checker SHALL accept every case's steps. The cases marked for the editor SHALL be built through the editor from an empty draft in a test that checks the saved steps match the case, that no step is Get a specific task, and that no input holds a task chosen by hand.

#### Scenario: Suite runs on both sides
- **WHEN** `go test ./internal/rules/...` and `npm test` run
- **THEN** every buildable case passes on the server with its exact writes and type-checks on the device, and every editor case is built without a task chosen by hand

## MODIFIED Requirements

### Requirement: Step types
Each step kind SHALL declare the types its inputs accept and the type of its output, from Text, Task, Tasks, Project, Date, Number and Lines (a list of Text). A reference whose type an input does not accept SHALL be a type error naming the step, the input and both types. The only conversions SHALL be: a Task where Tasks is accepted, a Number or a Date where Text is accepted. One task SHALL count as a list of one. A step that takes one item and receives a list SHALL run once per item, in the list's order, and output a list. At most one input of a step SHALL receive a list for each of its items. The device and the server SHALL type-check a routine identically, pinned by shared test vectors, so a type error is shown offline and the API refuses the same routine.

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

### Requirement: Sentence-card editor
The routine editor SHALL show a routine as cards stacked in one column, phone first: a When card (the trigger and its conditions) and one card per step, each read as a sentence in the user's language whose inputs are buttons ("Create tasks from **the lines** in **Errands**"). If/Otherwise and Repeat for each SHALL show their blocks indented under them. The editor SHALL be a page on every screen size (see "Routine editor page"), never a dialog. A rule written before routines SHALL open as a When card and one Change tasks card holding the rule's action controls, and saving it with one card SHALL keep it in the rule form so older devices can edit it. Saving SHALL write the routine as operations, offline included, converging like any rule edit. A message about a failed save SHALL disappear as soon as the routine is edited.

#### Scenario: Reading a routine
- **WHEN** the user opens "Groceries" on a 390 px phone
- **THEN** the page shows "Every Friday at 17:00", "Get the note text of Groceries", "Split the note text into lines", "Create tasks from the lines in Errands", one under the other, without sideways scrolling

#### Scenario: An old rule
- **WHEN** the user opens the rule "Label waiting → move to Waiting" and saves it without a change
- **THEN** the editor showed a When card and a Change tasks card, and nothing was written

#### Scenario: Saved offline
- **WHEN** the device is offline and the user adds a Count step and saves
- **THEN** the routine shows the new card at once, and every device shows it after sync

#### Scenario: Stale save message
- **WHEN** Save said "A routine needs at least one step" and the user then adds a step
- **THEN** the message is gone

### Requirement: Pickers and output chips
Tapping an input word SHALL open its picker next to the word, never as a centred modal:
- **Choices** (a value that flows into the step, a project, a section, labels, a view, a webhook, a mode such as Pick's, a date, a number): a compact list anchored to the word (a bottom sheet below 640 px), with a search field, arrow keys, Enter to choose, Escape to close, and focus back on the word. The list SHALL offer, as values of an accepted type (a list counts for a one-task input), the enclosing Repeat's item ("each task", "each line") first, then the outputs of earlier visible steps nearest first, then the trigger's output ("the task that triggered", "the matching tasks", "the date", or "the task you run it on" for a manual routine). Outputs of other types SHALL be listed under "Needs conversion" with their conversion. The fixed targets of the input follow. A task or tasks input SHALL offer "Find tasks…", which inserts a Find tasks step above and reads it, and a one-task input "A specific task…", last, which only then lists tasks. A date, a number, a test or a text to match SHALL have its small field under the list.
- **Text** (a comment, a notification, a note, a format): edited in place in the card, in a field that grows with the text; "/" or "+ value" inserts a value of an earlier step, shown as «its name»; Enter or leaving the field keeps it, Shift+Enter starts a new line, Escape puts the word back unchanged.
- **Bigger editors** (condition rows, the changes of Change tasks): inside the card under its sentence from 1024 px, a bottom sheet sized to its content below.

A word SHALL announce its picker (`aria-haspopup`, `aria-expanded`), lists SHALL be listboxes with options, and a choice SHALL be announced. Each card SHALL end with its output. The word of an empty task input SHALL read "choose which tasks"; an error on an empty input ("needs a value here") SHALL open the same picker.

#### Scenario: A chip from an earlier step
- **WHEN** the user taps the text word of a Notify me card after a Count step and chooses "+ value", then "the count"
- **THEN** the text is edited in the card, «the count» is inserted where the cursor was, and Enter keeps it

#### Scenario: Only fitting outputs
- **WHEN** the user taps the priority word of Create tasks after Find tasks and Count
- **THEN** a list opens next to the word with "the count" first, "the tasks" under "Needs conversion" with "Insert Count", and a number field under the list

#### Scenario: A list fits a one-task input
- **WHEN** the user taps the task word of Add a comment after Find tasks
- **THEN** "the tasks" is offered as a fitting value, not under "Needs conversion"

#### Scenario: Keyboard
- **WHEN** the user focuses the task word of Add a comment, presses Enter, types "pick", presses Enter and then Escape on another word's list
- **THEN** the list opens with its search focused, "the picked task" is chosen and announced, and Escape closes the other list with focus back on its word

#### Scenario: Condition rows in the card
- **WHEN** the user taps the condition word of Find tasks on a 1280 px screen, and then on a 768 px screen
- **THEN** the condition rows open inside the card under its sentence on the wide screen, and as a bottom sheet on the narrower one, never as a centred dialog

#### Scenario: Layout at three widths
- **WHEN** the layout check opens the routine page at 360, 768 and 1280 px and opens the Project word of Create tasks
- **THEN** the list stays inside the viewport, closes with Escape and a tap outside, and the page has no sideways scroll

### Requirement: Type errors with fixes
The editor SHALL type-check the routine on every change with the shared checker and show each error on its card, naming the input and both types, with a one-tap fix where one exists. The fixes SHALL be: insert Format text, Join, Count or Split into lines; wrap in Repeat for each when two lists reach one step; use the nearest flowing value for an empty input or one whose step was removed; insert Find tasks for a task input with nothing flowing; choose another value otherwise. A fix SHALL never insert a task chosen by hand or a Get a specific task step. Applying a fix SHALL be one undoable edit. A routine with a type error SHALL not be saved until it is fixed.

#### Scenario: Fix in one tap
- **WHEN** Notify me reads the tasks of Find tasks and the card says "Notify expects Text, got Tasks"
- **THEN** tapping "Insert Format text" adds a Format text step (the tasks' titles, one per line) between them and the error is gone

#### Scenario: Removed step
- **WHEN** the user deletes the Split into lines step whose output a later Create tasks card uses, and no other lines flow there
- **THEN** the later card shows "the lines no longer exists · Choose another value" and Save says "Fix step 3 first"

#### Scenario: Empty task input
- **WHEN** a Comment card's task input is empty after Find tasks (for example after its step was removed and re-added by keyboard)
- **THEN** the card offers "Use the tasks", and tapping it fills the input with the Find tasks output

#### Scenario: Nothing flowing
- **WHEN** a manual routine's first step is Add a comment and nothing flows into it
- **THEN** the card offers "Find tasks…", which inserts a Find tasks step above it and reads its tasks, and never a task picker

### Requirement: Add step
"+ Add step" SHALL open a search field over the step catalogue, matching names, descriptions and synonyms in the user's language and in English, with at most six suggestions of steps that accept the output type of the step above (inside a Repeat block, the type of its item; for a first step, the trigger's output), and the catalogue's groups below. Get a specific task SHALL never be suggested nor shown among a group's first entries. Steps that are not available SHALL be left out of the suggestions and groups and SHALL appear in search results dimmed with their hint and a link to the setting. The chosen step SHALL be inserted at the chosen place with its main input filled with the nearest flowing value that fits (`Data flows by default`).

#### Scenario: Suggestions after lines
- **WHEN** the user taps "+ Add step" under Split into lines
- **THEN** Create tasks, Pick, Count, Join, Sort and Add to a note are suggested

#### Scenario: Suggestions after tasks
- **WHEN** the user taps "+ Add step" under Find tasks
- **THEN** Change tasks, Add a comment, Pick, Sort, Count and Repeat for each are suggested

#### Scenario: Inside a Repeat
- **WHEN** the user adds Add a comment as the first step inside Repeat for each over Find tasks
- **THEN** the card reads "Comment on ↳ each task"

#### Scenario: Search for an unavailable step
- **WHEN** outgoing email is not set up and the user types "mail"
- **THEN** Email me is listed dimmed with "Set up email to use this" and a link, and is not in the Communication group

#### Scenario: Synonym in Italian
- **WHEN** an Italian user types "ripeti"
- **THEN** "Ripeti per ogni elemento" (Repeat for each) is found

### Requirement: Test and save
The editor SHALL offer Test, which runs the draft as a logged test run that writes nothing and shows it step by step in the page's Test column (the Test tab below 1024 px), Save, and for a saved routine Run now. Test and Run now need a connection and SHALL say so offline; Save SHALL not. A save error SHALL describe the draft as it is: it SHALL be cleared by the next edit, and "A routine needs at least one step" SHALL be shown only when Save is pressed on a routine without steps.

#### Scenario: Test a routine
- **WHEN** the user taps Test on "Groceries"
- **THEN** the run detail appears with each step's status and preview, marked "Test", and no task is created

#### Scenario: No stale error
- **WHEN** the user taps Save on a new routine with a name and no step, sees "A routine needs at least one step", and then adds Find tasks
- **THEN** the message is gone as soon as the card is added, and Save saves the routine
