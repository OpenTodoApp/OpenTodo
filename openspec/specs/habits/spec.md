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
A habit SHALL be an ordinary row in Upcoming, its project and saved views, with a streak chip next to the repeat indicator, and in Today as specified in "Habits strip in Today". While Habits is off, the chip SHALL not be shown. While Habits is not on, the detail panel SHALL show the habit switch, the current and best streak, the month history and the existing Skip control together under the repeat rule, all reachable with the keyboard; while Habits is on, a habit series SHALL open its habit page instead (see "Habit page"), and the task page reached through Open as a task SHALL show the same habit section with the measure and strength, the tiny version, the anchor and Graduate. The Habits screen is the built-in view of habits; the `habit` filter keyword still lists habits.

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
Completing a habit through the REST API, CalDAV or an assistant tool SHALL record a done occurrence and move the series exactly as for any recurring task, without knowing about habits. The REST API SHALL accept and return `habit`, `habit_tiny` and `habit_anchor` as task fields; assistant tool results SHALL carry `habit: true` for a habit. Skipping, logging the tiny version and editing a past day SHALL be possible through the habits route, the CLI, MCP's `log_habit` and routines, always as the app does them; CalDAV SHALL only complete.

#### Scenario: Completed through the API
- **WHEN** a script patches a habit's `completed_at` through `/api/v1/tasks/{id}`
- **THEN** the day is recorded as done, the series moves on, and the device's streak counts it after sync

#### Scenario: Invalid flag value
- **WHEN** a client submits `"habit": "yes"` through the API or the sync endpoint
- **THEN** the write is rejected as invalid and the task is unchanged

#### Scenario: Skip through the API
- **WHEN** a script posts `{"state": "skipped"}` to the log route of Read
- **THEN** today's record is skipped, the series moves on, and the streak is unbroken

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
While Habits is on, the app SHALL offer a **Habits** screen as a destination of the sidebar's More group, which the sidebar order setting can move among the primary destinations, and through `g` then `Shift+H` and the command palette. It SHALL list every open habit the user can see, grouped by part of the day (Morning, Afternoon, This Evening, then Any time), each as one row with the habit's colour, title, anchor, a thread of the last seven days, its measure and a check button for the current occurrence. A row SHALL keep the title on one line, cut with an ellipsis when it does not fit, with the full title in the tooltip and the accessible name; below 640 px the thread SHALL take a second line under the title while the measure and the button stay on the first. Every row SHALL have a check button: for a habit whose current occurrence is later than today, it SHALL check in that occurrence early, exactly as completing the task does, and its accessible name SHALL name the date. The title SHALL open the habit page. Graduated habits SHALL follow in a folded **Graduated** group. The screen SHALL render from the device's rows only, offline too, and SHALL be reachable and operable with the keyboard alone. With no habit, it SHALL show three starters (such as Drink water, Read 10 minutes, Walk after lunch) that each open **New habit** filled in, and no illustration.

#### Scenario: A morning at a glance
- **WHEN** the user has "Run" (Morning, `every mon, wed, fri`), "Read" (This Evening, `every day`) and a graduated "Floss", and opens Habits on a Wednesday
- **THEN** Morning lists Run with Monday done and Wednesday as today, This Evening lists Read with seven days, and a folded Graduated group lists Floss

#### Scenario: Check in from the screen
- **WHEN** the user presses the check button of Run, or Space on its focused row
- **THEN** the current occurrence is completed exactly as completing the task would, today's day fills in the thread, and one Undo reverts it

#### Scenario: A long title
- **WHEN** a habit is titled "Practise the Bach cello suite in G major, first movement" on a 375 px screen
- **THEN** its row shows one line of title ending in an ellipsis, the measure and the check button beside it, and hovering or focusing the title shows the full title

#### Scenario: Not due today
- **WHEN** Run repeats `every mon, wed, fri` and today is Tuesday
- **THEN** Run's row has a check button named "Check in Run early (Wednesday 12 November)"

#### Scenario: Offline
- **WHEN** the device is offline and the user opens Habits and checks in Read
- **THEN** the screen renders from local rows, the day fills in at once, and the record reaches the other devices on the next sync

#### Scenario: Not while off
- **WHEN** Habits is off and the user opens the Habits address or presses `g` then `Shift+H`
- **THEN** the shortcut does nothing, More has no Habits entry, and the address shows that Habits is off with a link to How you work

### Requirement: Habits strip in Today
While Habits is on, Today SHALL show its habits as one quiet line above its first task group, without a group heading, count or fold: a "Habits" link that opens the Habits screen, then each habit whose current occurrence is due on the logical today or earlier and is not done, as a small ring in its hue followed by its title, in part-of-the-day order; a habit done today SHALL stay with a filled ring until the day ends. The ring SHALL check in the habit with one Undo; the title SHALL open the habit page. The line SHALL never take more than one line at any width; the habits that do not fit SHALL fold into a "+N" link that opens the Habits screen. Those habits SHALL then not be listed among Today's task rows, and SHALL not count toward the Today limit, as before. When no habit is due or done today, the line SHALL not be shown. While Habits is not decided or off, habits SHALL be ordinary Today rows, as before.

#### Scenario: No habit shown twice
- **WHEN** Habits is on and Read is due today
- **THEN** Read is in Today's habits line and not a row among Today's tasks

#### Scenario: A weekly habit on another day
- **WHEN** Run repeats `every mon, wed, fri` and today is Tuesday
- **THEN** Run is not in the line

#### Scenario: Through to Habits
- **WHEN** the user presses "Habits" at the start of the line
- **THEN** the Habits screen opens

#### Scenario: Narrow screen
- **WHEN** nine habits are due today on a 360 px screen
- **THEN** the line stays one line and ends with a "+N" link that opens Habits

### Requirement: New habit and Make it a habit
While Habits is on, **New habit** on the Habits screen and in the command palette, and **Make it a habit** in a task's menu and its page, and **Edit** on a habit's page SHALL open one form with the title, how often (Every day, Days of the week, or any calendar rule typed as in the repeat editor), the tiny version, the anchor, the part of the day and the colour, and create or change the task in one batch of operations with one Undo. The Tiny version and After labels SHALL each have a "?" control that shows a one-line explanation in a tooltip on hover and on keyboard focus. The form SHALL show no other task field. A new habit SHALL have no project unless one is chosen. **Make it a habit** on a task with a calendar rule SHALL keep that rule; on a task without one it SHALL propose `every day`; a task with a rule and no due date SHALL get its first date from the rule; on a task with a completion-relative rule it SHALL ask for a calendar rule first. Everything SHALL work offline and converge as ordinary field operations.

#### Scenario: Create in one step
- **WHEN** the user chooses New habit, types "Read", picks Every day, the tiny version "One page", the anchor "After dinner" and This Evening, and confirms
- **THEN** one task "Read" with `every day`, `habit` true, that tiny version, anchor and part of the day exists, and it is listed under This Evening

#### Scenario: From a one-off task
- **WHEN** the user chooses Make it a habit on "Stretch", which has no rule
- **THEN** the form proposes Every day, and confirming sets the rule and the flag in one Undo

#### Scenario: What tiny means
- **WHEN** the user focuses the "?" after Tiny version
- **THEN** a tooltip reads "The two-minute version that still counts on a bad day"

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
Each habit SHALL show one of the 12 palette hues: its own colour (`habit_color`, an additive task field, a palette colour or empty, not content, converging by last-writer-wins) when set, otherwise the hue of its project when it has one, otherwise one derived from its id, so every device shows the same hue. The thread SHALL draw each scheduled day of the last seven as a mark (filled for done, half filled for tiny, a dash for skipped, empty for missed, a ring for today) joined by a solid line between consecutive kept days, a dotted line across a skip and no line across a miss; unscheduled days SHALL be blank. Marks SHALL differ by shape as well as colour, each day SHALL be announced with its date and state, every colour SHALL come from the design tokens and pass the contrast checks in every built-in theme, light and dark, at 360 px. Checking in SHALL play the completion moment (the ring closes, the mark fills, the line reaches today, the number changes) within the existing 400 ms motion step, with the haptic tick where available, and reduced motion SHALL show the end state at once. There SHALL be no confetti, badges, points or emoji.

#### Scenario: Own colour
- **WHEN** the user picks green for Read, which is in a blue project
- **THEN** Read shows green on the Habits screen, in Today and on its page on every device, and Automatic gives it blue again

#### Scenario: A week with a skip and a miss
- **WHEN** Read was done Monday and Tuesday, skipped Wednesday, missed Thursday and done Friday, and today is Saturday
- **THEN** Monday and Tuesday are filled and joined, a dotted line crosses Wednesday's dash, Thursday is an empty mark with no line on either side, Friday is filled, and Saturday is a ring

#### Scenario: Screen reader
- **WHEN** a screen reader user moves through Read's thread
- **THEN** each day is announced with its date and state, such as "Wednesday 11 November, skipped"

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion and the user checks in
- **THEN** the filled mark, the line and the new number appear without animation

### Requirement: Habit page
While Habits is on, a habit SHALL open a page of its own at `/habits/<id>` from its row, Today's strip and links, and wherever its task page or panel would open for an open habit series. The page SHALL show a way back to Habits, the title, one line with how often, the part of the day and the anchor, the tiny version, strength, kept and both streaks, a Check in button for the current occurrence, the month history with editable past days, and a menu with Edit, Graduate or Resume, Open as a task, Stop tracking as a habit and Delete. It SHALL show no task-only fields (sections, deadlines, estimates, dependencies, subtasks) and no task-series wording such as the past-occurrences scope note. **Open as a task** SHALL show the task's ordinary page. An occurrence record SHALL still open as a task. The page SHALL render from the device's rows only, offline too, and be operable with the keyboard alone.

#### Scenario: Open a habit
- **WHEN** the user opens Read from the Habits screen
- **THEN** the address is `/habits/<id>` and the page shows "Every day · This Evening · After dinner", the tiny version, its numbers, Check in and the month history, and no section, deadline or estimate field

#### Scenario: From a link or search
- **WHEN** the user opens Read from search or a link to its task
- **THEN** the habit page is shown, and Open as a task in its menu shows the full task page

#### Scenario: Edit
- **WHEN** the user chooses Edit, changes the title to "Read a book" and saves
- **THEN** the series has the new title in one batch with one Undo, and no question about past occurrences is asked

### Requirement: The habit's note
A habit's own note SHALL be its task note, shown first on the habit's page while Habits is on, written, linked, searched and synced exactly as any task note, offline included. An occurrence record of a habit SHALL not copy the habit's note when it is written, on any device or on the server, so a day's note starts empty; records written before this change keep what they hold.

#### Scenario: Why I run
- **WHEN** the user writes "Training for the 10k in March" in Run's note
- **THEN** it shows at the top of Run's page and in note search, and no occurrence record of Run holds that text

#### Scenario: Completed on the server
- **WHEN** a script completes Run through the API
- **THEN** the record written by the server has an empty note

### Requirement: Check-in notes
While Habits is on, checking in a habit from the Habits screen, the Today strip or its page SHALL open a single "How did it go?" line in place, without moving focus from the list for keyboard users until they press Tab; typing and pressing Enter SHALL save the text as the note of that day's occurrence record, and Escape, or leaving it, SHALL write nothing. A past day in the thread or the month grid SHALL offer **Note** to add or change that day's note; for a day without a record it SHALL first ask for its state. A check-in note SHALL be ordinary task note content: formatted, able to hold `[[` links, found by note search with the habit's title and the date, encrypted on an end-to-end encrypted account, editable offline and converging as task notes do. Logging a check-in through the API, CLI or MCP SHALL write no note unless one is given.

#### Scenario: A line after the run
- **WHEN** the user checks in Run and types "5k, knee a bit sore" and presses Enter
- **THEN** today's record of Run holds that note, the day shows a note mark, and one Undo removes the note and keeps the check-in

#### Scenario: Nothing to say
- **WHEN** the user checks in Read and presses Escape on the line
- **THEN** only the check-in is written

#### Scenario: A note for yesterday
- **WHEN** the user chooses Note on yesterday's done day of Run and writes "Easy pace"
- **THEN** yesterday's record holds the note and the streak is unchanged

#### Scenario: Two devices
- **WHEN** two offline devices each add a note to the same day's record and both sync
- **THEN** every device shows the same note, merged as concurrent edits of one task note merge

### Requirement: Check-ins on the habit's page
A habit's page SHALL list its records that have a note under **Check-ins**, newest first, each with its date, its state (done, tiny or skipped) and the note, paged by 20, rendered from the device's rows, offline too. Each entry SHALL open that day's note for editing. Days with a note SHALL show a small mark in the thread and the month grid, announced as part of the day ("Monday 9 November, done, with a note").

#### Scenario: A month of runs
- **WHEN** Run has 12 records with a note in October
- **THEN** the page lists them newest first and the grid marks those 12 days

#### Scenario: Screen reader
- **WHEN** a screen reader user reaches a day with a note in the grid
- **THEN** it is announced with its date, its state and "with a note"

### Requirement: Habit numbers on the server
The server SHALL compute a habit's scheduled dates, day states, kept, strength, streaks, at risk and back on track with the same rules as the devices, from the series, its lineage and its records and the user's logical today (their day start and time zone), pinned by the same test vectors, so the server, every device and every tool give identical numbers for the same rows. It SHALL need no content, so it works on end-to-end encrypted accounts. Numbers SHALL reflect only synced rows, and every answer that carries them SHALL carry the server time.

#### Scenario: Same numbers
- **WHEN** the shared habit vectors are run by the Go and the TypeScript code
- **THEN** every vector gives the same states and numbers on both sides

#### Scenario: Not yet synced
- **WHEN** a device checked in Run offline and has not synced
- **THEN** the server's numbers do not include that day until the device syncs

### Requirement: Habits route
`GET /api/v1/habits` SHALL list the user's open habits (graduated ones with `?graduated=true`) with the fields of `list_habits`; `GET /api/v1/habits/{id}` SHALL return one habit with its days for `from` and `to` as `get_habit` does. `POST /api/v1/habits/{id}/log` with `{date?, state, note?}` SHALL behave as `log_habit` and answer the updated habit, through the op log, so scripts and shortcuts can log a habit without knowing about occurrence records. The routes SHALL require a signed-in session or a token: `read` tokens only on `GET`, `agent` tokens only while assistant writes are allowed. They SHALL answer 401 without credentials, 403 `insufficient_scope` for a `read` token on `POST`, 404 `not_found` for an id the user cannot see, 400 `not_a_habit` for a task that is not a habit, and 400 `invalid_input` for a missing or unknown state, a date after today or a date before the lineage's first scheduled date.

#### Scenario: A phone shortcut logs water
- **WHEN** a shortcut posts `{"state": "done"}` to the log route of Water with a `full` token
- **THEN** today's record is done, the series moves on, and the answer carries the new kept and strength

#### Scenario: Not signed in
- **WHEN** the log route is called without a session or token
- **THEN** it answers 401 and nothing is written

#### Scenario: Read token writes
- **WHEN** a `read` token posts to the log route
- **THEN** it answers 403 `insufficient_scope` and nothing is written

#### Scenario: Bad state
- **WHEN** a client posts `{"state": "maybe"}`
- **THEN** it answers 400 `invalid_input` naming `state`, and nothing is written

### Requirement: Habits in the CLI
`ot habits` SHALL list habits with kept and strength, `ot habits show <id|title>` SHALL print one habit's last 31 days, and `ot habits log <id|title> [--date D] [--tiny|--skip|--clear] [--note text]` SHALL log through the habits route, each with `--json`.

#### Scenario: Log from the terminal
- **WHEN** the user runs `ot habits log Run --note "5k"`
- **THEN** today's Run is done with that note and the command prints the new kept and strength

### Requirement: Target habits
A task SHALL have the additive fields `habit_target` (a whole number, 0 for none, at most 31) and `habit_period` (`""`, `week` or `month`), converging by last-writer-wins and editable offline. A habit with a target and a period SHALL have the rule `every day`; it SHALL be offered (in the Today strip and as pending on the Habits screen) on every day of a period until the period holds `habit_target` done records (tiny included), and then rest until the next period begins. A period SHALL begin on the user's first day of the week, or on the first of the month, in their logical today. Days of a target habit SHALL never read as missed. Kept SHALL read "N of T this week" (or "this month"); a period is **met** when it holds at least the target. Strength SHALL be computed over periods with each period adding the share of the target it holds, at most one; the current and best streaks SHALL count consecutive met periods, the current period not counted until met or over. **At risk** SHALL be true when the days left in the current period are fewer than the done records it still needs, or when the two latest periods were both not met. Skipping SHALL not be offered for a target habit.

#### Scenario: Gym three times a week
- **WHEN** Gym has a target of 3 per week, the week starts on Monday, and the user checked in on Monday and Thursday
- **THEN** on Friday Gym is offered and reads "2 of 3 this week", Tuesday and Wednesday read as rest days, not missed

#### Scenario: Target met
- **WHEN** the user checks in Gym on Friday
- **THEN** Gym reads "3 of 3 this week", leaves the Today strip until Monday, and the week counts toward the streak once it is over

#### Scenario: Can't make it any more
- **WHEN** it is Sunday and Gym holds one check-in this week
- **THEN** Gym is at risk, shown without a danger colour

#### Scenario: Same week on two devices
- **WHEN** two offline devices each check in Gym on a different day and both sync
- **THEN** every device reads "2 of 3 this week"

### Requirement: Amount habits
A task SHALL have the additive fields `habit_amount` (a positive number, 0 for none), `habit_unit` (text, user-written content) and `habit_step` (a positive number, 1 by default), converging by last-writer-wins and editable offline. For an amount habit, the check button SHALL add `habit_step` to the day's amount and show "N of A unit"; a day whose amount reaches `habit_amount` SHALL be done and complete the occurrence as a check-in does, a day with a positive amount below it SHALL be a **partial** day that counts as tiny for kept, strength and streaks and shows the share filled, and a day with none SHALL follow the habit's schedule as before. A menu on the button SHALL subtract a step or set an exact amount. The day's amount SHALL be the sum of the tallies of every device (see "Exact amounts across devices"). Amounts SHALL be editable on past days like any state.

#### Scenario: Eight glasses
- **WHEN** Water has an amount of 8 glasses and the user presses its check button five times today
- **THEN** it reads "5 of 8 glasses", today shows five eighths filled and counts as kept, and Completed does not list it yet

#### Scenario: Reaching the amount
- **WHEN** the user presses it three more times
- **THEN** it reads "8 of 8 glasses", today is done, and the occurrence is completed as any check-in

#### Scenario: Fixing a mistake
- **WHEN** the user chooses Subtract on "8 of 8 glasses"
- **THEN** it reads "7 of 8 glasses", today is partial again, and the completion is undone

### Requirement: Exact amounts across devices
Each device SHALL record its additions to a day as a `habit_tally` row naming the habit series and the day, with a name-based id derived from the series, the day and the device id, holding its own count, so that devices never write each other's rows; the day's amount SHALL be the sum of the day's live tallies. A tally SHALL follow its habit's sharing, export, trash and end-to-end encryption rules (the count is not content). Setting an exact amount on a device SHALL set its own tally to the exact amount minus the other devices' counts, never below zero. The server, the API and MCP SHALL report the sum.

#### Scenario: Two phones, offline
- **WHEN** phone A adds two glasses and phone B adds three glasses to today's Water, both offline, and both sync
- **THEN** every device and the server read "5 of 8 glasses"

#### Scenario: Export
- **WHEN** the user downloads the JSON export
- **THEN** each day's tallies are present with their series, day, device and count

### Requirement: Targets and amounts in tools and routes
`list_habits`, `get_habit`, `GET /api/v1/habits` and `GET /api/v1/habits/{id}` SHALL carry `target`, `period`, `amount`, `unit` and, per day, the day's amount; `log_habit` and `POST /api/v1/habits/{id}/log` SHALL accept `amount` (added as the calling client's own tally, or `set_amount` for an exact value) for an amount habit and answer 400 `invalid_input` naming `amount` for a habit without one or a negative value. The server's numbers SHALL include periods and partial days with the same vectors as the devices. `create_tasks`, `update_tasks` and the New habit form SHALL accept a target with its period, and an amount with its unit and step.

#### Scenario: Log water from a shortcut
- **WHEN** a shortcut posts `{"amount": 1}` to Water's log route twice
- **THEN** today reads "2 of 8 glasses" on the server and on every device after sync

#### Scenario: Amount on a plain habit
- **WHEN** a client posts `{"amount": 1}` to the log route of Read, which has no amount
- **THEN** it answers 400 `invalid_input` naming `amount`, and nothing is written

#### Scenario: Not signed in
- **WHEN** the log route is called with an amount and no credentials
- **THEN** it answers 401 and nothing is written

### Requirement: Targets and amounts on screen
The New habit form's How often SHALL offer "Times per week" and "Times per month" with the number, and an **Amount** choice with the number, the unit and the step. The thread of a target habit SHALL show the current week (or month) as one bar divided into the target's parts, filled for done check-ins, and earlier periods as met or not met; the thread of an amount habit SHALL fill each day by its share. Both SHALL use the visual language of "Habit visual language", differ by shape as well as colour, and announce their state ("This week, 2 of 3", "Today, 5 of 8 glasses").

#### Scenario: Read a target bar
- **WHEN** a screen reader user reaches Gym's thread after two check-ins this week
- **THEN** it is announced as "This week, 2 of 3", and the bar shows two of three parts filled

### Requirement: Check-in controls are visible by touch
On a device whose main pointer is coarse, the control of a habit's row that opens the other ways to check in, and the control of a check-in on the habit's page that edits its note, SHALL be visible without a hover or a focus. With a fine pointer they SHALL appear on hover and on focus, as before. What they do does not change.

#### Scenario: The menu of a habit's row on a phone
- **WHEN** the Habits screen is open on a touch phone
- **THEN** each row that offers other ways to check in shows the control that opens them

#### Scenario: A mouse
- **WHEN** the same screen is open with a mouse and no row is hovered or focused
- **THEN** the control is not drawn

### Requirement: Habits on a phone
While Habits is on and the phone screens are on below 768 px, the Habits screen SHALL be drawn for the phone: the phone header with **New habit** in its bar and the day's progress as its lead line; a strip of the seven days ending on the logical today, today chosen; then the habits grouped by part of the day, each as one row with a ring of at least 44 px in the habit's hue, the title on up to two lines, one line with the anchor and the measure, and the last seven days as small read-only marks. A tap on the ring SHALL act on the chosen day; a hold on the row SHALL open the row's actions as a sheet; a tap on the title SHALL open the habit page. Choosing an earlier day SHALL list only the habits with that day in their history, draw each ring with that day's state, and let a tap set it: a missed, skipped or rest day becomes done, a done or tiny day is cleared, and an amount habit opens Set amount for that day. Each action SHALL be one batch with one Undo, SHALL work offline, and SHALL converge as the same action does on the desktop screen. With the switch off or from 768 px the screen SHALL be the desktop screen.

#### Scenario: Check in with a thumb
- **WHEN** the phone screens are on at 390 px and the person taps the ring of Read
- **THEN** today's occurrence of Read is completed, the ring fills, and one Undo reverts it

#### Scenario: Fix yesterday
- **WHEN** the person chooses yesterday in the day strip, where Stretch was missed, and taps Stretch's ring
- **THEN** yesterday's Stretch is done, the series does not move, and the day strip's ring for yesterday shows one more kept

#### Scenario: A hold
- **WHEN** the person holds Read's row
- **THEN** a sheet offers Check in, the tiny version, Skip this day, Open and Edit

#### Scenario: Off
- **WHEN** the phone screens are off, or the window is 768 px wide
- **THEN** the Habits screen is the desktop screen

### Requirement: Today's progress on the Habits screen
While Habits is on, the Habits screen's header SHALL read how many of the habits due on the chosen day are kept, "3 of 5 today" for today, counting each non-graduated habit whose day is due, done, the tiny version, partial or missed (a skipped day is a rest, and a target habit counts only until its period is met or when kept that day), and as kept the done and tiny days. With no habit due the line SHALL not be shown. It SHALL be derived from the device's rows, offline too.

#### Scenario: Halfway through the day
- **WHEN** Run, Stretch and Read are due today and Run is checked in
- **THEN** the header reads "1 of 3 today"

#### Scenario: Nothing due
- **WHEN** the only habit is Run on `every mon, wed, fri` and today is Tuesday
- **THEN** no progress line is shown

### Requirement: Taking back today's check-in
While Habits is on, the check control of a habit kept today (its row's button, the phone ring, the habit page's Done today and the ring in Today's strip) SHALL take back today's check-in with one Undo: today's record is removed and, when the habit had moved past today and no later day has been recorded since, the habit is due today again with its time, start and deadline moved alike. An amount habit's control SHALL keep adding its step. The control SHALL be a toggle that reads as pressed while the habit is kept today and keeps its name; Space on a kept row SHALL take back as the button does. The writes SHALL be ordinary field operations that work offline and converge as any edit.

#### Scenario: A mistaken tap
- **WHEN** the person checks in Read, the toast has gone, and they press Read's check button again
- **THEN** today's record of Read is gone, Read is due today again and the thread shows today as today

#### Scenario: An amount
- **WHEN** Water has reached 8 of 8 glasses and the person presses its button
- **THEN** a glass is added, as before

### Requirement: Skip this day
While Habits is on, a habit's row menu, the phone row's sheet and the habit page's menu SHALL offer **Skip this day** when its current occurrence is due today or earlier and is not kept, unless the habit has a target or an amount. It SHALL skip the current occurrence exactly as Skip does in a repeating task's menu, keeping the streak, with one Undo, offline too.

#### Scenario: A rest day
- **WHEN** the person chooses Skip this day on Run on a Wednesday
- **THEN** Wednesday reads skipped, Run's streak holds, and Run is due on Friday

#### Scenario: Not for a target
- **WHEN** the person opens Gym's menu, "3 times a week"
- **THEN** Skip this day is not offered

### Requirement: A reminder in the habit form
The habit form SHALL have **Remind me at**, an optional time. Saving a time SHALL set the habit's due time and one reminder at that time on every scheduled day, in the form's one batch with one Undo, with an id derived from the habit so two devices setting it offline end with one reminder. The field SHALL show the habit's due time when the habit has a reminder at that time. Clearing it SHALL remove that reminder and the due time. It SHALL work offline, on an end-to-end encrypted account too.

#### Scenario: Remind at half past seven
- **WHEN** the person sets Remind me at 07:30 on Stretch and saves
- **THEN** Stretch is due at 07:30 and reminds at 07:30 each day, and Undo removes both

#### Scenario: Two devices
- **WHEN** two offline devices each set Remind me at on Stretch and then sync
- **THEN** Stretch has one reminder

#### Scenario: Clear it
- **WHEN** the person clears Remind me at on Stretch and saves
- **THEN** Stretch has no reminder and no due time

### Requirement: A habit's year
While Habits is on, a habit's page SHALL show, under the month history, its last 53 weeks as a heatmap in the habit's colour, as Statistics shows a year of done tasks: weeks as columns from the first day of the week, newest last, the month names where a month starts, a sideways scroll on a narrow screen that opens on the current week, and the keyboard and names of that heatmap. Each day SHALL be drawn by its state, differing by shape as well as colour, and named with its date and state. The heatmap's accessible name SHALL summarise it ("140 of 160 scheduled days kept in the last 53 weeks"). The month history SHALL draw kept days in the habit's colour, and below 640 px SHALL fill the page's width with cells of at least 40 px. Both SHALL render from the device's rows, offline too.

#### Scenario: Months of reading
- **WHEN** the person opens Read, kept since June, on a 1280 px window
- **THEN** the page shows 53 weeks with June to November filled in Read's colour

#### Scenario: On a phone
- **WHEN** the same page is open at 360 px
- **THEN** the month grid fills the width and the heatmap shows the current week, the earlier weeks a sideways scroll away

#### Scenario: A day by keyboard
- **WHEN** a keyboard user moves into the heatmap and presses the left arrow
- **THEN** the day before today is focused and named with its date and state

### Requirement: The week board
While Habits is on, the Habits screen from 640 px up SHALL use the width of the window and show its open habits as a week board: a column per day of the seven days ending on the logical today, headed with the weekday and the date and today marked, and per habit one row with its colour, title, anchor and measure, a mark per day, its current streak and its menu, in the groups of the part of the day. A day's mark SHALL draw the day's state, differing by shape as well as colour, and SHALL be named with its date and state. Today's mark SHALL check in, take back or add a step exactly as the check button does. An earlier scheduled day's mark SHALL set the day to done, or clear a done or tiny day, without moving the habit; an amount habit's mark SHALL open Set amount for that day. A day the habit does not repeat SHALL not be a control. Every change SHALL be one batch with one Undo, SHALL work offline and SHALL converge as the same change does elsewhere. Below 640 px the screen SHALL keep its rows.

#### Scenario: Tick yesterday from the board
- **WHEN** the person opens Habits at 1280 px and clicks yesterday's mark of Stretch, which was missed
- **THEN** yesterday's Stretch is done, its mark fills, Stretch is not moved, and one Undo reverts it

#### Scenario: Today on the board
- **WHEN** the person clicks today's mark of Read
- **THEN** Read is checked in for today and the mark is pressed; a second click takes the check-in back

#### Scenario: A day off
- **WHEN** Run repeats `every mon, wed, fri` and the board shows a Tuesday
- **THEN** Run's Tuesday is a small dot that cannot be pressed

#### Scenario: Narrow
- **WHEN** the window is 600 px wide with the phone screens off
- **THEN** the screen shows the habit rows, not the board

### Requirement: The week at a glance
While Habits is on and at least one habit is open, the Habits screen SHALL show above its habits a row of three tiles: **Today**, a ring and how many of today's due habits are kept; **Last 7 days**, the share of the due days of the last seven that were kept; and **Streak**, the longest current streak among the open habits, with that habit's title. A tile with nothing to count SHALL show a dash. The tiles SHALL be derived from the device's rows, offline too.

#### Scenario: A good week
- **WHEN** of 20 due days in the last seven 16 were kept, 2 of today's 4 habits are checked in, and Read runs 22 days
- **THEN** the tiles read "2 of 4", "80 %" and "22 days" with "Read"

### Requirement: A habit's page as a dashboard
While Habits is on, a habit's page SHALL show its numbers as tiles: the current streak, the best streak, the strength with a bar in the habit's colour, and the last 30 days as kept days of the due ones. It SHALL show the month, a **By weekday** chart and the year, side by side from 1024 px. The weekday chart SHALL show, per weekday from the first day of the week, the share of that weekday's due days kept in the last 12 weeks, and SHALL be readable as a list with one entry per weekday ("Monday, 9 of 12"). Everything SHALL be derived from the device's rows, offline too, and the page SHALL keep every control it had.

#### Scenario: The weak day
- **WHEN** the person opens Run, kept on most Mondays and Wednesdays and missed on most Fridays
- **THEN** the By weekday chart's Friday bar is the shortest and reads, for example, "Friday, 3 of 12"

#### Scenario: The numbers
- **WHEN** Read was kept 26 of its last 30 days and runs 22 days
- **THEN** the tiles read 22 days, the best streak, the strength and "26 of 30"
