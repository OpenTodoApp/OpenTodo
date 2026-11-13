# habits Specification

## Purpose
Lets a recurring task be tracked as a habit: its streak and month history are derived on the device from the occurrence records the series already writes, and a skip keeps the chain without counting as done.

## Requirements

### Requirement: Habit flag
A task SHALL have an additive boolean `habit`, default false. The detail panel SHALL offer it for an open task whose recurrence rule is a calendar rule (not `after completion`). The flag SHALL be settable offline, synced as an ordinary field operation and SHALL converge by last-writer-wins. A task whose rule is removed or made completion-relative SHALL keep the flag but show no habit statistics until it has a calendar rule again.

#### Scenario: Turn a recurring task into a habit offline
- **WHEN** the device is offline and the user turns on "Track as a habit" on a task with `every day`
- **THEN** the streak and month history appear at once on that device, and the flag reaches the user's other devices on the next sync

#### Scenario: Not offered without a schedule
- **WHEN** the user opens a task with `every 3 days after completion`, or a task without a rule
- **THEN** the habit switch is not offered, and a flag the task already carries changes nothing on screen

#### Scenario: Concurrent toggles
- **WHEN** device A turns the flag on and device B turns it off, both offline, and both sync
- **THEN** every device ends with the value written with the greater timestamp

### Requirement: Skipping a habit records a skipped occurrence
Skipping the current occurrence of a habit SHALL write that date's occurrence record (the same derived id a completion writes, `completed_at` set, `series_id` pointing at the series) with the additive boolean `skipped` true, and move the series on, in one batch. Completing a habit SHALL write the record with `skipped` false. Both SHALL work offline; because the record id is derived, devices acting on the same occurrence converge to one record.

#### Scenario: Skip today
- **WHEN** the user skips a habit with `every day` due 2026-10-14
- **THEN** the series is due 2026-10-15, the 14th shows as skipped in the habit's history, and nothing is added to Completed

#### Scenario: Skip on two devices
- **WHEN** two devices skip the same occurrence of a habit offline and sync
- **THEN** every device holds one skipped record for that date and the series is one step ahead, not two

#### Scenario: Completed on one device, skipped on another
- **WHEN** device A completes the 14th and device B skips the 14th, both offline, and both sync
- **THEN** every device holds one record for the 14th whose state (done or skipped) is the one written with the greater timestamp, and the streak is unbroken either way

#### Scenario: Non-habit skip is unchanged
- **WHEN** the user skips a recurring task that is not a habit
- **THEN** only its due date changes and no record is written

### Requirement: Skipped records are not completions
A skipped occurrence record SHALL NOT appear in Completed, SHALL NOT match `completed` filter queries and SHALL NOT count towards a rule's `for N times`. It SHALL be included in the JSON export and in the habit's history. It SHALL be excluded on every device and by the server's occurrence count, so the end of a series converges.

#### Scenario: Completed view
- **WHEN** a habit was skipped on the 13th and completed on the 14th
- **THEN** Completed lists the 14th only

#### Scenario: Count towards the end condition
- **WHEN** a habit with `every day for 3 times` is skipped once and completed twice
- **THEN** it is still open with a third completion to come, on every device and through the API

#### Scenario: Export
- **WHEN** the user downloads the JSON export
- **THEN** the skipped record is present as a task with `series_id`, `completed_at` and `skipped: true`

### Requirement: Streak derived from the schedule and the records
A habit's scheduled dates SHALL be the dates its calendar rule matches plus any date with an occurrence record. The current streak SHALL count consecutive scheduled dates with a record (done or skipped), walking back from the date before the current occurrence. The current occurrence SHALL be pending, never missed; an earlier scheduled date without a record ends the streak. The best streak is the longest such run. Both SHALL be computed on the device only. Where the computation compares with "today" (the occurrence is at risk once its date is before today; the month grid marks today), today SHALL be the user's logical today (OpenSpec `date-time-preferences`, "Logical today"). A record's date stays the occurrence's due date, whatever the clock said when it was written; for a record that carries `occurrence_date` (OpenSpec `recurring-tasks`, "Occurrence records") its date SHALL be that occurrence date, even when the record was moved to another day. An open record SHALL read as pending on its date until it is done or skipped, and as missed once its date is before the current occurrence and it is still open. A record done or skipped ahead of time SHALL count on its date once that date is before the current occurrence.

#### Scenario: Three days in a row
- **WHEN** a habit with `every day` has records for the 11th, 12th and 13th and is due on the 14th, not yet done
- **THEN** the streak is 3, shown without an "at risk" mark until the day is over

#### Scenario: Missed day breaks the chain
- **WHEN** the same habit has records for the 11th and 13th but none for the 12th
- **THEN** the streak is 1

#### Scenario: Skipped day keeps the chain
- **WHEN** the same habit has done records for the 11th and 13th and a skipped record for the 12th
- **THEN** the streak is 2, because the skipped day neither breaks nor extends it

#### Scenario: Weekly habit
- **WHEN** a habit with `every mon, wed, fri` has records for Monday and Wednesday and is due on Friday
- **THEN** the streak is 2 and Tuesday and Thursday are not counted as missed

#### Scenario: Same answer on every device
- **WHEN** two devices hold the same series and records
- **THEN** both show the same streak, since it is a function of the rule, the due date and the records alone

#### Scenario: Done after midnight with a day start
- **WHEN** the day start is `04:00`, a habit with `every day` is due on the 14th, and the user completes it at 01:30 on the 15th
- **THEN** the record is for the 14th, the series is due on the 15th, the 14th shows as done, the streak counts it, and the 15th is pending and not at risk until 04:00 has passed on the 16th

#### Scenario: Midnight default is unchanged
- **WHEN** the day start is `00:00`
- **THEN** "at risk" and the month grid's today are those of the calendar date, as before

#### Scenario: Moved occurrence counts on its own day
- **WHEN** a habit with `every mon, wed, fri` had Wednesday's occurrence moved to Thursday and completed there, and is now due Friday
- **THEN** the month grid shows Wednesday as done and Thursday as unscheduled, and the streak counts Wednesday

#### Scenario: Done ahead of time
- **WHEN** a habit with `every day` is due the 14th and the user completes the 15th's occurrence early
- **THEN** the 15th shows as done in the grid, the streak is unchanged until the 14th is done, and completing the 14th moves the series to the 16th

### Requirement: Month history
The detail panel of a habit SHALL show a grid of one month's days, starting with the current month, navigable to other months with buttons and the keyboard. Each scheduled day SHALL read as done, tiny, skipped, missed (scheduled before the current occurrence, no record), pending or upcoming; unscheduled days are blank. Colours SHALL come from the design tokens, states SHALL also differ by glyph, and each day's state SHALL be exposed to assistive technology. The grid is local. While Habits is on, a scheduled day before the current occurrence, in the grid or in the thread, SHALL open Done, Tiny, Skipped and Clear: Done, Tiny and Skipped SHALL write that date's occurrence record (the derived id, `completed_at`, `skipped` and `tiny` as chosen) without moving the series, and Clear SHALL tombstone it so the day reads as missed; each SHALL work offline with one Undo and converge like any occurrence record. A date before the series' first scheduled date or after the logical today SHALL not be editable.

#### Scenario: October at a glance
- **WHEN** a habit with `every weekday` was done on every weekday of October up to the 13th except the 6th, which was skipped, and the user opens it on the 14th
- **THEN** the grid marks 1, 2, 5, 7–9, 12 and 13 as done, the 6th as skipped, weekends blank, the 14th as pending and the later weekdays as upcoming

#### Scenario: Previous month offline
- **WHEN** the device is offline and the user moves to September
- **THEN** September renders from the records already on the device, with no request

#### Scenario: Screen reader
- **WHEN** a screen reader user moves through the grid
- **THEN** each day is announced with its date and state, such as "6 October, skipped"

#### Scenario: Fill in a forgotten day
- **WHEN** Read is due today and yesterday was missed because the user forgot to tick it, and they choose Done on yesterday
- **THEN** yesterday shows as done, the streak and kept count it, the series is still due today, and one Undo clears it

#### Scenario: Clear a wrong tick
- **WHEN** the user chooses Clear on a day that was marked done by mistake
- **THEN** the day reads as missed, it leaves Completed, and the record is a tombstone in the export

#### Scenario: Edited on two devices
- **WHEN** device A marks the 9th as done and device B marks it as skipped, both offline, and both sync
- **THEN** every device holds one record for the 9th in the state written with the greater timestamp

### Requirement: Habits in lists and the detail panel
A habit SHALL be an ordinary row in Upcoming, its project and saved views, with a streak chip next to the repeat indicator, and in Today as specified in "Habits strip in Today". While Habits is off, the chip SHALL not be shown. The detail panel SHALL show the habit switch, the current and best streak, the month history and the existing Skip control together under the repeat rule, all reachable with the keyboard; while Habits is on, it SHALL also show the measure and strength, the tiny version, the anchor, and Graduate. The Habits screen is the built-in view of habits; the `habit` filter keyword still lists habits.

#### Scenario: Streak chip
- **WHEN** Upcoming lists a habit with a streak of 12
- **THEN** its row shows the repeat indicator and a chip reading 12 with an accessible name "12-day streak"

#### Scenario: Habits view from a query
- **WHEN** the user saves the query `habit` as a view named "Habits"
- **THEN** the view lists every open habit, with its streak chip

#### Scenario: No chip while off
- **WHEN** Habits is off and a project lists a habit
- **THEN** its row shows the repeat indicator and no streak chip

### Requirement: Integrations complete a habit like any task
Completing a habit through the REST API, CalDAV or an assistant tool SHALL record a done occurrence and move the series exactly as for any recurring task, without knowing about habits. The REST API SHALL accept and return `habit` as a boolean task field; assistant tool results SHALL carry `habit: true` for a habit. No integration SHALL skip a habit.

#### Scenario: Completed through the API
- **WHEN** a script patches a habit's `completed_at` through `/api/v1/tasks/{id}`
- **THEN** the day is recorded as done, the series moves on, and the device's streak counts it after sync

#### Scenario: Invalid flag value
- **WHEN** a client submits `"habit": "yes"` through the API or the sync endpoint
- **THEN** the write is rejected as invalid and the task is unchanged

### Requirement: Habit history across a split
For a habit whose series was split (OpenSpec `recurring-tasks`, "Pieces of one lineage"), the scheduled dates SHALL be, for each piece, the dates its rule produces within the piece's range, plus every date with a record of any piece of the lineage. The current and best streaks and the month history SHALL be computed over the lineage as over one series, on the device only, so every device with the same rows shows the same values. A piece SHALL inherit the habit flag at the split.

#### Scenario: Gym days change mid-month
- **WHEN** a habit `every mon, wed, fri` has done records for every scheduled day up to Monday the 19th, is split from Tuesday the 20th to `every tue, thu`, and the 20th is done
- **THEN** the streak counts the days before and after the split as one chain, and the month grid shows Mondays, Wednesdays and Fridays as scheduled up to the 19th and Tuesdays and Thursdays from the 20th

#### Scenario: Same streak on two devices
- **WHEN** two devices hold the same lineage and records
- **THEN** both show the same current and best streak

### Requirement: Habits switch
Each user SHALL have the preference `habits`, an additive user_prefs field: empty means not decided, `on` means on, `off` means off, and a client SHALL keep any other value unchanged and read it as not decided. It SHALL be written as an operation, synced to that user's devices only, editable offline and converging by last-writer-wins. Settings → Account → How you work SHALL show **Habits** as a switch. A user whose preference is not decided and who holds at least one open habit SHALL be treated as on without anything being written.

While not decided, the app SHALL show no Habits screen, strip or **New habit**, and SHALL keep the **Track as a habit** switch in the repeat editor and the switch in How you work. Turning on **Track as a habit**, or the switch, SHALL write `on`, and the app SHALL say once, in place, that Habits is on, where to find it and where to turn it off.

While off, the app SHALL show no habit control anywhere: no Habits screen or destination, no Today strip, no **New habit**, no **Make it a habit**, no **Track as a habit**, no streak chip and no habit section in the task page. A habit SHALL then read as a plain repeating task. Turning the switch off SHALL write no operation on any task; completing or skipping a habit while off SHALL keep writing its occurrence records as before, so turning it on again shows an unbroken history. Habits SHALL stay in the export, REST, the CLI and MCP whatever the switch says.

#### Scenario: A new account sees nothing
- **WHEN** a user who has never had a habit opens Today, the sidebar and a task's menu
- **THEN** nothing about habits is shown, and the repeat editor of a task with `every day` offers **Track as a habit**

#### Scenario: Turned on by using it
- **WHEN** that user turns on **Track as a habit** on "Run" with `every day`
- **THEN** `habits` becomes `on`, a single message says Habits is on with a link to the Habits screen and to How you work, and the Today strip appears

#### Scenario: An existing habit keeps everything
- **WHEN** a user upgrades with one habit and an empty preference
- **THEN** they see the Habits screen, the strip and the chip, and no operation is written

#### Scenario: Off means off
- **WHEN** a user with three habits turns the switch off
- **THEN** no screen, strip, chip, menu item or switch about habits is shown anywhere, the three tasks show as repeating tasks, and no operation is written on them

#### Scenario: History keeps going while off
- **WHEN** Habits is off, the user completes "Run" on three days, and turns Habits on again
- **THEN** the three days show as done in its thread and grid, and the streak counts them

#### Scenario: Switched on two offline devices
- **WHEN** device A turns Habits off and device B turns it on, both offline, and both sync
- **THEN** both show the state written with the greater timestamp

### Requirement: Habits screen
While Habits is on, the app SHALL offer a **Habits** screen as a destination of the sidebar's More group, which the sidebar order setting can move among the primary destinations, and through `g` then `Shift+H` and the command palette. It SHALL list every open habit the user can see, grouped by part of the day (Morning, Afternoon, This Evening, then Any time), each as one row with the habit's colour, title, anchor, a thread of the last seven days, its measure and a check button for the current occurrence. Graduated habits SHALL follow in a folded **Graduated** group. The screen SHALL render from the device's rows only, offline too, and SHALL be reachable and operable with the keyboard alone. With no habit, it SHALL show three starters (such as Drink water, Read 10 minutes, Walk after lunch) that each open **New habit** filled in, and no illustration.

#### Scenario: A morning at a glance
- **WHEN** the user has "Run" (Morning, `every mon, wed, fri`), "Read" (This Evening, `every day`) and a graduated "Floss", and opens Habits on a Wednesday
- **THEN** Morning lists Run with Monday done and Wednesday as today, This Evening lists Read with seven days, and a folded Graduated group lists Floss

#### Scenario: Check in from the screen
- **WHEN** the user presses the check button of Run, or Space on its focused row
- **THEN** the current occurrence is completed exactly as completing the task would, today's day fills in the thread, and one Undo reverts it

#### Scenario: Offline
- **WHEN** the device is offline and the user opens Habits and checks in Read
- **THEN** the screen renders from local rows, the day fills in at once, and the record reaches the other devices on the next sync

#### Scenario: Not while off
- **WHEN** Habits is off and the user opens the Habits address or presses `g` then `Shift+H`
- **THEN** the shortcut does nothing, More has no Habits entry, and the address shows that Habits is off with a link to How you work

### Requirement: Habits strip in Today
While Habits is on, Today SHALL show a **Habits** strip above its first task group, listing each habit whose current occurrence is due on the logical today or earlier and is not done, as a compact chip with its colour, title and a check control, in part-of-the-day order; a habit done today SHALL stay as a filled chip until the day ends. Those habits SHALL then not be listed among Today's task rows, and SHALL not count toward the Today limit, as before. The strip SHALL take one line, wrapping into at most two on a narrow screen and folding the rest into a "+N" chip that opens the Habits screen. The heading SHALL fold the strip, remembered per device. While Habits is not decided or off, habits SHALL be ordinary Today rows, as before.

#### Scenario: No habit shown twice
- **WHEN** Habits is on and Read is due today
- **THEN** Read is a chip in the strip and not a row among Today's tasks

#### Scenario: A weekly habit on another day
- **WHEN** Run repeats `every mon, wed, fri` and today is Tuesday
- **THEN** Run is not in the strip

#### Scenario: Narrow screen
- **WHEN** nine habits are due today on a 360 px screen
- **THEN** the strip takes at most two lines and ends with a "+N" chip that opens Habits

### Requirement: New habit and Make it a habit
While Habits is on, **New habit** on the Habits screen and in the command palette, and **Make it a habit** in a task's menu and its page, SHALL open one form with the title, how often (Every day, Days of the week, or any calendar rule typed as in the repeat editor), the tiny version, the anchor and the part of the day, and create or change the task in one batch of operations with one Undo. A new habit SHALL have no project unless one is chosen. **Make it a habit** on a task with a calendar rule SHALL keep that rule; on a task without one it SHALL propose `every day`; on a task with a completion-relative rule it SHALL ask for a calendar rule first. Everything SHALL work offline and converge as ordinary field operations.

#### Scenario: Create in one step
- **WHEN** the user chooses New habit, types "Read", picks Every day, the tiny version "One page", the anchor "After dinner" and This Evening, and confirms
- **THEN** one task "Read" with `every day`, `habit` true, that tiny version, anchor and part of the day exists, and it is listed under This Evening

#### Scenario: From a one-off task
- **WHEN** the user chooses Make it a habit on "Stretch", which has no rule
- **THEN** the form proposes Every day, and confirming sets the rule and the flag in one Undo

#### Scenario: From a completion-relative task
- **WHEN** the user chooses Make it a habit on "Water the plants" with `every 3 days after completion`
- **THEN** the form asks for a calendar rule and writes nothing until one is chosen

### Requirement: Forgiving measure and strength
For a habit, the device SHALL compute, from the series, its records and the logical today only: **kept**, the number of the last seven scheduled dates before the current occurrence that have a done record (tiny included), shown as "N of M"; **strength**, from 0 to 100, an exponential moving average over the scheduled dates in which a done or tiny day adds, a skipped day leaves the value unchanged and a missed day lowers it, so that one miss after a long run lowers it by a few points only; **at risk**, true when the two latest scheduled dates before the current occurrence are both missed; and **back on track**, true when the latest scheduled date is done after a run of at least two missed dates. The current and best streaks SHALL stay as specified. The Habits screen and the strip SHALL show kept, the habit's page SHALL show strength, kept and both streaks; no screen SHALL use a danger colour for a missed day. Every device with the same rows SHALL show the same values, and test vectors SHALL pin them.

#### Scenario: One miss barely moves strength
- **WHEN** a habit with `every day` was done for the last 60 days except yesterday
- **THEN** kept reads "6 of 7", strength drops by less than ten points from the day before, and the habit is not at risk

#### Scenario: Two misses in a row
- **WHEN** the same habit is missed on two scheduled dates in a row
- **THEN** it is at risk, and its thread thins between those dates without a danger colour

#### Scenario: Back on track
- **WHEN** it is then done on the next scheduled date
- **THEN** the row says "Back on track" and at risk is false

#### Scenario: Same numbers everywhere
- **WHEN** two devices hold the same series and records
- **THEN** both show the same kept, strength and streaks

### Requirement: Tiny version and anchor
A task SHALL have two additive text fields, `habit_tiny` and `habit_anchor`, empty by default, user-written content (encrypted on an end-to-end encrypted account), editable offline and converging by last-writer-wins. An occurrence record SHALL have an additive boolean `tiny`, default false. Logging the tiny version (the check button's menu, a long press, or `Shift+Space` on a focused habit) SHALL complete the occurrence exactly as completing it does and set `tiny` true in the same batch; a tiny day SHALL count as done for kept, strength and streaks and show half filled. The anchor SHALL show under the habit's title on the Habits screen and its page. A reminder of a habit with a tiny version SHALL name it ("Read: one page is enough").

#### Scenario: A tiny day counts
- **WHEN** the user logs the tiny version of Read today
- **THEN** today shows half filled, kept and the streak count it, and Completed lists it like any completion

#### Scenario: Tiny on one device, full on another
- **WHEN** device A logs today's Read as tiny and device B completes it, both offline, and both sync
- **THEN** every device holds one record for today, done, whose `tiny` value is the one written with the greater timestamp

#### Scenario: Reminder text
- **WHEN** a reminder fires for Read, whose tiny version is "One page"
- **THEN** the notification reads "Read" with "One page is enough" as its body

### Requirement: Graduate a habit
A task SHALL have the additive field `habit_graduated_at`, a timestamp or null, converging by last-writer-wins. **Graduate** on a habit's page SHALL set it, offline, with Undo; while it is set the habit SHALL be in no list, view, strip, calendar projection, reminder or Today limit, keep every record, and appear only in the Habits screen's Graduated group with how long it was kept ("Kept for 94 days"). **Resume** SHALL clear it, and the series SHALL continue from its next scheduled date on or after the logical today, writing no record for the days in between. Graduation SHALL not complete or delete the task.

#### Scenario: Floss has stuck
- **WHEN** the user graduates Floss after 94 kept days
- **THEN** Floss leaves Today, Upcoming, the calendar and its project's list, fires no reminder, and the Graduated group shows "Kept for 94 days"

#### Scenario: Resume after a month
- **WHEN** the user resumes Floss 30 days later
- **THEN** Floss is due today, the 30 days show as unscheduled rather than missed, and the old history is still there

#### Scenario: Graduated offline
- **WHEN** the device is offline and the user graduates Floss
- **THEN** it leaves every list at once, and the other devices follow on the next sync

### Requirement: Habit visual language
Each habit SHALL show one of the 12 palette hues: the hue of its project when it has one, otherwise one derived from its id, so every device shows the same hue. The thread SHALL draw each scheduled day of the last seven as a mark (filled for done, half filled for tiny, a dash for skipped, empty for missed, a ring for today) joined by a solid line between consecutive kept days, a dotted line across a skip and no line across a miss; unscheduled days SHALL be blank. Marks SHALL differ by shape as well as colour, each day SHALL be announced with its date and state, every colour SHALL come from the design tokens and pass the contrast checks in every built-in theme, light and dark, at 360 px. Checking in SHALL play the completion moment (the ring closes, the mark fills, the line reaches today, the number changes) within the existing 400 ms motion step, with the haptic tick where available, and reduced motion SHALL show the end state at once. There SHALL be no confetti, badges, points or emoji.

#### Scenario: A week with a skip and a miss
- **WHEN** Read was done Monday and Tuesday, skipped Wednesday, missed Thursday and done Friday, and today is Saturday
- **THEN** Monday and Tuesday are filled and joined, a dotted line crosses Wednesday's dash, Thursday is an empty mark with no line on either side, Friday is filled, and Saturday is a ring

#### Scenario: Screen reader
- **WHEN** a screen reader user moves through Read's thread
- **THEN** each day is announced with its date and state, such as "Wednesday 11 November, skipped"

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion and the user checks in
- **THEN** the filled mark, the line and the new number appear without animation
