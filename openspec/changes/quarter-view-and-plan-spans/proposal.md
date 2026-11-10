# Proposal

## Why

The Calendar's range choices stop at two awkward points. Plan mode offers only 7, 14 or 21 days (`web/src/lib/plan.ts`), so a short "today and the next couple of days" look has to show seven columns, and any other length (5, 10, 30) is impossible. And the mode switch `Day | Week | Month | Plan | Year` (`web/src/app/CalendarRange.tsx`) has no quarter: going from Month straight to Year leaves the horizon that quarterly objectives (`plan-objectives`) and quarterly review intervals already use with no calendar of its own.

Issue: <https://github.com/OpenTodoApp/OpenTodo/issues/1026>.

## What Changes

- **A Quarter mode in the Calendar range switch, between Month and Plan**, at the same level as the other modes: `Day | Week | Month | Quarter | Plan | Year`. It shows the three calendar months of the quarter the anchor falls in as compact density grids (the Year view's month cell, reused), keeps the anchor date when switching modes, opens a day in Day and a month name in Month, and is remembered per device for `/calendar`. It has its own route (`/quarter[/YYYY-MM-DD]`), a `g q` shortcut, a command-palette entry and the same keyboard grid as Year with `[` / `]` stepping a quarter.
- **Two more choices in Plan's overflow menu:** `3 days` and `Custom…`. The custom value is a whole number of days from 2 to 90, entered in a small **Plan length** dialog, validated before it is saved, and shown as the checked item with its current value. The span stays a per-device `calendar.grid` preference, never synced. The page title, the column count, the projected occurrences and the week-based navigation all follow whatever span is chosen, including 3 and custom lengths.
- `GridPrefs.planDays` widens from `7 | 14 | 21` to a number in `[1, 90]`; older rows (7, 14, 21 and a missing value) keep working, anything invalid still falls back to 14.

Not **BREAKING**: no op-schema field, no API route, no new mandatory environment variable, no dependency. Both features are client-only and device-local.

## Out of scope

- Arbitrary quarter boundaries (a rolling 90 days, fiscal quarters or a configurable start month): a quarter is the calendar quarter January–March, April–June, July–September, October–December.
- Editing tasks, drag and drop, or capacity bars in Quarter: it is a read-only overview like Year; Day, Week, Month and Plan keep their editing.
- Syncing either the last-used calendar mode or the Plan span to other devices, or exposing them in the API, CLI, MCP, CalDAV, the vault or the assistant tools.
- A new "Months shown" choice, or changing Year's twelve-month grid.
- A custom span above 90 days, and changing the default span (14) or the preset order.

## Roadmap

Advances ROADMAP.md milestone 0.19 "Series and time" (its "calendar range" theme, alongside the shipped `year-view` change #557) and complements milestone 0.21 `plan-objectives` (quarterly objectives) by giving that horizon a calendar. No ROADMAP.md row is added; the change is tracked by issue #1026.

## Capabilities

### New Capabilities

- `quarter-view`: the Quarter mode — its quarter boundaries, the three months it draws, navigation, keyboard model, device memory and offline behaviour.

### Modified Capabilities

- `planner-view`: the "Plan mode" requirement's span (presets plus a custom length), and a new requirement for choosing and validating a custom span.

## Impact

- **Data model and op schema:** none. `planDays` is an existing optional number in the per-device `calendar.grid` meta row; widening its accepted range is additive on read. No op field is added, renamed or removed.
- **Sync:** nothing new is synced. Both choices are stored in device storage / the local meta row; convergence is unchanged and no conflict is possible.
- **Server:** no change; no route, no policy, no new outbound destination.
- **Web bundle:** Quarter view and its dialog are lazy chunks. The shared month-cell component moves out of `YearView.tsx` into `web/src/app/calendar/`, so the Year and Quarter chunks share one copy. The main bundle gains the `quarter` route literal, the range-switch label, the `go.quarter` and eight `quarter.*` shortcut rows, one palette row and three small calendar-page checks (about 1 KB gzip): they are the shell's route and shortcut tables and cannot load lazily. The budgets are raised on purpose to entry **145 KB** and first load **697 KB** on the merged branch (CI measured 143.4 KB and 687.5 KB), with the reasons in `web/bundle-budget.json` and in the pull request.
- **Binary / container image:** no Go change; no dependency; no image size or runtime memory change.
