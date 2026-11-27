# Proposal

## Why

The Habits area (`habits-home`, `habit-notes`, `habits-assistant`, `habit-targets`) has the right model: forgiving numbers, a tiny version, targets, amounts, notes, numbers on the server. What it lacks is what a person expects from a habits app the moment they use one every day:

- **On a phone it is the desktop screen squeezed.** The row wraps its thread to a second line that does not line up, the check is a large ring beside a chevron, the month grid has 24 px days, and the seven small days of the thread are the only way to fix yesterday. The phone UI is on by default, so this is what most people see.
- **A check-in cannot be taken back by tapping it again.** A kept habit's button is disabled; once the Undo toast has gone, the only way back is the thread's today, which nobody finds.
- **"Skip this day" is missing.** Skipping keeps the streak and is part of the forgiving measure, yet it is offered only for past days.
- **No overview of the day or the year.** The screen does not say how today is going, and a habit's page shows one month: a person who has kept a habit for months cannot see it.
- **No reminder in the habit form.** A reminder at a time is the most common habit setting; today it means Open as a task, a due time and a reminder, three steps outside the habit.

Each is small. Together they decide whether Habits feels like a finished app or a first version, and none needs new data: everything is derived from the records that already sync.

## What Changes

- **Habits on a phone.** With the phone UI on below 768 px the Habits screen is drawn for the phone: the phone header with **New habit** in the bar, a strip of the last seven days to choose a day, and one row per habit with a 44 px ring, the title on up to two lines, one line of facts (the anchor and the measure) and the week as small marks. The ring checks in (or takes back) the chosen day; a hold opens the habit's menu as a sheet; the title opens the habit page. Choosing an earlier day shows that day's habits and lets the rings fix it.
- **The habit's page fits a phone and shows the year.** The month grid is drawn in the habit's colour and fills the width on a phone; under it, the last 53 weeks as the heatmap Statistics uses, in the habit's colour.
- **Today's progress.** The Habits screen's lead line reads "3 of 5 today" for the habits due today.
- **Take back today's check-in.** A kept habit's check button (on the row, in the phone row, on the page, in Today's strip) takes back today's check-in with one Undo: the record goes and the habit is due today again.
- **Skip this day.** The row's menu and the page's menu offer **Skip this day** for a habit due today or earlier, except target and amount habits.
- **Remind me.** The habit form has **Remind me at**, a time: the habit is due at that time and reminds at it on every scheduled day. Clearing it removes the reminder.

Out of scope, each a possible later change: swipe gestures on habit rows, a manual order of habits, habits across workspaces, widgets in the phone apps, charts beyond the year heatmap, a reminder per weekday, and the server's `log_habit` taking back today (its `clear` keeps its meaning).

Advances the ROADMAP item "Habits area" (a calm place for habits that is easy to keep and invisible while off) and "Shells that feel native" (the phone reads like an app).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `habits`: adds the phone Habits screen, today's progress, taking back a check-in, Skip this day, the year on the habit's page and the reminder in the form.

## Impact

- New: `web/src/phone/screens/PhoneHabits.tsx` (the phone screen), `web/src/app/habits/DayStrip.tsx`, `web/src/app/habits/HabitYear.tsx`, `web/src/app/habits/useHabitsModel.ts`, tests and stories.
- Changed: `web/src/app/Shell.tsx` (the phone screen while the phone UI is on), `web/src/app/habits/HabitsScreen.tsx`, `HabitRow.tsx`, `HabitPage.tsx`, `HabitForm.tsx`, `TodayStrip.tsx`, `habitUndo.ts`, `web/src/app/HabitHistory.tsx`, `web/src/app/review/charts.tsx` (the heatmap's levels), `web/src/lib/habitActions.ts` and `habitLog.ts` (taking back today, the reminder), docs `habits.md`, `habit-days.md`.
- No op field, no route, no server change, no environment variable, no dependency. The phone screen is a lazy chunk loaded only while the phone UI is on.
