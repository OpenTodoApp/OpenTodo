# Design

## Context

The Habits screen (`HabitsScreen.tsx`) builds its model inline (open habits by part of the day, graduated last) and draws `HabitRow`, a grid that puts the thread on a second line below 640 px. With the phone UI on, `PhoneChrome` gives it the phone header, and nothing else changes. The habit page (`HabitPage.tsx`) shows the month grid of `HabitHistory.tsx` with 24 px cells in the success colour. Checking in goes through `checkIn` (`lib/habitActions.ts`), which completes the current occurrence with `planActOn` and rolls the series to its next date; a past day goes through `planPastDay` (`lib/habitLog.ts`).

A day's state is already derived for any range (`habitDays`), and every write the change needs already exists as an operation: a record's `deleted_at`, the series' `due`, a `reminder` row. So the change is interface and planning only.

## Goals / Non-Goals

**Goals**

- On a phone, Habits reads and works like a habits app: one tap to check in, the day's progress, fixing yesterday without hunting for a 24 px mark.
- Every check-in can be taken back where it was made.
- A habit shows its whole year.
- A reminder is part of the habit.
- With Habits off, none of it is drawn or loaded.

**Non-Goals**

- New data or routes. Everything is derived from the rows that sync.
- Swipes on habit rows: the ring is under the thumb and the hold opens every other action; a swipe would be a third way to do the same.
- A separate phone habit page: the shared page is made to fit 360 px.

## Decisions

### D1. The phone screen

`web/src/phone/screens/PhoneHabits.tsx`, chosen by `Shell.tsx` while the phone UI is on (as `PhoneList` is), lazy. It shares the screen's model through `useHabitsModel` (`app/habits/useHabitsModel.ts`, moved out of `HabitsScreen`), so grouping, order, graduated and progress are one code path. A habit's page (`/habits/<id>`) is the shared `HabitPage` on both.

The header is `PageHeader` (drawn by `PhonePageHeader` through `PhoneChrome`), with **New habit** as an icon button in the bar (`barActions`), the progress as its lead line. Under it the day strip (D2), then the groups with `ListGroupHeader` (no bar on a phone), then the rows:

- a 44 by 56 px ring in the habit's hue at the start (the phone row's check place), filled when the chosen day is kept, half filled for the tiny version, a wedge for part of an amount, a dash for skipped, dashed when the habit is due later;
- the title on up to two lines, then one line of facts: the anchor, then the measure ("6 of 7", "3 of 8 glasses", "2 of 3 this week");
- at the end the week as seven small marks (the thread at 12 px a day, read-only: on a phone the day strip is how a day is chosen).

A tap on the ring acts (D3); a hold on the row opens the row's menu (the same items as the desktop row's menu plus Open and Edit) as a bottom sheet; a tap on the title or the facts opens the habit page. The rows draw from the same `checkStateOf` and stats as the desktop row.

### D2. The day strip

Seven buttons for the seven days ending on the logical today, each with the weekday's letter, the date and a thin ring around it filled by the share of that day's habits kept (none drawn on a day without habits). The chosen day is pressed (`aria-pressed`); the name is the full date and its count ("Tuesday 24 November, 3 of 4 kept"). It starts on today and returns to today when the logical day changes. On an earlier day the screen lists only the habits with that day in their history (an editable day of `editableDay`: done, tiny, partial, skipped, missed or a target habit's rest day), the lead line counts that day, and graduated habits are left out. Earlier than seven days is the habit page's month and the desktop thread.

### D3. What the ring does

- **Today, not kept**: check in, as the check button does (an amount habit adds its step).
- **Today, kept**: take back (D4). An amount habit keeps adding: its menu has Subtract and Set amount.
- **An earlier day**: missed, skipped or rest becomes Done; done or tiny is cleared (missed again); an amount habit's ring opens **Set amount…** for that day. Each through `planPastDay`, one Undo.

### D4. Taking back today's check-in

`planUncheck(series, tasks, today)` in `lib/habitLog.ts`: the record of today's piece (`pieceFor`) when it is live and done or tiny. It tombstones the record and, when the series has moved past today, moves the series back to today with `moveDates` so the habit is due today again, its time, start and deadline moved alike and its relative reminders following through the batch. It moves nothing when a live record of the lineage lies between today and the series' date (an early check-in of a later day was made since): then only the record goes. Null when there is nothing to take back. `uncheckToday` applies it as one batch labelled "Check-in taken back" with Undo. Every write is an existing field (`deleted_at`, `due`), so two devices converge as for any edit: a device that checks in again offline writes the same derived record id, and last writer wins per field.

The desktop row's button, the phone ring, the page's button (now "Done today", pressed, enabled) and Today's strip ring all call it on a kept habit. Each is a toggle (`aria-pressed`) that keeps its name ("Check in Read"), the WAI-ARIA way to say a button is on, so no new name is needed; an amount habit's button is not a toggle.

### D5. Skip this day

The row's menu and the page's menu add **Skip this day** when the current occurrence is due today or earlier and is not kept, and the habit has no target and no amount (a target habit has rest days, an amount habit has partial days). It is named **Skip this day**, as a habit's occurrence menu in the calendar already says, and is `actOnOccurrenceUndoable(series, null, { kind: 'skip' })`, the write Skip makes in a repeating task's menu, so the streak holds and the series rolls on.

### D6. Remind me at

The form gets **Remind me at**, a time field. Saving a time writes, in the form's one batch, the series' `due.time` and a relative reminder at 0 minutes with the id `nameId('habit-reminder', taskId)`, so two devices setting it offline end with one reminder. It shows the time of the habit's due when the habit has a live relative reminder at 0 minutes. Clearing a shown time removes that reminder and the due time; an empty field on a habit that showed none changes nothing. Habits do not get the default reminder (unchanged), so this is the one place a habit's reminder is set besides Open as a task. The reminder's text (the tiny version as its body) is unchanged.

### D7. The year

`HabitYear` under the month grid is the statistics' `Heatmap` (`app/review/charts.tsx`), so a habit's year looks and works like "A year of done tasks": 53 week columns from the week start, the month names over the weeks where a month starts, a sideways scroll on a narrow screen that opens on the current week, a keyboard grid with one stop, and each day named with its date and state in its tooltip and to a screen reader. `Heatmap` gains `levels` (the class of each level) and `legend` (off here: the states are named per day, not a scale). The levels are the habit's states in its hue: nothing (blank, upcoming, rest) sunken, missed a dashed edge, skipped a dash, the tiny version and part of an amount half filled, done solid, today a ring. The grid's name is the summary: "140 of 160 scheduled days kept in the last 53 weeks" (done, tiny and partial kept; missed not; a skip neither).

### D8. The month in the habit's colour, and on a phone

`HabitHistory` draws done days in the habit's hue (`bg-hue-solid`), the tiny version and partial days in its soft hue, so the page reads as one habit rather than the success colour. Cells are 32 px from 640 px up; below, the grid takes the width in seven equal square columns. Keyboard and names are unchanged.

### D9. Today's progress

`dayProgress(habits, rowsOf, date)`: among non-graduated open habits, those whose `date` cell is pending, done, tiny, partial or missed (a skipped day is a rest; a target habit counts only while its period is not met or it was kept that day), and of those the done and tiny ones. The header's lead line reads "{kept} of {due} today" (on an earlier day: "{kept} of {due}"). Nothing is shown when no habit is due.

### Interface budget

Desktop: no new row; the progress is the header's lead line, Skip this day a menu item, the year below the month. The year is one more horizontal scroll region only below its width, as in Statistics. Phone: the bar and the day strip are the two rows of chrome above the first habit; the large title scrolls under the bar as on every phone list. No property is added to a row (the phone row's facts are the anchor and the measure). No sidebar destination, no new scroll region, no new shortcut: the rows keep Space, Shift+Space and Enter.

### Data model

None. No op field, no migration, no server change. The reminder is an ordinary `reminder` row; taking back is `deleted_at` on a record and `due` on the series.

### Size

No dependency. `PhoneHabits` is its own lazy chunk, fetched only with the phone UI on; `DayStrip` and `HabitYear` are in the Habits chunk, which now shares the statistics' chart chunk. Measured with `node scripts/bundle-budget.mjs` against the base commit: entry chunk 95.1 KB gzip both (budget 148), first load 669.7 → 670.0 KB gzip (budget 712). The 0.3 KB is chunking, not code: `task-list/rowHold` and a parser that the phone screen now shares became chunks of their own; no habit code joined the first load.

## Risks

- **Moving the series back.** A wrong move would show a habit due on a day it is not. `planUncheck` moves only to today, only for today's own record, and only when no later record exists; tests pin the daily, weekly, target and split cases.
- **Small marks on a phone.** The week on the phone row is read-only and 12 px a day; the ring and the day strip are the controls, both at 44 px.
