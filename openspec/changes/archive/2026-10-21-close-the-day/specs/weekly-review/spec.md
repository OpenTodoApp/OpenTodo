# Spec Delta

## ADDED Requirements

### Requirement: Close the day is reachable
The app SHALL offer Close the day at `/review/close`, reachable in every mode from a row at the end of the Today list, from the Loop home's Review move, from the command palette and by `g` then `Shift+D`. The row at the end of Today SHALL add no row above the list's first item and SHALL read "Day closed, <time>" after a close on the user's local date. Opening the screen SHALL need no connection; it reads local rows only.

#### Scenario: From the end of Today
- **WHEN** Today lists five tasks and the user moves past the last row and activates "Close the day"
- **THEN** the Close the day screen opens on its first step with focus on the step's title

#### Scenario: Keyboard path
- **WHEN** focus is not in a text field and the user presses `g` then `Shift+D`
- **THEN** the Close the day screen opens, and the cheat sheet lists the shortcut under "Go to a view"

#### Scenario: Already closed today
- **WHEN** the day was closed at 18:42 on this device's local date
- **THEN** the row at the end of Today reads "Day closed, 18:42" and still opens the screen, so a second close is possible

### Requirement: Close the day steps
Close the day SHALL be a guided sequence of three steps shown as the weekly review shows its steps: a progress indicator that fits 375 px, one step card with its position ("Step 2 of 3"), Back and Next below it, `[` and `]` moving between steps, and focus moving to each step's title. The steps are How the day went, Carry over, and A line for tomorrow. On the last step Next SHALL be "Close the day". Every step SHALL work offline from local rows.

#### Scenario: Walk the three steps
- **WHEN** the user opens Close the day and presses `]` twice
- **THEN** the card shows Carry over, then A line for tomorrow with "Step 3 of 3", the primary action reads "Close the day", and each move puts focus on the step's title

#### Scenario: Phone width
- **WHEN** Close the day is shown on a 375 px wide screen
- **THEN** the three steps are visible in the progress indicator without horizontal scrolling, each unfinished task's decision wraps under its row, and Back and Next are reachable below the step

### Requirement: How the day went
The first step SHALL show, computed on the device from local rows and nothing written: planned (the open and completed tasks Today listed on the local date), done today (tasks completed on the local date, as Statistics counts completed), and today's focus as "n of m done" when a focus was chosen today. Deleted tasks and skipped habit occurrences SHALL count nowhere. No time, mood or score SHALL be shown, and every device SHALL show the same figures for the same rows.

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
The Carry over step SHALL list every open task Today lists, each with one decision: Tomorrow (the default), Pick a day, Someday, or Keep in Today. On the selected row `t`, `p`, `y` and `h` SHALL set them. A task the user may not edit SHALL be listed with Keep only. Decisions are device interface state until applied: nothing is written or synced by choosing them. Before they are applied the step SHALL say so beside its count.

#### Scenario: Default carry-over
- **WHEN** three tasks are unfinished, one due today at 14:00, one overdue since Monday and one started by its start date, and the user applies without changing a decision
- **THEN** the first is due tomorrow at 14:00, the two others are due tomorrow without a time, all three leave Today at once, and the toast reads "3 tasks rescheduled" with Undo

#### Scenario: Mixed decisions
- **WHEN** the user presses `y` on one row, `h` on another, picks Friday for a third and applies
- **THEN** the first is in Someday without a date, the second is unchanged and still in Today, the third is due Friday, and the batch is undone in one step

#### Scenario: Read-only task
- **WHEN** one unfinished task is in a shared project where the user is a viewer
- **THEN** its row offers Keep only and Apply writes nothing for it

#### Scenario: Nothing to carry over
- **WHEN** every task of Today is completed
- **THEN** the step says the day is done and offers Next without an Apply

### Requirement: Carry-over is one batch
"Apply" SHALL write the decisions as ONE batch of ordinary task operations (due date, Someday) through the same path as bulk actions: every change shows at once, is queued while offline, syncs as per-field operations converging by last-writer-wins per task and field, and is undone in one step from the toast or `Ctrl`/`⌘`+`Z`, with a field changed since skipped and its task named. Keep writes nothing.

#### Scenario: Apply offline
- **WHEN** the device is offline and the user applies four carry-overs
- **THEN** the four tasks are rescheduled locally at once and the operations reach the user's other devices after the next sync

#### Scenario: Concurrent edit converges
- **WHEN** the batch moves a task to tomorrow while the phone renames it offline, and both sync
- **THEN** every device shows the task due tomorrow with the new title

#### Scenario: Undo after a later change
- **WHEN** the user applies five carry-overs, gives one of them a date by hand, then activates Undo
- **THEN** the four others return to their previous dates, the hand-edited one is left alone and named in the toast

### Requirement: Closing the day
"Close the day" on the last step SHALL write the time as `closed_at` and the note (one line, trimmed, empty allowed) as `tomorrow_note` on the user's `review` entity through the operation log, and then return to the Today view. Closing a day that is already closed SHALL be allowed and write a newer time and note. The stamp is not content; the note is user-written content and SHALL be encrypted for an encrypted account.

#### Scenario: Close with a note
- **WHEN** the user types "Start with the invoice" and activates Close the day
- **THEN** the review row carries the time and the note, Today is shown with "Day closed" at its end, and the laptop shows the same after sync

#### Scenario: Close again
- **WHEN** the day was closed at 18:00 and the user closes it again at 21:10 with a new note
- **THEN** the row carries 21:10 and the new note, and the Daily check shows the new note the next morning

#### Scenario: Undo does not reopen the day
- **WHEN** the user undoes the carry-over batch after closing the day
- **THEN** the tasks return to Today and the close stamp is kept; closing again writes a newer time

### Requirement: Close record syncs and converges
`closed_at` and `tomorrow_note` SHALL sync to the user's devices only, be written offline through the outbox, and converge per field by last-writer-wins. Both SHALL be in the JSON export and derive no activity event. A server that does not know the fields SHALL reject those ops as unknown while the device keeps its local values.

#### Scenario: Two closes offline
- **WHEN** the phone closes the day at 18:00 with the note "Call Ana" and the laptop at 18:30 with no note, both offline, then sync
- **THEN** every device holds 18:30 as the close and the empty note, each field by its own latest write

#### Scenario: Older server
- **WHEN** the device syncs with a server that does not know `closed_at` or `tomorrow_note`
- **THEN** those ops are rejected as unknown, the device keeps its local values, and the carry-over ops still sync

## MODIFIED Requirements

### Requirement: Finishing a review
"Finish review" SHALL write `completed_at` on the user's `review` entity (id `me`, personal scope) through the operation log. The Daily check SHALL write `daily_at`, `focus_date` and `focus` on the same entity, the Monthly look SHALL write `monthly_at`, and Close the day SHALL write `closed_at` and `tomorrow_note`. The entity SHALL sync to every device of the user, SHALL be written offline through the outbox, and SHALL converge per field by last-writer-wins, so the latest finish of each rhythm wins. Its times and focus are not user-written content and are never encrypted; `tomorrow_note` is content and follows the end-to-end encryption rules. The entity SHALL be included in the JSON export and SHALL derive no activity event.

#### Scenario: Finish on one device
- **WHEN** the user finishes a review on the laptop and later opens the phone
- **THEN** both show the same "Last review" time after sync

#### Scenario: Two finishes offline
- **WHEN** two devices finish a review while offline, then sync
- **THEN** every device shows the later of the two times

#### Scenario: Daily and weekly on different devices
- **WHEN** the phone finishes the Daily check and the laptop finishes the weekly review, both offline, then sync
- **THEN** both times are kept on every device

#### Scenario: Older server
- **WHEN** the device syncs with a server that does not know the `review` entity or one of its fields
- **THEN** the op is rejected as unknown, the device keeps its local value, and nothing else is affected

#### Scenario: Encrypted account's note
- **WHEN** an encrypted account closes the day with the note "Call the bank"
- **THEN** the operation that leaves the device carries ciphertext for `tomorrow_note`, the close time is plaintext, and the user's other device shows the note decrypted

### Requirement: Daily check
The app SHALL offer a Daily check at `/review/daily`, reachable from the Review screen's menu, the Loop home, the command palette and `g` then `Shift+R`. It SHALL show on one page:
- yesterday's line for tomorrow, when the last Close the day was on an earlier local date and left a note, shown first and read-only
- the open Inbox count with "Process the Inbox"
- the overdue tasks
- today's tasks, where `f` toggles a task in or out of today's focus, up to three tasks

"Done for today" SHALL write the time of the daily check on the user's `review` entity. Today's focus SHALL be written there as the local date and the chosen task ids. Both sync to the user's devices only, are written offline, converge by last-writer-wins, are not content, are included in the export, and derive no activity event. A focus whose date is not today SHALL be shown as empty. Completed or deleted tasks SHALL drop out of the focus as it is shown, without a write. "Today" and "the local date" here are the user's logical today (OpenSpec `date-time-preferences`, "Logical today"), so a check finished or a focus chosen after midnight but before the day start belongs to the day being lived. The note needs no write to show or to stop showing: it is shown while the latest close is from an earlier day and disappears once the day is closed again.

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

### Requirement: Rhythm markers
A rhythm SHALL be due as follows:
- the weekly review, when its last finish is more than seven days ago or never
- the Monthly look, when it is more than 30 days ago or never
- the Daily check, when it was not done on the user's logical today (OpenSpec `date-time-preferences`, "Logical today")

Close the day is never due and carries no marker of its own. When the day was closed on the user's local date, the sidebar Review entry SHALL show "Day closed" in place of its "last review" text for the rest of that local day, unless a rhythm is due, in which case the due marker wins; the text alternative SHALL name both. The sidebar Review entry SHALL carry the weekly marker in every mode. In `companion` and `first` modes it SHALL also carry the monthly marker. In `first` mode it SHALL also carry the daily marker. Each marker SHALL have a text alternative naming the rhythm. In `first` mode, the first time the app is opened on a logical day on which the Daily check is not done, a toast SHALL offer to start it, at most once per logical day per device.

#### Scenario: Lists only
- **WHEN** a user in `lists` mode has never done a Daily check or Monthly look and finished the weekly review yesterday
- **THEN** the Review entry carries no marker

#### Scenario: Open Loops first in the morning
- **WHEN** a user in `first` mode opens the app on a new day
- **THEN** a toast offers "Start your daily check", and dismissing it means it does not return on that device that day

#### Scenario: Day closed in the evening
- **WHEN** no rhythm is due and the user closes the day at 18:42
- **THEN** the Review entry reads "Day closed" with the time in its text alternative until the local date changes, after which it shows the last review again

#### Scenario: Day closed while the weekly review is due
- **WHEN** the weekly review was finished nine days ago and the user closes the day
- **THEN** the Review entry keeps its "due" marker and its text alternative also says the day is closed

#### Scenario: Daily check done in the evening, app open after midnight
- **WHEN** a user in `first` mode with a day start of `04:00` finished the Daily check on Wednesday evening and uses the app at 00:30 on Thursday
- **THEN** the Review entry carries no daily marker and no toast is shown until 04:00 has passed

