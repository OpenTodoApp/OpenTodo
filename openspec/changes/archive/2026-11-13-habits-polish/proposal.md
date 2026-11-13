## Why

The owner's review of habits-home (GitHub issue 1295) found habits heavy: Today's strip draws large coloured chips with a heavy check icon under an unclear "Habits 0" heading with no way to the Habits screen; long titles wrap to two lines; a habit not due today has no check button; a habit opens the full task form and page with sections, deadlines, estimates, dependencies and the task-series note "Past occurrences take the new title…"; and "Tiny version" and "After" are not explained. Habits should feel lean, simple and nice, at the level of dedicated habit apps, before habit-targets, habit-notes and habits-assistant build on them.

## What Changes

- **Today**: the strip becomes one quiet line inside Today: a "Habits" link to the Habits screen, then each habit as a small ring and its title; the ring checks in, the title opens the habit. No group heading, count or fold; at most one line ("+N" opens Habits).
- **Rows**: every row on the Habits screen keeps its title on one line, cut with an ellipsis, with the full title in the tooltip and the accessible name; every row has a check button (a habit due later checks in early, as completing it does).
- **Habit page**: a habit opens a page of its own at `/habits/<id>`: title, how often, part of the day, anchor, tiny version, its numbers, the month history, Check in, and a menu with Edit, Graduate, Open as a task, Stop tracking and Delete. Opening a habit anywhere (search, links, the task page) shows this page; **Open as a task** shows the task page for everything else (project, labels, reminders).
- **Habit form**: New habit, Make it a habit and Edit share one lean form (title, how often, tiny version, anchor, part of the day, colour). "Tiny version" and "After" get a "?" with a short explanation in a tooltip on hover and focus.
- **Colour**: an additive task field `habit_color` (a palette colour, empty for automatic: the project's, else one from the id).
- Making a habit of a repeating task without a due date gives it its first date, so it has a check button and numbers.

## Capabilities

### New Capabilities

### Modified Capabilities
- `habits`: Habits strip in Today, Habits screen, New habit and Make it a habit, Habits in lists and the detail panel, Habit visual language; new Habit page requirement.

## Impact

- Web: `web/src/app/habits/` (TodayStrip, HabitRow, HabitForm, new HabitPage), `router.ts` (`/habits/<id>`, `/task/<id>?as=task`), `TaskPage.tsx`, `PanelHost.tsx`, `lib/habitActions.ts`.
- Server: one additive field `habit_color` in `internal/sync/ops.go` `Schema` and the generated files. No route, no migration.
- Bundle: the habit page is lazy with the Habits screen; the Today strip gets smaller. First load unchanged or lower.
