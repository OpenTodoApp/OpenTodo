# Design

## Context

`useHabitsModel` (habits-complete D1) gives the open habits by part of the day, their rows and the day's progress; `habitDays` gives any range of a habit's days with their state; `habitStats` gives streaks and strength; `planPastDay` and `uncheckToday` already write every change a day's mark makes. The statistics screen has `StatTile` and the `surface-card` look. So the change draws what exists.

## Decisions

### D1. The board from 640 px

`HabitBoard` replaces the rows from 640 px up (a media query, `useMediaQuery('(min-width: 40rem)')`); below, `HabitRow` stays, and the phone UI keeps `PhoneHabits`. The page becomes `width="wide"`, the board at most 60 rem.

One CSS grid: `[habit] minmax(12rem,1fr)`, seven 44 px day columns, the streak and the menu. The header row names each day (`weekday` short, the date, today in the accent). A part of the day is a heading row across the grid. A habit row: the colour, the title (cut to one line, the full title in its name) and under it the anchor and the measure; then the seven marks; then the streak (`flame` and the number, in the habit's hue when above zero, faint at zero); then the existing check-in menu.

### D2. A day's mark

A 32 px circle in a 44 px target, drawn like the phone's ring: done filled with a check, the tiny version half, an amount its share, skipped a dash, missed a dashed edge, today's pending occurrence an outline in the hue, a target habit's rest day faint, a day the habit does not repeat a small dot and not a control. Today: `onCheck` (check in, take back, add a step). An earlier editable day: done or tiny is cleared, anything else becomes done (`pickDay`); an amount habit opens Set amount for that day. Each is one batch with one Undo, offline. Its name is the thread's day name ("Wednesday 25 November, missed"); it is a toggle (`aria-pressed`) except for an amount. Today's mark is in the tab order; earlier days are not (the row keeps Space and Enter; the habit page's month is the keyboard way to an earlier day).

### D3. The tiles

`HabitsOverview` above the board, a `StatTile` row: **Today** with a 40 px ring of kept over due and "2 of 5"; **Last 7 days**, the kept share of the due days of the last seven (`dayProgress` summed), as "78 %"; **Streak**, the longest current streak among open habits with its title as the note. A tile with nothing to count shows "–". Shown when at least one habit is open. These are content, not chrome: the header stays one row.

### D4. The habit's page

- Tiles: **Streak** (flame), **Best**, **Strength** (a 4 px bar in the hue under the number), **Last 30 days** ("26 of 30", done, tiny and partial kept over those and the missed days). A target habit's Streak counts weeks, as its stats do; an amount habit's third tile stays Strength.
- From 1024 px a two-column grid: the month on the left, **By weekday** on the right; below, the year across. Each in a `surface-card`.
- **By weekday** (`WeekdayChart`): seven bars from the week start, each the share of that weekday's due days kept in the last 12 weeks, in the hue, a day without due days drawn empty. A list with one entry per weekday ("Monday, 9 of 12") for a screen reader; the bars are decoration.
- The note, the tiny version and the anchor, and Check-ins move into cards; nothing is removed.

### Interface budget

The header stays one row; the tiles and the board are the page's content. The board shows no task property; seven day marks replace the seven-day thread. No new scroll region (the board fits from 640 px: 12 + 7 × 2.75 + 6 rem), no new shortcut.

### Data model and size

None. No dependency; the new parts are in the Habits chunk, which loads on the Habits screen only.
