## MODIFIED Requirements

### Requirement: Daily check
The app SHALL offer a Daily check at `/review/daily`, reachable from the Review screen's menu, the Loop home, the command palette and `g` then `Shift+R`. It SHALL show on one page:
- yesterday's line for tomorrow, when the last Close the day closed an earlier logical day than today and left a note, shown first and read-only
- the open Inbox count with "Process the Inbox"
- the overdue tasks
- today's tasks, where `f` toggles a task in or out of today's focus, up to three tasks

"Done for today" SHALL write the time of the daily check on the user's `review` entity. Today's focus SHALL be written there as the local date and the chosen task ids. Both sync to the user's devices only, are written offline, converge by last-writer-wins, are not content, are included in the export, and derive no activity event. A focus whose date is not today SHALL be shown as empty. Completed or deleted tasks SHALL drop out of the focus as it is shown, without a write. "Today" and "the local date" here are the user's logical today (OpenSpec `date-time-preferences`, "Logical today"), so a check finished or a focus chosen after midnight but before the day start belongs to the day being lived. The day a close closed is the day stored with it (`closed_day`), or, for a close stored without one, the logical day of its time. The note needs no write to show or to stop showing: it is shown while the latest close closed an earlier day and disappears once the day is closed again.

#### Scenario: Pick a focus
- **WHEN** the user presses `f` on three of today's tasks and then on a fourth
- **THEN** the first three are the focus, the fourth is refused with a message that the focus holds three tasks, and the Loop home lists the three on every device after sync

#### Scenario: Next day
- **WHEN** the focus was chosen yesterday
- **THEN** today's Daily check and the Loop home show no focus until the user picks one

#### Scenario: Done for today
- **WHEN** the user finishes the Daily check on the phone
- **THEN** the laptop's Review marker no longer shows the daily check as due after sync

#### Scenario: Yesterday's note in the morning
- **WHEN** the day was closed yesterday with "Start with the invoice" and the user opens the Daily check today
- **THEN** the note is shown above the Inbox count as yesterday's line, and it is gone once today is closed

#### Scenario: No note
- **WHEN** the day was closed yesterday without a note, or never
- **THEN** the Daily check shows no note line and nothing else changes

#### Scenario: Focus kept past midnight
- **WHEN** the day start is `04:00`, the focus was chosen on Wednesday evening and the user opens the Loop home at 01:00 on Thursday
- **THEN** the focus is still shown, and it is empty once 04:00 has passed

#### Scenario: Closed just after midnight
- **WHEN** the day start is `00:00`, the user opened Close the day at 23:59 on Wednesday, wrote "Start with the invoice" and closed at 00:02 on Thursday
- **THEN** Thursday's Daily check shows "Start with the invoice" as yesterday's line

### Requirement: Close the day steps
Close the day SHALL be a guided sequence of three steps with a progress indicator that fits 375 px and one step card showing its position ("Step 2 of 3"), the step's content, and Back and Next inside the card, with `[` and `]` moving between steps and focus moving to each step's title. The steps are How the day went, Carry over, and A note for tomorrow morning. On the last step Next SHALL be "Close the day". Every step SHALL work offline from local rows.

The day being closed SHALL be the user's logical today at the moment the screen opened, and it SHALL stay that day until the screen is left, whatever the clock does meanwhile: the figures, the tasks offered for carry-over, the meaning of "Tomorrow", the carry-over record and the close all refer to it.

#### Scenario: Walk the three steps
- **WHEN** the user opens Close the day and presses `]` twice
- **THEN** the card shows Carry over, then A note for tomorrow morning with "Step 3 of 3", the primary action reads "Close the day", and each move puts focus on the step's title

#### Scenario: Phone width
- **WHEN** Close the day is shown on a 375 px wide screen
- **THEN** the three steps are visible in the progress indicator without horizontal scrolling, the carry-over decisions wrap under the task inside the card, and Back and Next are reachable inside the card

#### Scenario: Closing across midnight
- **WHEN** the day start is `00:00`, the user opens Close the day at 23:59 on Wednesday with three tasks unfinished, leaves them on Tomorrow, and closes at 00:02 on Thursday
- **THEN** the figures stay Wednesday's, the three tasks are due Thursday, the close is recorded for Wednesday, and Thursday's Today offers "Close the day" for Thursday

### Requirement: How the day went
The first step SHALL show, computed on the device from local rows and nothing written, in one sentence with the numbers emphasised: planned (the open and completed tasks Today listed on the day being closed), done (tasks completed on that day, as Statistics counts completed), and, when a focus was chosen for that day, a second sentence with the focus as "n of m done". Deleted tasks and skipped habit occurrences SHALL count nowhere. No time, mood or score SHALL be shown, and every device SHALL show the same figures for the same rows.

#### Scenario: A day with a focus
- **WHEN** Today listed eight tasks, five were completed on the local date, and two of the three focus tasks are done
- **THEN** the step reads 8 planned, 5 done, and focus "2 of 3 done"

#### Scenario: Agrees with Statistics
- **WHEN** the step says 5 done today and the user opens Statistics for this week on the same day
- **THEN** the per-day chart shows 5 for today

#### Scenario: Nothing was planned
- **WHEN** Today listed nothing and nothing was completed
- **THEN** the step says so in one line and Next still leads to Carry over

### Requirement: Carry over unfinished tasks
The Carry over step SHALL take every open task Today lists on the day being closed, one at a time: a card shows the task's whole title, its project and why it is in Today (due that day, open since an earlier day, or started), with five decisions: Tomorrow (the default), Pick a day, Someday, Keep in Today, and Done already. `t`, `p`, `y`, `h` and `d` SHALL set them for the task on the card, and choosing one SHALL show the next task. Below the card a list SHALL show every task with its decision so far, a task not yet decided showing the default; activating a line SHALL bring that task back to the card so its decision can be changed. A task the user may not edit SHALL offer Keep only and say why. Neither the card nor the list SHALL offer a control that completes a task on its own: completing is the Done already decision. Decisions are device interface state until they are written: nothing is written or synced by choosing them.

#### Scenario: Default carry-over
- **WHEN** three tasks are unfinished, one due today at 14:00, one overdue since Monday and one started by its start date, and the user moves on from Carry over without changing a decision
- **THEN** the first is due tomorrow at 14:00, the two others are due tomorrow without a time, all three leave Today at once, and the toast reads "3 tasks rescheduled" with Undo

#### Scenario: Mixed decisions
- **WHEN** the user presses `y` on the first task's card, `h` on the second, picks Friday for the third and moves on
- **THEN** the first is in Someday without a date, the second is unchanged and still in Today, the third is due Friday, and the batch is undone in one step

#### Scenario: Read-only task
- **WHEN** one unfinished task is in a shared project where the user is a viewer
- **THEN** its card offers Keep only with the reason, and moving on writes nothing for it

#### Scenario: Nothing to carry over
- **WHEN** every task of Today is completed
- **THEN** the step says the day is done and offers Next, and moving on writes nothing

#### Scenario: Done already
- **WHEN** the user presses `d` on a task that was in fact finished and on a weekly repeating task, then moves on
- **THEN** the first is completed, the repeating task moves to its next occurrence, both in the same batch and toast as the other decisions, and Undo reopens them with the rest

#### Scenario: Change an earlier decision
- **WHEN** the user decided Someday for the first task and, from the list below the card, opens it again and presses `t`
- **THEN** the list shows Tomorrow for it, and moving on reschedules it to tomorrow

#### Scenario: No accidental completion
- **WHEN** the user clicks anywhere on the card or on a line of the list
- **THEN** no task is completed or rescheduled until the user moves on from the step

### Requirement: Carry-over is one batch
Moving on from Carry over (Next, `]`, or a later step in the progress indicator) SHALL write the decisions as ONE batch of ordinary task operations (due date, Someday, completion) through the same path as bulk actions: every change shows at once, is queued while offline, syncs as per-field operations converging by last-writer-wins per task and field, and is undone in one step from the toast or `Ctrl`/`⌘`+`Z`, with a field changed since skipped and its task named. Keep writes nothing. Once the user is past Carry over, the progress indicator SHALL show it as done, never as tasks left. Going back to Carry over shows the tasks still in Today; moving on again writes their changed decisions as a further batch of the same day.

#### Scenario: Apply offline
- **WHEN** the device is offline and the user moves on from Carry over with four carry-overs
- **THEN** the four tasks are rescheduled locally at once and the operations reach the user's other devices after the next sync

#### Scenario: Concurrent edit converges
- **WHEN** the batch moves a task to tomorrow while the phone renames it offline, and both sync
- **THEN** every device shows the task due tomorrow with the new title

#### Scenario: Undo after a later change
- **WHEN** the user carries over five tasks, gives one of them a date by hand, then activates Undo
- **THEN** the four others return to their previous dates, the hand-edited one is left alone and named in the toast

#### Scenario: Past Carry over
- **WHEN** the user moves on to A note for tomorrow morning after Carry over
- **THEN** Carry over's circle shows a check and no count

### Requirement: Closing the day
"Close the day" on the last step SHALL write the time as `closed_at`, the day being closed as `closed_day` (`YYYY-MM-DD`) and the note (one line, trimmed, empty allowed) as `tomorrow_note` on the user's `review` entity through the operation log, and then show the Done for today state. The third step SHALL show, while a note is typed, a preview of where it will appear ("Tomorrow your Daily check starts with: …"). Closing a day that is already closed SHALL be allowed and write a newer time and note. The stamp and the day are not content; the note is user-written content and SHALL be encrypted for an encrypted account.

#### Scenario: Close with a note
- **WHEN** the user types "Start with the invoice" and activates Close the day
- **THEN** the review row carries the time, the day and the note, Done for today is shown, "Back to Today" shows Today with "Day closed" at its end, and the laptop shows the same after sync

#### Scenario: Close again
- **WHEN** the day was closed at 18:00 and the user closes it again at 21:10 with a new note
- **THEN** the row carries 21:10 and the new note, and the Daily check shows the new note the next morning

#### Scenario: Undo does not reopen the day
- **WHEN** the user undoes the carry-over batch after closing the day
- **THEN** the tasks return to Today and the close stamp is kept; closing again writes a newer time

#### Scenario: Note preview
- **WHEN** the user types "Call Ana first" on the third step
- **THEN** the step shows "Tomorrow your Daily check starts with: “Call Ana first”"

### Requirement: Close record syncs and converges
`closed_at`, `closed_day` and `tomorrow_note` SHALL sync to the user's devices only, be written offline through the outbox, and converge per field by last-writer-wins. All three SHALL be in the JSON export and derive no activity event. A server that does not know a field SHALL reject that op as unknown while the device keeps its local value; a device that has no `closed_day` for a close SHALL take the logical day of `closed_at` as the day closed.

#### Scenario: Two closes offline
- **WHEN** the phone closes the day at 18:00 with the note "Call Ana" and the laptop at 18:30 with no note, both offline, then sync
- **THEN** every device holds 18:30 as the close and the empty note, each field by its own latest write

#### Scenario: Older server
- **WHEN** the device syncs with a server that does not know `closed_at`, `closed_day` or `tomorrow_note`
- **THEN** those ops are rejected as unknown, the device keeps its local values, and the carry-over ops still sync

#### Scenario: Close from an older version
- **WHEN** a close was written by a version that did not store `closed_day`
- **THEN** every device treats the logical day of its `closed_at` as the day closed

### Requirement: Reopen the day
Until the user's logical day ends, a day closed on that logical day SHALL be reopenable from the "Day closed" row at the end of Today and from the Close the day screen with "Reopen the day". Carrying over SHALL record on the user's `review` entity, in the additive field `carry_over`, the logical date and, for each task a batch changed, the task, the field and its value before and after the batch; a further batch of the same date SHALL add its items to the record. Reopening SHALL write, as ONE batch of ordinary operations undone in one step from its toast or `Ctrl`/`⌘`+`Z`: each recorded field back to its value before, unless the field no longer holds the value the batch wrote, in which case it is left alone and the task is named in the toast; `closed_at` cleared (0, as for a day never closed), `closed_day` cleared and `carry_over` emptied; `tomorrow_note` kept, so a later close starts from it. After the logical day ends, or when nothing was closed on it, Reopen SHALL not be offered. Reopening SHALL work offline through the outbox, and every field SHALL converge by last-writer-wins like any other edit. `carry_over` holds task ids, field names and dates, never user-written text, so it is not encrypted for an encrypted account; it is in the JSON export and derives no activity event.

#### Scenario: Reopen after the toast is gone
- **WHEN** the user closed the day at 18:30, moving four tasks to tomorrow, and at 20:00 activates "Reopen the day" on the row at the end of Today
- **THEN** the four tasks are due today again, the row reads "Close the day", the toast reads "Day reopened, 4 tasks back in Today" with Undo, and the line for tomorrow is still filled in when Close the day is opened again

#### Scenario: A task changed since the close
- **WHEN** the carry-over moved five tasks to tomorrow, the user then gave one of them Friday by hand, and reopens the day
- **THEN** four tasks return to today, the one due Friday stays on Friday, and the toast names it

#### Scenario: Reopen on another device
- **WHEN** the laptop closed the day and the phone, after syncing, reopens it while offline
- **THEN** the phone shows the tasks back in Today at once, and after both sync every device shows the day open and the tasks due today

#### Scenario: Next morning
- **WHEN** the day was closed yesterday and the user opens Today after the day start
- **THEN** no Reopen is offered for yesterday, and the row offers "Close the day" for the new day

#### Scenario: Older server
- **WHEN** the device syncs with a server that does not know `carry_over`
- **THEN** that op is rejected as unknown, the device keeps its local value, the carry-over and reopen task ops still sync, and Reopen on another device restores only the close stamp and says that the tasks stay where they are

#### Scenario: Two batches in one evening
- **WHEN** the user carried over three tasks, went back, moved a kept task to Friday, closed the day and then reopens it
- **THEN** all four tasks are back in Today
