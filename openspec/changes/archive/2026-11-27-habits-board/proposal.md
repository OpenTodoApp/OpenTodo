# Proposal

## Why

After `habits-complete` the Habits area has the data and the pieces, but on a computer it does not read as a place of its own. The owner's feedback on 2026-11-27, with a screenshot at 2000 px: the screen is a narrow list in a wide window, a young habit's row is almost empty, and a habit's page is a column of small numbers and one small month. It looks like a list of tasks with dots, not like the best part of the app.

What a habits app shows at a glance, and OpenTodo already computes, is missing from the screen: how today and the week are going, every day of the week for every habit in one place to tick, the streak, and on a habit's page which weekdays work and which do not.

## What Changes

- **The Habits screen from 640 px up is a week board.** The page uses the window's width. Above it, three tiles: **Today** (a ring and "2 of 5"), **Last 7 days** (the share of the week's due days kept) and **Streak** (the longest running streak and its habit). The board has a column per day of the last seven, headed with the weekday and the date, today marked; each habit is a row with its colour, title and facts, a large tappable mark per day, its streak with a flame, and its menu. Today's mark checks in or takes back; an earlier day's mark sets it done or clears it; an amount habit's opens Set amount for that day. Parts of the day stay as groups. Below 640 px with the phone screens off, the present rows stay.
- **A habit's page is laid out as a dashboard.** Tiles for the streak (with a flame), the best streak, the strength (with a bar in the habit's colour) and the last 30 days ("26 of 30"); the month and a new **By weekday** chart (the share of each weekday kept over the last 12 weeks) side by side from 1024 px; the year under them; the note, the tiny version and the check-ins in cards.

Out of scope: a manual order of habits, charts beyond the weekday chart, editing earlier days than the last seven from the board (the habit's page does), the phone screens (drawn by `habits-complete`), and any data change.

Advances the ROADMAP item "Habits area".

## Capabilities

### Modified Capabilities

- `habits`: the week board and its tiles on the Habits screen, and the dashboard of a habit's page with the weekday chart.

## Impact

- New: `web/src/app/habits/HabitBoard.tsx`, `HabitsOverview.tsx`, `WeekdayChart.tsx`, tests and stories; `web/src/lib/habitDay.ts` gains the week, weekday and 30-day sums.
- Changed: `HabitsScreen.tsx` (wide page, the board from 640 px), `HabitPage.tsx` (the layout), docs `habits.md` and `habit-days.md`.
- No op field, route, server change, environment variable or dependency.
