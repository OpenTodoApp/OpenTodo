# Proposal

## Why

Habits are hard to start, hard to find and harsh when life gets in the way. Making one takes five steps (create a task, open it, open When, set a calendar rule, turn on **Track as a habit**); there is no way to create a habit directly; habits are ordinary rows mixed into Today, projects and Upcoming; their streak and month grid sit inside the task panel; and one missed day resets the counter to zero. The original `habits` change deferred a dedicated screen ("it can be added later without data changes") and kept backfill out of scope.

Research on habit formation points the same way. Lally's study (University College London, 2009) found that one missed day does not change how a habit forms; what hurts is giving up after a slip, which an all-or-nothing streak invites. Fogg's behaviour model favours a tiny version of a habit and an anchor in an existing routine. The CHI work on why people abandon self-tracking names the effort of logging and the guilt of a broken record. Habits should get their own calm place, be one step to start, forgive a bad day, and stay completely out of the way for people who don't want them.

## What Changes

- **A Habits switch with three states.** A synced preference: not decided (the default), on or off. Not decided keeps two quiet ways in (the existing **Track as a habit** switch and the **Habits** switch in How you work); using either turns Habits on. On shows everything below. **Off means off**: no habit screen, strip, chip, menu item or switch anywhere, habits behave as plain repeating tasks, and nothing is deleted. An account that already has a habit is on.
- **A Habits screen.** A destination in the sidebar's More group (pinnable like any other), and `g` then `Shift+H`. Each open habit is one row: its colour, title, anchor, a seven-day **thread**, a forgiving measure and a check button. Graduated habits are listed at the end.
- **Habits leave Today's task list for a strip.** While Habits is on, Today shows a compact **Habits** strip above the tasks, in day-part order, and the same rows are no longer in the task list. Nothing is shown twice.
- **One step to start.** **New habit** on the Habits screen and the command palette, and **Make it a habit** in a task's menu, open one small form: title, how often (every day, days of the week or another calendar rule), a tiny version, an anchor and a part of the day. A task without a calendar rule gets `every day`.
- **A forgiving measure.** The screen shows "6 of 7", the share of the last seven scheduled days that were kept. The habit's page adds a **strength** score that a single miss lowers only a little, the current and best streaks, and a "back on track" state after a break. Two missed days in a row thin the thread; nothing turns red.
- **A tiny version.** Each habit can have a two-minute version ("shoes on, out the door"). Logging it counts as done, and the day shows half filled. A reminder for the habit names the tiny version.
- **Fix past days.** A past scheduled day in the thread or the month grid opens Done, Tiny, Skipped or Clear. This replaces the read-only grid and drops the original non-goal.
- **Graduate a habit.** **Graduate** stops a habit that has stuck: it leaves every list, the calendar and reminders, keeps its history, and can be resumed.
- **A distinct, calm look.** Each habit takes one of the 12 palette hues; the thread, the half-filled tiny day and the check-in moment are built from the design tokens, in every theme, light and dark, with reduced motion.

Not **BREAKING**: additive fields only (`user_prefs.habits`; `task.habit_tiny`, `task.habit_anchor`, `task.habit_graduated_at`, `task.tiny`), no route, no environment variable, no change to the op log format.

Out of scope, each a change of its own: notes on each check-in and habits in note links (`habit-notes`); server-side habit numbers, assistant and MCP tools, skills and routine steps (`habits-assistant`); targets per week or month and counted amounts (`habit-targets`). Also out of scope: "don't do" habits, social or shared habits, points, badges, confetti and money at stake.

Roadmap: the new "Habits area" in ROADMAP.md; it builds on the shipped item 19 (`habits`).

## Capabilities

### New Capabilities

None. Everything extends the existing `habits` capability.

### Modified Capabilities

- `habits`: the Habits switch; the Habits screen and Today strip; one-step creation; the forgiving measure and strength; the tiny version and anchor; editing past days (the month history is no longer read-only); graduation; the visual language. The requirement "Habits in lists and the detail panel" changes because a built-in screen is now added, and "Month history" changes because past days become editable.

## Impact

- Server: `internal/sync/ops.go` (`user_prefs.habits`; `task.habit_tiny` and `task.habit_anchor` as content, `task.habit_graduated_at`, `task.tiny`; regenerated schema files); the shared availability rule that keeps a graduated habit out of reminders and projections (`internal/recurrence`, `internal/push`).
- Web: `web/src/lib/habits.ts` (the measure, strength, two-misses state, tiny days, graduation), the Habits screen and its route, the Today strip, the New habit form, the row and task-page actions, `HabitHistory.tsx` (editable days), How you work, the command palette, the sidebar's More group, the shortcut registry; the screen and the form load lazily.
- Docs: a new `docs/habits.md`; `docs/recurring-and-reminders.md`, `docs/recurrence.md`, `docs/settings-you.md`, `docs/filters.md`, `docs/keyboard.md` (generated).
- Size: the Today strip and the switch are on the first load (under 2 KB gzip); the screen, the form and the grid load with their chunk.
