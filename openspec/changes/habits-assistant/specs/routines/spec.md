## ADDED Requirements

### Requirement: Habit steps
Find habits SHALL use the numbers of "Habit numbers on the server" (OpenSpec `habits`) on the server and the same numbers on a device that runs the routine. Log a habit SHALL plan the change `log_habit` plans and write it through the op log like every step, so a webhook or a scheduled routine can log a habit ("when Home Assistant posts a walk, log Walk"). Neither step SHALL be offered in the editor while the user's Habits preference is off; a routine that already holds one SHALL keep running.

#### Scenario: An evening nudge
- **WHEN** a routine every day at 20:00 finds habits at risk and notifies "Two days without: {the titles}", and Read was missed on its last two scheduled days
- **THEN** the user gets the notification naming Read, and nothing is written

#### Scenario: A walk from a webhook
- **WHEN** a routine triggered by an incoming webhook logs the habit Walk as done today, and the webhook fires
- **THEN** today's record of Walk is done and the series moves on, as a check-in in the app does

## MODIFIED Requirements

### Requirement: Step catalogue
The catalogue SHALL offer these steps, grouped as listed, with the inputs and outputs of the designs' catalogues:
- **Tasks:** Find tasks (a filter query, a saved view or a rule condition, at most 500, live; a condition finds open tasks, and a query or view follows the filter rule of open tasks unless it names `completed` or `open` or compares the completion date), Create tasks (one per line of a Text or Lines, each line read with quick-add syntax, or from fields; in a project, or as subtasks of a parent task), Change tasks (priority, due, start, deadline, energy, assignee, labels added and removed, project and section, complete or reopen, move to the Trash), Add a comment, Get a specific task.
- **Projects:** Find project (by name), Get the project of a task, Create project, Update project (name, colour, icon, archived), Create sections, Create labels, Favourite, Create a project from a template of the library.
- **Notes and text:** Find notes (standalone notes by project, sub-projects included, by labels, by when they last changed and by words read like the Notes page search, at most 500, newest change first), Get a specific note, Create note (a title, a text, a project and labels; outputs the Note), Change notes (project, labels added and removed, pin or unpin for the run-as person, move to the Trash), Turn into task (outputs the Task), Get note text (of a task, of a project, or of a note; the text or the title), Add to a note and Clear a note (of a task, of a project or of a note, from an earlier step or chosen in the picker), Split into lines (optionally only the open checkboxes), Join, Format text (placeholders for earlier outputs, a note's title included), Find and replace (plain text).
- **Habits:** Find habits (open habits, optionally only those at risk, back on track or with a streak of at least N; outputs Tasks), Log a habit (a habit, a date, today by default, a state and an optional note).
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

#### Scenario: Habits group
- **WHEN** the user opens Add step while Habits is on
- **THEN** a Habits group offers Find habits and Log a habit

#### Scenario: A note from the week's work
- **WHEN** the routine "Weekly review note" runs on Friday at 16:00 (Find tasks `completed = this week` → Join their titles → Create note "Week {the date}" with the joined text in Reviews, label review) and the user completed four tasks this week
- **THEN** one standalone note "Week 2026-11-13" exists in Reviews with the label review and the four titles, on every device after sync

#### Scenario: Stale reference notes
- **WHEN** a monthly routine finds the notes in Reference that have not changed for 90 days and changes them: add label review
- **THEN** each such note gets the label review in one run, and notes changed within 90 days are untouched
