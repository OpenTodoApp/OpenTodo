---
title: Recurring task rules
summary: The repeat rule grammar, how the next date is worked out, and what completing, skipping, moving or editing one occurrence does.
audience: user
section: Reference
specs: [recurring-tasks, habits]
screens: []
order: 30
---
# Recurring task rules

A task can repeat. The rule is a short English phrase stored in the task's
`recurrence` field, for example `every weekday` or `every 3 days after completion`.
The same grammar is implemented by the server (`internal/recurrence`) and the
web app (`web/src/lib/recurrence.ts`), and both are tested against one shared file
of test vectors (`web/src/lib/recurrence.vectors.json`; the projected occurrences have
their own, `web/src/lib/occurrences.vectors.json`), so every device and the
REST API compute the same dates. Every example on this page is one of those vectors.

## Grammar

```
every <pattern> [after completion] [until YYYY-MM-DD | for N times]
```

Rules are case-insensitive and extra whitespace is ignored. A rule is at most 200
characters. What gets stored is the canonical form: lowercase, single spaces,
weekday names spelled out, ordinals with the correct suffix. `Every  2nd  Tuesday`
is stored as `every 2nd tuesday`.

| Pattern | Examples | Meaning |
| --- | --- | --- |
| day, N days | `every day`, `every 3 days` | Daily, or every N days (1–999). |
| week, N weeks | `every week`, `every 2 weeks` | Every 7 × N days. |
| weekday | `every weekday` | Monday to Friday. |
| month, N months | `every month`, `every 6 months` | Same day of month; a day the month does not have becomes its last day. |
| year, N years | `every year`, `every 2 years` | Same date; 29 February becomes 28 February in common years. |
| weekday names | `every monday`, `every mon, wed, fri`, `every tuesday and thursday` | Any set of weekdays, full names or three-letter abbreviations, separated by commas or "and". |
| day of month | `every 1st`, `every 15th`, `every 31st` | That day of each month; in shorter months the last day. |
| last day | `every last day` | The last day of each month. |
| last weekday | `every last weekday` | The last Monday–Friday of each month. |
| ordinal weekday | `every 2nd tuesday`, `every first monday`, `every last friday` | 1st/first to 4th/fourth or last of that weekday in each month. |

`every 2nd` is the 2nd day of each month; `every 2nd tuesday` is the second Tuesday.

### Completion-relative rules

Add `after completion` to a day, week, month or year interval to count from the
day the task is actually completed instead of from its due date:
`every 3 days after completion`, `every week after completion`. Calendar patterns
(weekdays, days of month, ordinals) cannot be completion-relative.

### End conditions

- `until YYYY-MM-DD`: no occurrence after that date, e.g. `every day until 2026-12-31`.
- `for N times`: the series has N occurrences in total, e.g. `every weekday for 10 times`.
  Skipped occurrences do not count.

Only one end condition per rule.

## How the next occurrence is computed

All dates are floating calendar dates (`YYYY-MM-DD`), like `due` itself; the
computation never converts through a time zone, so daylight saving changes have
no effect. The due time, if any, is kept.

A [deadline](tasks-and-projects.md#deadlines) on the series moves by the same
number of days as the due date: `every monday` due 12 October with the deadline
14 October is next due 19 October with the deadline 21 October, also when an
overdue series catches up. Skipping and "this occurrence only" move it the same
way. The completed occurrence and a detached copy keep the deadline they had.
A [start date](tasks-and-projects.md#when-a-task-starts) moves the same way, so
a task deferred until two days before it is due is deferred again before the
next occurrence. **This Evening** stays on the series. Parking a repeating task
in Someday clears its due date and so ends the repetition.

- **Calendar rules**: the next occurrence is the first matching date strictly
  after the current due date. If that date is already in the past (the task was
  overdue), it is instead the first matching date after today: overdue tasks catch
  up rather than piling up, and no missed occurrences are generated. Interval rules
  keep their rhythm while catching up (`every 3 days` due on the 1st, completed on
  the 10th, moves to the 13th).
- **Completion-relative rules**: the next occurrence is counted from the local
  date of completion. `every 3 days after completion` due Monday and completed on
  Wednesday is next due Saturday; completed on the Sunday before, it is next due
  Wednesday.
- **Month ends**: `every month` due 31 January moves to 28 (or 29) February. The
  rule has no memory of the original day, so the following month is the 28th too;
  use `every 31st` or `every last day` to stay at the end of the month.
- A rule set on a task without a due date gives it one: the first matching date
  from today on.

## Completing, skipping and editing

- **Complete**: a completed copy of the current occurrence (the *occurrence
  record*) goes to Completed, and the task moves to its next occurrence. When the
  end condition is reached the task completes like any other task.
- **Skip** (`Shift+K`, or *Skip* in the detail panel): moves the task to the next
  occurrence without recording a completion. Completion-relative rules skip as if
  completed today. Skipping the last occurrence is not possible; complete or delete it.
  For a [habit](#habits), a skip also writes that day's occurrence record marked
  `skipped`, in the same batch as the move, so the history can tell a skipped day
  from a missed one. A skipped record is not a completion: it is not listed in
  Completed, does not match `completed` filters and does not count towards
  `for N times`. A task that is not a habit skips exactly as before, with no record.
- **This occurrence only** (`Shift+O`, or the button in the detail panel): writes the
  current occurrence's record, open and without a rule, and moves the series to its
  next occurrence. Edit or move the record freely: it stays the occurrence of that
  date.
- Every other edit (title, notes, project, priority, labels, due time, rule)
  applies to the series, because the series is the task. A change of the title,
  priority, labels, section, estimate, time and zone, assignee or location also
  goes to every open occurrence record that still holds the series' previous value,
  so renaming "Study" renames Wednesday's moved session but not one you renamed
  alone. Notes, dates and done or skipped records never change this way.
- **Reopen** an occurrence record and it becomes an open occurrence of its date
  again; the series is not moved back. Reopening a series that ended keeps its rule,
  so its next completion continues the schedule.

## One occurrence alone

Any occurrence from the current one on can be acted on alone, as calendars do with
"this event only": complete it early, skip it, move it to another day or time, or
edit its title, notes or anything else. Doing so writes the occurrence's *record*:
a task with the id derived from the series and the date, `series_id` set and
`occurrence_date` holding the date it stands for, even after it is moved (the
override date of [CalDAV](caldav.md#one-occurrence-alone)). The record can be open (moved or edited, still to do), done or
skipped.

- **From the calendar**: right-click a projected occurrence, long-press it, or focus
  it and press <kbd>Shift</kbd>+<kbd>F10</kbd> or the menu key: **Open**, **Complete
  this occurrence**, **Skip this occurrence** (**Skip this day** for a habit) and
  **Move to…**. Drag it with the mouse to another day in Month and Plan, or to another
  slot in Day and Week, to move this occurrence alone; a toast offers Undo. Dragging
  the series' own row still moves the series.
- **From the panel**: opening a projection opens the occurrence panel. Under the title
  a control reads **This occurrence · All occurrences**: opened from a projection it
  is on This occurrence, names the date ("Wednesday 14 October · one occurrence of a
  repeating task"), shows the series' values without editing them and offers
  **Complete**, **Skip**, **Move to…** and **Edit this occurrence**, which writes the
  record and opens it. Opened from the series row it is on All occurrences and the
  panel is the series' as before; switch to This occurrence to act on the current
  one. A record opens on This occurrence; All occurrences opens its series.
- **Deleting** an open record, or choosing to skip it, writes the skip: a record is
  never moved to the Trash by the app, because a purged record could never be
  written again. Undo right after a skip turns the record back into an open
  occurrence on its date.
- In lists a record is an ordinary task row on its own date with the repeat mark,
  whose tooltip reads "One occurrence of …".
- A viewer of a shared project sees projections and records but cannot act on them.
  A completion-relative series (`every 3 days after completion`) offers Open only:
  its later dates follow each completion.

### Exceptions

A date with a record is an *exception* of its series: no projection is drawn there,
and moving the series on (completing, skipping, This occurrence only) goes to the
first occurrence date after the current one that is not an exception. Completing
Wednesday early in a `every mon, wed, fri` series due Monday makes Monday's
completion move the series to Friday. Nothing is stored on the series: the
exceptions are read from the records, so two devices that act on different dates
offline keep both.

A device can move the series before it sees another device's record and leave it
standing on an exception date. Any device that may edit the task then moves it to
the next free date after the next sync; every device computes the same date. The
server does the same before it completes a series.

### Counting with records

`for N times` counts done records; skipped ones never count, so a skip extends the
series by one. An open record uses up one of the remaining occurrences while it is
open: the current occurrence and the projections never exceed N minus the done and
open records, and completing an open record leaves that total unchanged. `until`
bounds every date, records included.

### Reminders of one occurrence

When an occurrence is moved, edited or detached, its record gets a copy of each
relative reminder of the series ("15 minutes before"), firing from the record's own
time; the copies' ids are derived from the record and the reminder, so two devices
make one copy. Absolute and deadline reminders stay on the series.

### Projected occurrences

The calendar draws the occurrences that would follow the current one inside the days
it shows: in the [Plan](calendar-views.md#plan-the-next-two-weeks) always, and in
[Day, Week and Month](repeating-on-the-calendar.md) while
**Show repeating occurrences** is on in the calendar's menu (on by default).
[Upcoming](repeating-on-the-calendar.md) lists them for the next 14 days
when you turn on the same item in its menu (off by default, so a daily task does not
fill it). They are faint, with a dashed edge and the repeat icon, and each day's
planned total counts their estimates ("45m repeating").

They are computed on each device from the rule, the due date and the series' records,
with one calculation shared by every view and the server (`web/src/lib/occurrences.ts`,
its Go port on the server, pinned by `web/src/lib/occurrences.vectors.json`), so every
device draws the same ones, offline too. They are never written: no operation, no row,
nothing to sync. A series draws at most 31 in the days on screen. None is drawn on or
before the current occurrence, nor before today, nor on an exception date, and an
end condition stops them.

They are not selected with <kbd>j</kbd> and <kbd>k</kbd>. Tab reaches them; clicking
one or pressing <kbd>Enter</kbd> opens the occurrence panel for its date, and its menu
and a drag act on that occurrence alone (see [One occurrence alone](#one-occurrence-alone)).
Moving or completing the series row moves the projections with it. Today, projects,
labels and saved views show the current occurrence only; a moved occurrence shows on
its new date as an ordinary row.

Scripts and assistants can read the same dates: `GET /api/v1/tasks/{id}/occurrences`
([API](api.md#a-series-dates-ahead)), `ot task occurrences`
([CLI](cli.md)), and the `next_occurrences` of a repeating task in the
[AI tools](mcp.md). Scripts act on one occurrence with
`POST /api/v1/tasks/{id}/occurrences/{date}/complete` and `/skip` and
`PATCH /api/v1/tasks/{id}/occurrences/{date}` ([API](api.md#one-occurrence-alone)),
or `ot task occurrence <task> <date> complete|skip|edit`.

## Sync and convergence

The rule is stored in `task.recurrence` and occurrence records point back with
`task.series_id`, with `task.occurrence_date` naming the date they stand for (see
[sync.md](sync.md)); a record written before that field stands for its due date. An occurrence record's id is derived
from the series id and the occurrence date (SHA-256, formatted as a UUID), and
the next due date is a pure function of the rule and dates every device shares.
Two devices that complete the same occurrence offline therefore write the same
record and the same next due date, and end with one Completed entry once they
sync. A `for N times` count is the number of done and open occurrence records, so
it converges without a counter; skipped records are left out of the count on every
device and on the server. The shared fixture `web/src/lib/series.fixture.json` pins
acting on one occurrence, the jump over exceptions and the repair to the same
answers on the devices and the server.

A habit's skip writes the same record id a completion writes, with every field of
the record in one batch under one timestamp. Two devices that skip the same day
therefore end with one skipped record, and when one device completes a day while
another skips it, per-field last-writer-wins keeps the later batch whole: the day
reads as done or as skipped, never as a mix, and the streak is unbroken either
way. A completion through the REST API, CalDAV or an assistant writes the
record whole too, with `skipped: false`, so the later of a skip and a completion
of the same day wins.

Skipped a day by mistake? Set the task's date back to that day and complete it:
the completion writes the same record with `skipped: false`, so the day reads as
done. The history grid itself is read-only.

The REST API behaves the same: `PATCH /api/v1/tasks/{id}` with a non-null
`completed_at` on a recurring task records the occurrence and moves the task (see
[api.md](api.md)).

Clients older than this feature keep working: they store the new fields without
showing them and complete a recurring task as a plain completion, which is
recovered by reopening it on an updated device.

## Habits

A recurring task with a calendar rule (any rule except `after completion`) can be
tracked as a habit: turn on **Track as a habit** under the repeat rule in the
detail panel. The task stays an ordinary recurring task; the flag is the boolean
`habit` field, synced like any other. Its streaks and month history are computed
on each device from the series and its occurrence records
(`web/src/lib/habits.ts`, pinned by `web/src/lib/habits.vectors.json`); nothing
about them is stored and the server computes nothing, so two devices with the same
rows show the same numbers, offline too. A task whose rule is removed or made
completion-relative keeps the flag but shows no habit statistics until it has a
calendar rule again.

The rules:

- **Scheduled days** are the dates the rule matches plus every date that has an
  occurrence record: a record proves the day was scheduled even if the rule
  changed since. Weekday and month rules match the date itself; interval rules
  (`every day`, `every 2 weeks`, `every month`) step back from the current due
  date by the interval, months clamped to the month's length (`every month` due on
  the 31st was due on 28 February). Days before the habit's first record are not
  part of its history.
- **Done** and **skipped** days have a record. A **missed** day is a scheduled day
  before the current occurrence without one. A record counts on the date it stands
  for: Wednesday's occurrence moved to Thursday and done there marks Wednesday done,
  and Thursday stays unscheduled. An open record (moved, still to do) is pending on
  its date until it is done or skipped, and missed once the series is past it. A day
  done or skipped ahead of time shows in the grid at once and joins the streak once
  the series reaches it.
- The **current occurrence** (the task's due date) is **pending**: it never breaks
  the streak, whatever today is. Once the day has passed the streak chip says it
  is at risk.
- The **streak** counts done days walking back from the scheduled day before the
  current occurrence, until the first missed day. A skipped day keeps the chain
  without adding to it. Unscheduled days (Tuesday for `every mon, wed, fri`)
  are never missed.
- The **best** streak is the longest such run in the habit's history.

Catching up after being overdue leaves missed days, because that is what
happened: `every day` due Monday and completed on Wednesday records Monday and
moves to Thursday, so Tuesday and Wednesday read as missed and the streak starts
again. A rule change rewrites only which past days without a record read as
missed; done and skipped days stay.

With a [day start](dates-and-times.md#when-a-day-ends) after midnight, "today"
for a habit is the day you are living in. A habit due on the 14th and done at
01:30 on the 15th with a day start of 04:00 records the 14th, its usual record
(the record's day is always the occurrence's due date), counts in the streak,
and the 15th is pending and not at risk until 04:00 on the 16th.

The month grid marks each day as done (check mark), skipped (dash), missed
(dashed outline), pending (circle) or upcoming, with the date and state as each
day's accessible name ("6 October, skipped"). Arrow keys move by a day or a
week, Home and End jump to the month's first and last day, and Page Up and Page
Down change the month.

The REST API, CalDAV and assistant tools complete a habit like any recurring task,
which records a done day; the API's and CalDAV's occurrence routes can also skip a
day (`POST …/occurrences/{date}/skip`, a client's EXDATE). The API reads and writes `habit`
as a plain boolean, assistant results carry `habit: true`, and CalDAV serves a
habit as an ordinary recurring VTODO.

## Encrypted accounts

On an account with [end-to-end encryption](e2ee.md) a device encrypts the content it
copies into a record itself, because a ciphertext belongs to one task id. The server
cannot read the series' title, so the records it writes (a REST or CalDAV completion,
skip or move) carry no title or notes; the first unlocked device that syncs fills them
in from the series, encrypted for the record.

## Not covered yet

- **This and following** (changing a series from one date on) is a later change.
- A completion-relative series' future dates cannot be acted on one by one.
- Missed past occurrences (before the current one) cannot be completed later.
- A skipped occurrence is not shown anywhere apart from a habit's grid; there is no
  "restore" for it after the Undo is gone.
- Calendar sync to your own calendar keeps writing the next occurrence only.
- An older client that moves a record to the Trash frees its date until the Trash
  is emptied; once purged, that date cannot get a record again.
