# Proposal

## Why

GitHub issue [#1339](https://github.com/OpenTodoApp/OpenTodo/issues/1339): on a phone a task's title is cut after about 15 characters. At 360 px the row gives its width to the checkbox, the time, the date, the priority mark, Show details and the grip, and the title keeps one line of what is left: "Get three quotes…", "Plan the team…". A list of tasks nobody can read is the opposite of what a phone is for.

Every other row already wraps its title onto a second line before cutting it (`task-list-width`). The phone row is the one exception, kept at one line by `precision-phone` for density. Lifting the exception fixes the problem with no new rule.

## What Changes

- On a phone a row's title takes up to two lines, then ends with an ellipsis, like every other row. A title that fits on one line keeps its 44 px row; a longer one makes the row 64 px.
- The row's controls do not move or shrink: the checkbox, the time, the priority mark, the date (or the other end cell), Show details and the grip stay on the title's first line, and every touch target keeps its 44 px.
- Show full task titles keeps its meaning: off, two lines; on, the whole title.

Out of scope: the row's controls and their order (the grip, Show details, the end cell), the list's text size (`shell-touch`), the phone header (`phone-header-room`), and the lists that do not use the task row and cut titles after one line: the calendar's compact rows (Plan, Day and Week agendas), Close the day's steps, the command bar's results and the Notes page.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app, `mobile/AUDIT.md`); the web app in a phone browser gets the same rows.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: in "One row anatomy" the phone row's title takes two lines before it is cut, and its controls stay on the first line.
- `appearance-preferences`: "Full task titles preference" no longer names a one-line phone row as the default it lifts.

## Impact

- `web/src/index.css`: the phone row loses its one-line clamp; its end cell sits on the title's first line (a rule that Show full task titles already had, now the row's own).
- `web/src/app/fullTitles.test.tsx`, comments in `TaskRow` stories and `fullTitles.ts`; `docs/row-layouts.md`, `docs/interface-guide.md`.
- No script, no component, no string, no op field, no server change, no dependency. The first-load budget is unaffected (the stylesheet shrinks by a few bytes).
- Visual baselines of the phone-width row stories and screens change wherever a title is longer than one line.
