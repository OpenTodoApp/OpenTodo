## ADDED Requirements

### Requirement: Tomorrow's first thing
The last step of Close the day SHALL list the tasks due on the day after the day being closed, including those the What moves step is moving there, in the order Today will list them, as a single-choice list with nothing chosen.
- Choosing one SHALL make it tomorrow's first thing.
- The one-line note for tomorrow SHALL stay under the list.

Closing SHALL write the first thing as that next day's focus:
- When the focus is not yet for that day, `focus_date` is the next logical date, `focus` is the task's id and `focus_slots` is empty.
- When `focus_date` already is that day, the task's id is put first and at most three ids are kept.

The carry-over record SHALL hold, under an optional `focus` key, the three focus fields as they were before, so Reopen the day and the close's Undo restore them. A reader that does not know the key SHALL ignore it.

Tomorrow's Daily check and the Focus screen SHALL start from that focus. The record holds task ids and dates only, never content. It works offline and converges per field by last-writer-wins.

#### Scenario: Pick the first thing
- **WHEN** the user picks "Send the invoice to Ana" on the last step and closes the day
- **THEN** the next morning's Daily check shows it as today's focus, and the Focus screen opened with `g` then `Shift+F` shows it

#### Scenario: A task moved there tonight
- **WHEN** the What moves step moves "Call the plumber" to tomorrow
- **THEN** the last step lists "Call the plumber" among tomorrow's tasks

#### Scenario: Nothing chosen
- **WHEN** the user closes the day without choosing a first thing
- **THEN** the focus fields are not written

#### Scenario: Undo restores the focus
- **WHEN** today's focus was two tasks, the user picked a first thing, closed the day and activates Undo on the toast
- **THEN** today's focus is the two tasks again and nothing is seeded for tomorrow

#### Scenario: An older client reopens
- **WHEN** a client that does not know the `focus` key reopens the day
- **THEN** the tasks and the close stamp are restored and tomorrow's focus stays seeded

## MODIFIED Requirements

### Requirement: Close the day steps
Close the day SHALL be a guided sequence of three steps: Done, What moves, and Tomorrow's first thing.
- A progress indicator SHALL fit 375 px.
- One step SHALL be shown at a time as a titled section with its content, then Back and Next at its end.
- `[` and `]` SHALL move between steps, and focus SHALL move to each step's title.
- "Close the day" SHALL be offered on every step: as a secondary action on the first two steps and as the primary action on the last. Closing from an earlier step SHALL apply every decision made so far, and the default for any task not decided.
- Every step SHALL work offline from local rows.

The day being closed SHALL be the user's logical today at the moment the screen opened. It SHALL stay that day until the screen is left, whatever the clock does meanwhile. The figures, the tasks offered, the meaning of "Tomorrow", the carry-over record and the close all refer to it.

#### Scenario: Walk the three steps
- **WHEN** the user opens Close the day and presses `]` twice
- **THEN** the screen shows What moves, then Tomorrow's first thing with the third dot of the progress indicator current, the primary action reads "Close the day", and each move puts focus on the step's title

#### Scenario: Phone width
- **WHEN** Close the day is shown on a 375 px wide screen
- **THEN** the three steps are visible in the progress indicator without horizontal scrolling, each row's decision wraps under its title, and Back, Next and Close the day are reachable at the step's end

#### Scenario: Closing across midnight
- **WHEN** the day start is `00:00`, the user opens Close the day at 23:59 on Wednesday with three tasks unfinished, leaves them on Tomorrow, and closes at 00:02 on Thursday
- **THEN** the figures stay Wednesday's, the three tasks are due Thursday, the close is recorded for Wednesday, and Thursday's Today offers "Close the day" for Thursday

#### Scenario: Skip to the close
- **WHEN** the user opens Close the day with four unfinished tasks and activates "Close the day" on the first step
- **THEN** the four tasks are due tomorrow, the day is closed, and Done for today is shown

### Requirement: How the day went
The Done step SHALL show, computed on the device from local rows with nothing written:
- the tasks completed on the day being closed, in completion order, as compact read-only rows;
- above them, one lead line with planned (the open and completed tasks Today listed on the day being closed) and done (tasks completed on that day, as Statistics counts completed);
- when a focus was chosen for that day, the focus as "n of m".

More than eight completed tasks SHALL show the first eight and "and n more", which shows the rest in place. Deleted tasks and skipped habit occurrences SHALL count nowhere. No time, mood or score SHALL be shown, and every device SHALL show the same figures for the same rows.

#### Scenario: A day with a focus
- **WHEN** Today listed eight tasks, five were completed on the local date, and two of the three focus tasks are done
- **THEN** the step lists the five completed tasks and its lead reads 5 of 8 done and focus 2 of 3

#### Scenario: Agrees with Statistics
- **WHEN** the step says 5 done today and the user opens Statistics for this week on the same day
- **THEN** the per-day chart shows 5 for today

#### Scenario: Nothing was planned
- **WHEN** Today listed nothing and nothing was completed
- **THEN** the step says so in one line and Next still leads to What moves

### Requirement: Carry over unfinished tasks
The What moves step SHALL list every open task Today lists on the day being closed on one list. Each row SHALL show the task's title, its project and why it is in Today (due that day, open since an earlier day, or started), with:
- a choice of Tomorrow (the default, selected), Later (a day picked in a date dialog, which the row then shows) and Someday;
- a row menu holding Keep in Today and Done already.

The step SHALL offer "All to tomorrow", which sets every editable row to Tomorrow.

Keys:
- `j` and `k` SHALL move between rows.
- `t`, `p`, `y`, `h` and `d` SHALL set Tomorrow, Later, Someday, Keep in Today and Done already for the current row and move to the next one.
- `Shift+T` SHALL be All to tomorrow.

A task the user may not edit SHALL show that it keeps its place and offer no choice. No control on the list SHALL complete a task on its own: completing is the Done already decision. Decisions are device interface state until the day is closed: nothing is written or synced by choosing them.

#### Scenario: Default carry-over
- **WHEN** three tasks are unfinished, one due today at 14:00, one overdue since Monday and one started by its start date, and the user closes the day without changing a decision
- **THEN** the first is due tomorrow at 14:00, the two others are due tomorrow without a time, all three leave Today at once, and the toast reads "Day closed · 3 moved to tomorrow" with Undo

#### Scenario: Mixed decisions
- **WHEN** the user presses `y` on the first row, `h` on the second, picks Friday through `p` on the third and closes the day
- **THEN** the first is in Someday without a date, the second is unchanged and still in Today, the third is due Friday, and the whole close is undone in one step

#### Scenario: Read-only task
- **WHEN** one unfinished task is in a shared project where the user is a viewer
- **THEN** its row shows that it keeps its place and offers no choice, and closing writes nothing for it

#### Scenario: Nothing to carry over
- **WHEN** every task of Today is completed
- **THEN** the step says the day is done and offers Next, and closing writes no task change

#### Scenario: Done already
- **WHEN** the user presses `d` on a task that was in fact finished and on a weekly repeating task, then closes the day
- **THEN** the first is completed, the repeating task moves to its next occurrence, both in the same batch and toast as the other decisions, and Undo reopens them with the rest

#### Scenario: Change an earlier decision
- **WHEN** the user set Someday for the first row, moves back to it with `k` and presses `t`
- **THEN** the row shows Tomorrow, and closing reschedules it to tomorrow

#### Scenario: No accidental completion
- **WHEN** the user clicks anywhere on a row or the list
- **THEN** no task is completed or rescheduled until the user closes the day

#### Scenario: All to tomorrow
- **WHEN** the user set Someday and Later on two of five rows and presses `Shift+T`
- **THEN** all five rows show Tomorrow

### Requirement: Carry-over is one batch
"Close the day" SHALL write the carry-over decisions, tomorrow's first thing and the close as ONE batch of ordinary operations (due date, Someday, completion, the focus fields and the `review` fields) through the same path as bulk actions:
- every change shows at once;
- the batch is queued while offline;
- it syncs as per-field operations converging by last-writer-wins per entity and field;
- it is undone in one step from the toast or `Ctrl`/`⌘`+`Z`, with a field changed since skipped and its task named.

Keep writes nothing. Leaving the screen before closing SHALL write nothing. Until the day is closed, the progress indicator SHALL show What moves as decided but not yet moved, never as tasks left.

#### Scenario: Apply offline
- **WHEN** the device is offline and the user closes the day with four carry-overs
- **THEN** the four tasks are rescheduled locally at once and the operations reach the user's other devices after the next sync

#### Scenario: Concurrent edit converges
- **WHEN** the batch moves a task to tomorrow while the phone renames it offline, and both sync
- **THEN** every device shows the task due tomorrow with the new title

#### Scenario: Undo after a later change
- **WHEN** the user closes the day carrying over five tasks, gives one of them a date by hand, then activates Undo
- **THEN** the four others return to their previous dates, the hand-edited one is left alone and named in the toast, and the day is open again

#### Scenario: Past Carry over
- **WHEN** the user moves on to Tomorrow's first thing after What moves
- **THEN** the What moves dot shows it is decided, no task has moved yet, and no count of tasks left is shown

#### Scenario: Leave without closing
- **WHEN** the user decides three rows and leaves the screen with Esc
- **THEN** nothing is written and the three tasks are still in Today

### Requirement: Closing the day
"Close the day" SHALL write, in the batch of "Carry-over is one batch", on the user's `review` entity through the operation log:
- the time as `closed_at`;
- the day being closed as `closed_day` (`YYYY-MM-DD`);
- the note (one line, trimmed, empty allowed) as `tomorrow_note`;
- the carry-over record.

It SHALL then show the Done for today state and a toast naming the close with Undo. Undo SHALL do what Reopen the day does, in one step, and restore the focus from the record. The last step SHALL show, while a note is typed, a preview of where it will appear ("Tomorrow your Daily check starts with: …"). Closing a day that is already closed SHALL be allowed and write a newer time and note. The stamp and the day are not content. The note is user-written content and SHALL be encrypted for an encrypted account.

#### Scenario: Close with a note
- **WHEN** the user types "Start with the invoice" and activates Close the day
- **THEN** the review row carries the time, the day and the note, Done for today is shown, "Back to Today" shows Today with "Day closed" at its end, and the laptop shows the same after sync

#### Scenario: Close again
- **WHEN** the day was closed at 18:00 and the user closes it again at 21:10 with a new note
- **THEN** the row carries 21:10 and the new note, and the Daily check shows the new note the next morning

#### Scenario: Undo does not reopen the day
- **WHEN** the user closed the day, then edited another task's title and pressed `Ctrl`/`⌘`+`Z` once
- **THEN** only the title edit is undone and the day stays closed; a second `Ctrl`/`⌘`+`Z` undoes the whole close

#### Scenario: Note preview
- **WHEN** the user types "Call Ana first" on the last step
- **THEN** the step shows "Tomorrow your Daily check starts with: “Call Ana first”"

#### Scenario: Undo the whole close
- **WHEN** the user closed the day moving three tasks to tomorrow and activates Undo on the toast
- **THEN** the three tasks are in Today again, the row at the end of Today reads "Close the day", and the note is kept for the next close

### Requirement: Done for today
After "Close the day" has written the close, the Close the day screen SHALL show one final state in place of its steps:
- the `day-done` illustration;
- "Day closed, <time>";
- one line with the figures of the Done step and the carry-over ("5 done, 3 moved to tomorrow, 1 kept");
- tomorrow's first thing named when one was chosen, and the line for tomorrow quoted when one was written;
- a primary "Back to Today" with focus;
- "Reopen the day" where that is offered.

It SHALL show no streak, score, comparison or prompt to do more. The state is device interface state: showing it writes nothing, Escape and "Back to Today" return to Today, and reloading the route shows the ordinary first step. Under reduced motion the state SHALL appear with a crossfade only. It SHALL work offline from local rows.

#### Scenario: Close with carry-over
- **WHEN** 5 tasks were completed, the user moved 3 to tomorrow, kept 1 in Today, picked "Send the invoice" as the first thing, wrote "Start with the invoice" and activates Close the day at 18:42
- **THEN** the screen shows the notebook-and-moon drawing, "Day closed, 18:42", "5 done, 3 moved to tomorrow, 1 kept", "Send the invoice" as tomorrow's first thing, the quoted line, focus on "Back to Today", and Enter opens Today with "Day closed, 18:42" at its end

#### Scenario: Nothing was planned
- **WHEN** Today listed nothing and the user closes the day without a note or a first thing
- **THEN** the state reads "Day closed" with the time and "Nothing was planned today", no figures line beyond that, and no quoted line

#### Scenario: Reload
- **WHEN** the user reloads the page while the final state is shown
- **THEN** the Close the day screen shows its first step with "Day closed, 18:42" in its header, as for any closed day
